import { normalizeBarcode, type BarcodeFormat } from '../../domain/barcode.ts';
import type { FoodInput } from '../../schemas/food.ts';
import type { Db } from '../db/index.ts';
import type { Food } from '../db/schema.ts';
import type { OffClient } from '../off/client.ts';
import { getFoodByBarcode, isStaleOffFood, upsertOffFood } from './repo.ts';

/**
 * The food for an Open Food Facts search result the user picked. The library wins: a food with the barcode is
 * returned without calling OFF. Otherwise the product is fetched again by barcode (nutrition never comes from the
 * client) and cached. OFF failing, or the product no longer being complete, gives `unavailable`.
 */
export async function resolveOffPick(
	db: Db,
	off: OffClient,
	barcode: string
): Promise<Food | { unavailable: true }> {
	const existing = await getFoodByBarcode(db, barcode);
	if (existing) return existing;
	const result = await off.getProduct(barcode);
	if (!result.ok || result.value.kind !== 'found') return { unavailable: true };
	return upsertOffFood(db, result.value.product);
}

export type BarcodeLookup =
	| { kind: 'hit'; food: Food }
	| { kind: 'miss'; barcode: string; prefill: Partial<FoodInput> }
	| { kind: 'unavailable'; barcode: string }
	| { kind: 'invalid' };

/**
 * Finds the food for a scanned or typed barcode. The library wins, archived foods included, and OFF is not called.
 * An unedited OFF food past the refresh age is returned at once and refreshed through `defer` (the platform's
 * `waitUntil`), so the scan never waits on OFF; refresh errors are swallowed. Otherwise OFF is asked: a complete
 * product is cached and returned, anything else is a `miss` (the sheet offers a prefilled form) or `unavailable`.
 */
export async function lookupBarcode(
	db: Db,
	off: OffClient,
	raw: string,
	format?: BarcodeFormat,
	defer?: (task: Promise<unknown>) => void
): Promise<BarcodeLookup> {
	const barcode = normalizeBarcode(raw, format);
	if (barcode === null) return { kind: 'invalid' };

	const existing = await getFoodByBarcode(db, barcode);
	if (existing) {
		if (defer && isStaleOffFood(existing)) defer(refreshOffFood(db, off, barcode));
		return { kind: 'hit', food: existing };
	}

	const result = await off.getProduct(barcode);
	if (!result.ok) return { kind: 'unavailable', barcode };
	switch (result.value.kind) {
		case 'found':
			return { kind: 'hit', food: await upsertOffFood(db, result.value.product) };
		case 'incomplete':
			return { kind: 'miss', barcode, prefill: result.value.prefill };
		case 'not_found':
			return { kind: 'miss', barcode, prefill: {} };
	}
}

/** Re-fetches a cached product and updates it. Never throws: it runs after the response has gone out. */
async function refreshOffFood(db: Db, off: OffClient, barcode: string): Promise<void> {
	try {
		const result = await off.getProduct(barcode);
		if (result.ok && result.value.kind === 'found') await upsertOffFood(db, result.value.product);
	} catch {
		// The stale row stays; the next scan tries again.
	}
}
