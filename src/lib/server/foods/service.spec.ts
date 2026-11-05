import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { foods, logEntries } from '../db/schema.ts';
import type { OffClient, OffResult, OffProductResult } from '../off/client.ts';
import { createTestDb } from '../test/d1.ts';
import { createFood, getFoodByBarcode, type MappedProduct } from './repo.ts';
import { resolveOffPick } from './service.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const BARCODE = '7610000000001';

const product: MappedProduct = {
	barcode: BARCODE,
	name: 'Muesli',
	brand: 'Bio',
	nutritionBasis: 'g',
	per100: { kcal: 380, protein: 10, carbs: 60, fat: 8, fiber: 7 },
	servingG: 50
};

function fakeOff(result: OffResult<OffProductResult>) {
	return {
		getProduct: vi.fn(async () => result),
		search: vi.fn()
	} satisfies OffClient;
}

describe('resolveOffPick', () => {
	let test: TestDb;
	beforeAll(async () => {
		test = await createTestDb();
	});
	afterAll(async () => {
		await test.dispose();
	});
	beforeEach(async () => {
		await test.db.delete(logEntries);
		await test.db.delete(foods);
	});

	it('returns the library row without calling Open Food Facts', async () => {
		const existing = await createFood(test.db, {
			name: 'My muesli',
			barcode: BARCODE,
			kcal: 400,
			protein: 9,
			carbs: 62,
			fat: 9
		});
		const off = fakeOff({ ok: false, reason: 'unavailable' });
		expect(await resolveOffPick(test.db, off, BARCODE)).toEqual(existing);
		expect(off.getProduct).not.toHaveBeenCalled();
	});

	it('fetches and caches a product missing from the library', async () => {
		const off = fakeOff({ ok: true, value: { kind: 'found', product } });
		const food = await resolveOffPick(test.db, off, BARCODE);
		expect(off.getProduct).toHaveBeenCalledWith(BARCODE);
		expect(food).toMatchObject({ source: 'off', barcode: BARCODE, name: 'Muesli', kcal: 380 });
		expect(await getFoodByBarcode(test.db, BARCODE)).toEqual(food);
	});

	it.each<OffResult<OffProductResult>>([
		{ ok: false, reason: 'unavailable' },
		{ ok: false, reason: 'rate_limited' },
		{ ok: true, value: { kind: 'not_found' } },
		{ ok: true, value: { kind: 'incomplete', barcode: BARCODE, prefill: { name: 'Muesli' } } }
	])('reports unavailable and stores nothing for %j', async (result) => {
		const off = fakeOff(result);
		expect(await resolveOffPick(test.db, off, BARCODE)).toEqual({ unavailable: true });
		expect(await getFoodByBarcode(test.db, BARCODE)).toBeNull();
	});
});
