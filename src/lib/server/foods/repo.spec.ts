import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { logEntries, foods } from '../db/schema.ts';
import { createTestDb } from '../test/d1.ts';
import {
	createFood,
	frequents,
	getFood,
	getFoodByBarcode,
	recents,
	searchLibrary,
	unarchiveFood,
	updateFood,
	upsertOffFood,
	type FoodInsert,
	type MappedProduct
} from './repo.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const TODAY = '2026-11-05';

const input = (overrides: Partial<FoodInsert> = {}): FoodInsert => ({
	name: 'Oats',
	kcal: 370,
	protein: 13,
	carbs: 59,
	fat: 7,
	...overrides
});

const product = (overrides: Partial<MappedProduct> = {}): MappedProduct => ({
	barcode: '7610000000001',
	name: 'Muesli',
	brand: 'Bio',
	nutritionBasis: 'g',
	per100: { kcal: 380, protein: 10, carbs: 60, fat: 8, fiber: 7 },
	servingG: 50,
	...overrides
});

const daysAgoIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

describe('food repository', () => {
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

	const log = (
		foodId: string,
		date: string,
		loggedAt: string,
		amount = 100,
		unit: 'g' | 'ml' | 'serving' = 'g'
	) =>
		test.db.insert(logEntries).values({
			id: crypto.randomUUID(),
			date,
			loggedAt,
			kind: 'food',
			foodId,
			amount,
			unit,
			grams: amount,
			kcal: 100,
			protein: 1,
			carbs: 1,
			fat: 1
		});

	describe('createFood, getFood, getFoodByBarcode', () => {
		it('defaults the source to custom and computes search text', async () => {
			const created = await createFood(test.db, input({ name: 'Hähnchen', brand: 'Bärlauch' }));
			expect(created.source).toBe('custom');
			expect(created.searchText).toBe('hahnchen barlauch');
			expect(await getFood(test.db, created.id)).toEqual(created);
		});

		it('returns null for unknown ids and barcodes', async () => {
			expect(await getFood(test.db, 'missing')).toBeNull();
			expect(await getFoodByBarcode(test.db, '000')).toBeNull();
		});

		it('finds archived foods by barcode', async () => {
			const created = await createFood(test.db, input({ barcode: '12345678' }));
			await test.db.update(foods).set({ archivedAt: new Date().toISOString() });
			expect((await getFoodByBarcode(test.db, '12345678'))?.id).toBe(created.id);
		});
	});

	describe('searchLibrary', () => {
		it('requires every token across name and brand', async () => {
			await createFood(test.db, input({ name: 'Greek Yogurt', brand: 'Milbona' }));
			await createFood(test.db, input({ name: 'Greek Salad', brand: 'Coop' }));
			expect((await searchLibrary(test.db, 'yogurt milbona')).map((f) => f.name)).toEqual([
				'Greek Yogurt'
			]);
			expect(await searchLibrary(test.db, 'greek pizza')).toEqual([]);
		});

		it('ignores accents', async () => {
			await createFood(test.db, input({ name: 'Hähnchen' }));
			expect((await searchLibrary(test.db, 'hahnchen')).map((f) => f.name)).toEqual(['Hähnchen']);
		});

		it('treats % and _ literally, never as wildcards', async () => {
			await createFood(test.db, input({ name: '100% Juice' }));
			await createFood(test.db, input({ name: 'Rice' }));
			expect((await searchLibrary(test.db, '100%')).map((f) => f.name)).toEqual(['100% Juice']);
			expect(await searchLibrary(test.db, '%')).toEqual([]);
			expect(await searchLibrary(test.db, '_')).toEqual([]);
			expect(await searchLibrary(test.db, '')).toEqual([]);
		});

		it('hides archived foods', async () => {
			const created = await createFood(test.db, input({ name: 'Old bread' }));
			await test.db.update(foods).set({ archivedAt: new Date().toISOString() });
			expect(await searchLibrary(test.db, 'bread')).toEqual([]);
			await unarchiveFood(test.db, created.id);
			expect(await searchLibrary(test.db, 'bread')).toHaveLength(1);
			expect((await getFood(test.db, created.id))?.archivedAt).toBeNull();
		});

		it('orders by name prefix, then log count, then name', async () => {
			const wholeGrain = await createFood(test.db, input({ name: 'Whole grain bread' }));
			await createFood(test.db, input({ name: 'Bread' }));
			const breadRoll = await createFood(test.db, input({ name: 'Bread roll' }));
			await log(wholeGrain.id, TODAY, '2026-11-05T08:00:00.000Z');
			await log(wholeGrain.id, TODAY, '2026-11-05T09:00:00.000Z');
			await log(breadRoll.id, TODAY, '2026-11-05T10:00:00.000Z');
			const hits = await searchLibrary(test.db, 'bread');
			expect(hits.map((f) => [f.name, f.logCount])).toEqual([
				['Bread roll', 1],
				['Bread', 0],
				['Whole grain bread', 2]
			]);
		});

		it('respects the limit', async () => {
			for (const name of ['Apple a', 'Apple b', 'Apple c'])
				await createFood(test.db, input({ name }));
			expect(await searchLibrary(test.db, 'apple', 2)).toHaveLength(2);
		});
	});

	describe('updateFood', () => {
		const edit = {
			name: 'Porridge',
			brand: null,
			barcode: null,
			nutritionBasis: 'g' as const,
			kcal: 360,
			protein: 12,
			carbs: 60,
			fat: 6,
			fiber: null,
			servingG: null
		};

		it('recomputes search text and leaves edited_at null for custom foods', async () => {
			const created = await createFood(test.db, input());
			const updated = await updateFood(test.db, created.id, edit);
			expect(updated).toMatchObject({ name: 'Porridge', kcal: 360, searchText: 'porridge' });
			expect(updated.editedAt).toBeNull();
		});

		it('sets edited_at for foods from other sources', async () => {
			const off = await upsertOffFood(test.db, product());
			const updated = await updateFood(test.db, off.id, edit);
			expect(updated.editedAt).not.toBeNull();
			expect(updated.source).toBe('off');
		});

		it('throws for an unknown id', async () => {
			await expect(updateFood(test.db, 'missing', edit)).rejects.toThrow('Food not found');
		});
	});

	describe('upsertOffFood', () => {
		it('inserts a new OFF food keyed by barcode', async () => {
			const created = await upsertOffFood(test.db, product());
			expect(created).toMatchObject({
				source: 'off',
				sourceRef: '7610000000001',
				barcode: '7610000000001',
				name: 'Muesli',
				brand: 'Bio',
				kcal: 380,
				fiber: 7,
				servingG: 50,
				searchText: 'muesli bio'
			});
			expect(created.fetchedAt).not.toBeNull();
		});

		it('returns a library food with the same barcode unchanged', async () => {
			const custom = await createFood(test.db, input({ name: 'Mine', barcode: '7610000000001' }));
			expect(await upsertOffFood(test.db, product())).toEqual(custom);
			expect(await test.db.select().from(foods)).toHaveLength(1);
		});

		it('does not refresh a fresh OFF food', async () => {
			const first = await upsertOffFood(test.db, product());
			const again = await upsertOffFood(
				test.db,
				product({ per100: { kcal: 1, protein: 1, carbs: 1, fat: 1, fiber: null } })
			);
			expect(again).toEqual(first);
		});

		it('does not refresh an edited OFF food, however old', async () => {
			const first = await upsertOffFood(test.db, product());
			const staleFetchedAt = daysAgoIso(400);
			await test.db.update(foods).set({ fetchedAt: staleFetchedAt, editedAt: daysAgoIso(300) });
			const again = await upsertOffFood(
				test.db,
				product({ per100: { kcal: 1, protein: 1, carbs: 1, fat: 1, fiber: null } })
			);
			expect(again.kcal).toBe(first.kcal);
			expect(again.fetchedAt).toBe(staleFetchedAt);
		});

		it('refreshes a stale unedited OFF food', async () => {
			const first = await upsertOffFood(test.db, product());
			await test.db.update(foods).set({ fetchedAt: daysAgoIso(181) });
			const refreshed = await upsertOffFood(
				test.db,
				product({
					name: 'Renamed',
					per100: { kcal: 400, protein: 11, carbs: 61, fat: 9, fiber: 6 }
				})
			);
			expect(refreshed).toMatchObject({
				id: first.id,
				kcal: 400,
				protein: 11,
				fiber: 6,
				name: 'Muesli'
			});
			expect(new Date(refreshed.fetchedAt!).getTime()).toBeGreaterThan(Date.now() - 60_000);
		});

		it('keeps an OFF food fetched 179 days ago', async () => {
			await upsertOffFood(test.db, product());
			await test.db.update(foods).set({ fetchedAt: daysAgoIso(179) });
			const again = await upsertOffFood(
				test.db,
				product({ per100: { kcal: 1, protein: 1, carbs: 1, fat: 1, fiber: null } })
			);
			expect(again.kcal).toBe(380);
		});
	});

	describe('recents', () => {
		it('lists distinct foods by latest log with the last amount', async () => {
			const a = await createFood(test.db, input({ name: 'A' }));
			const b = await createFood(test.db, input({ name: 'B' }));
			await log(a.id, TODAY, '2026-11-05T08:00:00.000Z', 50, 'g');
			await log(b.id, TODAY, '2026-11-05T09:00:00.000Z', 2, 'serving');
			await log(a.id, TODAY, '2026-11-05T10:00:00.000Z', 80, 'g');
			const list = await recents(test.db);
			expect(list.map((f) => [f.name, f.lastAmount, f.lastUnit])).toEqual([
				['A', 80, 'g'],
				['B', 2, 'serving']
			]);
			expect(await recents(test.db, 1)).toHaveLength(1);
		});
	});

	describe('frequents', () => {
		it('counts entries in the last 30 days and honours exclude', async () => {
			const a = await createFood(test.db, input({ name: 'A' }));
			const b = await createFood(test.db, input({ name: 'B' }));
			const c = await createFood(test.db, input({ name: 'C' }));
			const old = await createFood(test.db, input({ name: 'Old' }));
			await log(a.id, '2026-11-01', '2026-11-01T08:00:00.000Z');
			await log(b.id, '2026-11-02', '2026-11-02T08:00:00.000Z');
			await log(b.id, '2026-11-03', '2026-11-03T08:00:00.000Z', 30, 'ml');
			await log(c.id, '2026-10-07', '2026-10-07T08:00:00.000Z');
			await log(old.id, '2026-10-06', '2026-10-06T08:00:00.000Z');
			await log(old.id, '2026-09-01', '2026-09-01T08:00:00.000Z');
			await log(old.id, '2026-09-02', '2026-09-02T08:00:00.000Z');
			const list = await frequents(test.db, TODAY);
			expect(list.map((f) => f.name)).toEqual(['B', 'A', 'C']);
			expect(list[0]).toMatchObject({ lastAmount: 30, lastUnit: 'ml' });
			expect((await frequents(test.db, TODAY, 10, [b.id])).map((f) => f.name)).toEqual(['A', 'C']);
			expect(await frequents(test.db, TODAY, 1)).toHaveLength(1);
		});
	});
});
