import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { saveBatch, finishBatch } from '../batches/repo.ts';
import type { AppContext } from '../context.ts';
import { createFood } from '../foods/repo.ts';
import { createTestDb } from '../test/d1.ts';
import { addBatchEntry, addQuickEntry } from './repo.ts';
import { loadDay, suggestions } from './day.ts';

describe('batches in the day data', () => {
	type TestDb = Awaited<ReturnType<typeof createTestDb>>;
	let test: TestDb;
	const NOW = new Date('2026-11-06T12:00:00.000Z');
	const ctx = { today: '2026-11-06', now: NOW, timeZone: 'Europe/Zurich' };

	beforeAll(async () => {
		test = await createTestDb();
	});
	afterAll(async () => {
		await test.dispose();
	});

	async function cook(name: string, cookedWeightG: number | null, portions = 4) {
		const food = await createFood(test.db, {
			name: `${name} base`,
			kcal: 200,
			protein: 10,
			carbs: 20,
			fat: 8,
			fiber: null
		});
		return saveBatch(test.db, {
			recipeId: null,
			name,
			cookedOn: '2026-11-06',
			portions,
			cookedWeightG,
			ingredients: [{ foodId: food.id, amount: 1000, unit: 'g' }]
		});
	}

	it('carries the active batches with their portions left, and not finished ones, in the suggestions', async () => {
		const active = await cook('Active stew', 1600);
		const done = await cook('Done stew', 1600);
		await finishBatch(test.db, done.id);
		await addBatchEntry(
			test.db,
			{ date: '2026-11-06', batchId: active.id, amount: 1.5, unit: 'portion' },
			ctx
		);
		const { batches } = await suggestions(test.db, '2026-11-06', NOW);
		expect(batches.map((batch) => batch.name)).toEqual(['Active stew']);
		expect(batches[0].portionsLeft).toBe(2.5);
	});

	it('carries the current portion weight of every batch entry of the day, finished batches included', async () => {
		const weighed = await cook('Weighed', 1600);
		const finished = await cook('Finished', 2000, 8);
		const unweighed = await cook('Unweighed', null);
		for (const batch of [weighed, finished, unweighed]) {
			await addBatchEntry(
				test.db,
				{ date: '2026-11-04', batchId: batch.id, amount: 1, unit: 'portion' },
				ctx
			);
		}
		await finishBatch(test.db, finished.id);
		await addQuickEntry(
			test.db,
			{ date: '2026-11-04', label: 'Snack', kcal: 100, protein: null, carbs: null, fat: null },
			ctx
		);
		const day = await loadDay(
			{
				...ctx,
				db: test.db
			} as AppContext,
			'2026-11-04'
		);
		expect(day.batchPortionG).toEqual({
			[weighed.id]: 400,
			[finished.id]: 250,
			[unweighed.id]: null
		});
	});

	it('has no portion weights on a day without batch entries', async () => {
		const day = await loadDay(
			{
				...ctx,
				db: test.db
			} as AppContext,
			'2019-01-01'
		);
		expect(day.batchPortionG).toEqual({});
	});
});
