import type { Db } from '../db/index.ts';
import type { Food } from '../db/schema.ts';
import type { OffClient } from '../off/client.ts';
import { getFoodByBarcode, upsertOffFood } from './repo.ts';

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
