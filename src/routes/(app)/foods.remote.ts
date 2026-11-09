import { command, query } from '$app/server';
import { waitUntil } from 'cloudflare:workers';
import * as v from 'valibot';
import { id } from '#lib/schemas/fields.ts';
import { BarcodeLookupInput, FoodInput, UpdateFoodInput } from '#lib/schemas/food.ts';
import { ReadLabelInput } from '#lib/schemas/label.ts';
import { appContext } from '#lib/server/context.ts';
import type { Food } from '#lib/server/db/schema.ts';
import {
	createFood as insertFood,
	getFood,
	getFoodByBarcode,
	searchLibrary,
	updateFood as saveFood
} from '#lib/server/foods/repo.ts';
import { lookupBarcode as findByBarcode, resolveOffPick } from '#lib/server/foods/service.ts';
import { suggestions } from '#lib/server/log/day.ts';

/*
 * Food lookups for the add sheet. Open Food Facts calls are commands, not queries: a query result is cached by
 * its argument, and an OFF search must run again each time the person asks and count against the rate limit.
 */

const searchText = v.pipe(v.string(), v.trim(), v.maxLength(100));

/** Library search (custom, cached OFF, BLV). Typing in the sheet calls it, debounced. */
export const searchFoods = query(searchText, async (q) => {
	const { db } = await appContext();
	return searchLibrary(db, q);
});

/** Open Food Facts search. The sheet calls it only when the person submits, never while typing. */
export const searchOff = command(searchText, async (q) => {
	const { off } = await appContext();
	return off.search(q);
});

/** Stores the OFF product the person picked (nutrition is fetched again server side) and returns the food. */
export const pickOff = command(
	v.pipe(v.string(), v.regex(/^\d{8,14}$/, 'Unknown barcode')),
	async (barcode) => {
		const { db, off } = await appContext();
		return resolveOffPick(db, off, barcode);
	}
);

/**
 * Finds a food by scanned or typed barcode: the library first, then Open Food Facts. A stale cached food comes
 * back at once and is refreshed after the response through the platform's `waitUntil`.
 */
export const lookupBarcode = command(BarcodeLookupInput, async ({ raw, format }) => {
	const { db, off } = await appContext();
	return findByBarcode(db, off, raw, format, waitUntil);
});

/** One food by id, for editing a logged entry. Null when it no longer exists. */
export const loadFood = command(id, async (foodId) => {
	const { db } = await appContext();
	return getFood(db, foodId);
});

/** Today, the recents, frequents and active batches, for the add sheet on pages whose own load does not carry them. */
export const loadSuggestions = command(async () => {
	const { db, today, now } = await appContext();
	return { today, ...(await suggestions(db, today, now)) };
});

/** Saving a food: the saved row, or the library food that already has the barcode (the library wins). */
export type SaveFoodResult =
	{ ok: true; food: Food } | { ok: false; reason: 'barcode_taken'; food: Food };

/** Creates a custom food. A barcode already in the library (archived foods included) is refused, never overwritten. */
export const createFood = command(FoodInput, async (input): Promise<SaveFoodResult> => {
	const { db } = await appContext();
	if (input.barcode !== null) {
		const taken = await getFoodByBarcode(db, input.barcode);
		if (taken) return { ok: false, reason: 'barcode_taken', food: taken };
	}
	return { ok: true, food: await insertFood(db, input) };
});

/** Edits any food. Editing an OFF or BLV food keeps the fix through refreshes (`edited_at`); past entries are untouched. */
export const updateFood = command(
	UpdateFoodInput,
	async ({ id: foodId, ...input }): Promise<SaveFoodResult> => {
		const { db } = await appContext();
		if (input.barcode !== null) {
			const taken = await getFoodByBarcode(db, input.barcode);
			if (taken && taken.id !== foodId) return { ok: false, reason: 'barcode_taken', food: taken };
		}
		return { ok: true, food: await saveFood(db, foodId, input) };
	}
);

/**
 * Reads kcal, macros and serving weight from a photo of a nutrition label (a resized JPEG data URI). The photo is
 * sent to the Claude API and never stored. A command, not a query: every call costs money and counts against
 * `LABEL_LIMITER`.
 */
export const readLabel = command(ReadLabelInput, async (dataUri) =>
	(await appContext()).label.read(dataUri)
);
