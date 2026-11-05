import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { foods, logEntries } from '../db/schema.ts';
import type { OffClient, OffResult, OffProductResult } from '../off/client.ts';
import { createTestDb } from '../test/d1.ts';
import { createFood, getFoodByBarcode, upsertOffFood, type MappedProduct } from './repo.ts';
import { lookupBarcode, resolveOffPick } from './service.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const BARCODE = '7610000000004';

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

const daysAgoIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

describe('lookupBarcode', () => {
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

	it('returns a library hit, archived included, without calling Open Food Facts', async () => {
		const existing = await createFood(test.db, {
			name: 'My muesli',
			barcode: BARCODE,
			kcal: 400,
			protein: 9,
			carbs: 62,
			fat: 9
		});
		await test.db.update(foods).set({ archivedAt: new Date().toISOString() });
		const off = fakeOff({ ok: false, reason: 'unavailable' });
		const result = await lookupBarcode(test.db, off, BARCODE);
		expect(result).toMatchObject({ kind: 'hit', food: { id: existing.id } });
		expect(off.getProduct).not.toHaveBeenCalled();
	});

	it('stores an Open Food Facts product and does not call it again', async () => {
		const off = fakeOff({ ok: true, value: { kind: 'found', product } });
		const first = await lookupBarcode(test.db, off, BARCODE);
		expect(first).toMatchObject({
			kind: 'hit',
			food: { source: 'off', barcode: BARCODE, name: 'Muesli', kcal: 380 }
		});
		const second = await lookupBarcode(test.db, off, BARCODE);
		expect(second).toEqual(first);
		expect(off.getProduct).toHaveBeenCalledTimes(1);
	});

	it('stores a found product under the normalized barcode, so the next scan hits the library', async () => {
		// OFF answers a UPC-A lookup with the 12 digit form of the code.
		const off = fakeOff({
			ok: true,
			value: { kind: 'found', product: { ...product, barcode: '036000291452' } }
		});
		const first = await lookupBarcode(test.db, off, '036000291452', 'upc_a');
		expect(first).toMatchObject({ kind: 'hit', food: { barcode: '0036000291452' } });
		const second = await lookupBarcode(test.db, off, '036000291452', 'upc_a');
		expect(second).toMatchObject({ kind: 'hit', food: { barcode: '0036000291452' } });
		expect(off.getProduct).toHaveBeenCalledTimes(1);
	});

	it('returns the last logged amount with a hit, null when the food was never logged', async () => {
		const existing = await createFood(test.db, {
			name: 'My muesli',
			barcode: BARCODE,
			kcal: 400,
			protein: 9,
			carbs: 62,
			fat: 9
		});
		const off = fakeOff({ ok: false, reason: 'unavailable' });
		expect(await lookupBarcode(test.db, off, BARCODE)).toMatchObject({ kind: 'hit', last: null });
		await test.db.insert(logEntries).values({
			id: crypto.randomUUID(),
			date: '2026-11-05',
			loggedAt: '2026-11-05T08:00:00.000Z',
			kind: 'food',
			foodId: existing.id,
			amount: 45,
			unit: 'g',
			grams: 45,
			kcal: 180,
			protein: 4,
			carbs: 28,
			fat: 4
		});
		expect(await lookupBarcode(test.db, off, BARCODE)).toMatchObject({
			kind: 'hit',
			last: { amount: 45, unit: 'g' }
		});
	});

	it('normalizes a UPC-A scan to EAN-13 before looking it up', async () => {
		const off = fakeOff({ ok: true, value: { kind: 'found', product } });
		await lookupBarcode(test.db, off, '036000291452', 'upc_a');
		expect(off.getProduct).toHaveBeenCalledWith('0036000291452');
	});

	it('gives a miss with the prefill and barcode for an incomplete product', async () => {
		const off = fakeOff({
			ok: true,
			value: { kind: 'incomplete', barcode: BARCODE, prefill: { name: 'Muesli', brand: 'Bio' } }
		});
		expect(await lookupBarcode(test.db, off, BARCODE)).toEqual({
			kind: 'miss',
			barcode: BARCODE,
			prefill: { name: 'Muesli', brand: 'Bio' }
		});
		expect(await getFoodByBarcode(test.db, BARCODE)).toBeNull();
	});

	it('gives a miss with only the barcode when Open Food Facts does not know it', async () => {
		const off = fakeOff({ ok: true, value: { kind: 'not_found' } });
		expect(await lookupBarcode(test.db, off, BARCODE)).toEqual({
			kind: 'miss',
			barcode: BARCODE,
			prefill: {}
		});
	});

	it.each<OffResult<OffProductResult>>([
		{ ok: false, reason: 'unavailable' },
		{ ok: false, reason: 'rate_limited' }
	])('gives unavailable with the barcode for %j', async (result) => {
		const off = fakeOff(result);
		expect(await lookupBarcode(test.db, off, BARCODE)).toEqual({
			kind: 'unavailable',
			barcode: BARCODE
		});
		expect(await getFoodByBarcode(test.db, BARCODE)).toBeNull();
	});

	it('gives invalid for a bad check digit or non digits, without calling Open Food Facts', async () => {
		const off = fakeOff({ ok: true, value: { kind: 'found', product } });
		expect(await lookupBarcode(test.db, off, '7610000000002')).toEqual({ kind: 'invalid' });
		expect(await lookupBarcode(test.db, off, 'abc')).toEqual({ kind: 'invalid' });
		expect(off.getProduct).not.toHaveBeenCalled();
	});

	describe('refreshing a stale food', () => {
		const refreshed: MappedProduct = {
			...product,
			per100: { kcal: 400, protein: 11, carbs: 61, fat: 9, fiber: 6 }
		};

		it('returns the stale hit at once and refreshes it through defer', async () => {
			await upsertOffFood(test.db, product);
			await test.db.update(foods).set({ fetchedAt: daysAgoIso(181) });
			let release!: () => void;
			const gate = new Promise<void>((resolve) => (release = resolve));
			const off = {
				getProduct: vi.fn(async () => {
					await gate;
					return { ok: true, value: { kind: 'found', product: refreshed } } as const;
				}),
				search: vi.fn()
			} satisfies OffClient;
			const deferred: Promise<unknown>[] = [];

			const result = await lookupBarcode(test.db, off, BARCODE, undefined, (task) =>
				deferred.push(task)
			);
			expect(result).toMatchObject({ kind: 'hit', food: { kcal: 380 } });
			expect(deferred).toHaveLength(1);
			expect((await getFoodByBarcode(test.db, BARCODE))?.kcal).toBe(380);

			release();
			await deferred[0];
			expect(off.getProduct).toHaveBeenCalledWith(BARCODE);
			expect((await getFoodByBarcode(test.db, BARCODE))?.kcal).toBe(400);
		});

		it('swallows a failing refresh', async () => {
			await upsertOffFood(test.db, product);
			await test.db.update(foods).set({ fetchedAt: daysAgoIso(181) });
			const off = {
				getProduct: vi.fn(async () => {
					throw new Error('boom');
				}),
				search: vi.fn()
			} satisfies OffClient;
			const deferred: Promise<unknown>[] = [];
			await lookupBarcode(test.db, off, BARCODE, undefined, (task) => deferred.push(task));
			await expect(deferred[0]).resolves.toBeUndefined();
			expect((await getFoodByBarcode(test.db, BARCODE))?.kcal).toBe(380);
		});

		it('does not refresh a fresh food', async () => {
			await upsertOffFood(test.db, product);
			const off = fakeOff({ ok: true, value: { kind: 'found', product: refreshed } });
			const defer = vi.fn();
			await lookupBarcode(test.db, off, BARCODE, undefined, defer);
			expect(defer).not.toHaveBeenCalled();
			expect(off.getProduct).not.toHaveBeenCalled();
		});

		it('does not refresh an edited food, however old', async () => {
			await upsertOffFood(test.db, product);
			await test.db.update(foods).set({ fetchedAt: daysAgoIso(400), editedAt: daysAgoIso(300) });
			const off = fakeOff({ ok: true, value: { kind: 'found', product: refreshed } });
			const defer = vi.fn();
			await lookupBarcode(test.db, off, BARCODE, undefined, defer);
			expect(defer).not.toHaveBeenCalled();
			expect(off.getProduct).not.toHaveBeenCalled();
		});

		it('does not refresh a custom food', async () => {
			await createFood(test.db, {
				name: 'Mine',
				barcode: BARCODE,
				kcal: 1,
				protein: 1,
				carbs: 1,
				fat: 1
			});
			const off = fakeOff({ ok: true, value: { kind: 'found', product: refreshed } });
			const defer = vi.fn();
			await lookupBarcode(test.db, off, BARCODE, undefined, defer);
			expect(defer).not.toHaveBeenCalled();
		});
	});
});
