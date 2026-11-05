import { command, query } from '$app/server';
import * as v from 'valibot';
import { id } from '#lib/schemas/fields.ts';
import { appContext } from '#lib/server/context.ts';
import { frequents, getFood, recents, searchLibrary } from '#lib/server/foods/repo.ts';
import { resolveOffPick } from '#lib/server/foods/service.ts';

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

/** One food by id, for editing a logged entry. Null when it no longer exists. */
export const loadFood = command(id, async (foodId) => {
	const { db } = await appContext();
	return getFood(db, foodId);
});

/** Today and the recents and frequents, for the add sheet on pages whose own load does not carry them. */
export const loadSuggestions = command(async () => {
	const { db, today } = await appContext();
	const recentFoods = await recents(db);
	const frequentFoods = await frequents(
		db,
		today,
		undefined,
		recentFoods.map((food) => food.id)
	);
	return { today, recents: recentFoods, frequents: frequentFoods };
});
