import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BatchInput } from '../../schemas/batch.ts';
import { batches, containers, foods, logEntries, type Food } from '../db/schema.ts';
import { createFood } from '../foods/repo.ts';
import { addBatchEntry } from '../log/repo.ts';
import { createTestDb } from '../test/d1.ts';
import { getBatch, saveBatch } from './repo.ts';
import { deleteBatchResult, saveBatchResult, saveContainerResult } from './result.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const missingId = '019a5b2e-8f3c-7d4a-9b1e-2c3d4e5f6a7b';

describe('batch results', () => {
	let test: TestDb;
	let chicken: Food;
	let plain: Food;

	beforeAll(async () => {
		test = await createTestDb();
	});
	afterAll(async () => {
		await test.dispose();
	});
	beforeEach(async () => {
		await test.db.delete(logEntries);
		await test.db.delete(batches);
		await test.db.delete(containers);
		await test.db.delete(foods).where(eq(foods.source, 'custom'));
		chicken = await createFood(test.db, {
			name: 'Chicken',
			kcal: 165,
			protein: 31,
			carbs: 0,
			fat: 3.6
		});
		plain = await createFood(test.db, { name: 'Plain', kcal: 100, protein: 1, carbs: 1, fat: 1 });
	});

	const input = (
		ingredients: BatchInput['ingredients'],
		overrides: Partial<BatchInput> = {}
	): BatchInput => ({
		recipeId: null,
		name: 'Chicken',
		cookedOn: '2026-11-06',
		portions: 4,
		cookedWeightG: null,
		ingredients,
		...overrides
	});

	describe('saveBatchResult', () => {
		it('returns the id of the saved batch', async () => {
			const result = await saveBatchResult(
				test.db,
				input([{ foodId: chicken.id, amount: 200, unit: 'g' }])
			);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect((await getBatch(test.db, result.id))?.kcal).toBe(330);
		});

		it('reports an unknown food, a unit that does not fit and a foreign line with the index of the line', async () => {
			const other = await saveBatch(test.db, input([{ foodId: chicken.id, amount: 1, unit: 'g' }]));
			const [foreign] = (await getBatch(test.db, other.id))!.ingredients;
			const cases = [
				[
					{ foodId: missingId, amount: 1, unit: 'g' },
					'unknown_food',
					'This food is no longer in your library'
				],
				[
					{ foodId: plain.id, amount: 2, unit: 'serving' },
					'unit_not_available',
					'Plain has no serving size'
				],
				[
					{ id: foreign.id, foodId: chicken.id, amount: 1, unit: 'g' },
					'unknown_ingredient',
					'This ingredient is no longer in the batch'
				]
			] as const;
			for (const [line, reason, message] of cases) {
				const result = await saveBatchResult(
					test.db,
					input([{ foodId: chicken.id, amount: 200, unit: 'g' }, line])
				);
				expect(result).toEqual({ ok: false, reason, message, index: 1 });
			}
			expect(await test.db.$count(batches)).toBe(1);
		});

		it('answers 404 for a batch or a recipe that does not exist', async () => {
			const line = { foodId: chicken.id, amount: 200, unit: 'g' } as const;
			await expect(
				saveBatchResult(test.db, input([line], { id: missingId }))
			).rejects.toMatchObject({ status: 404, body: { message: 'This batch no longer exists' } });
			await expect(
				saveBatchResult(test.db, input([line], { recipeId: missingId }))
			).rejects.toMatchObject({ status: 404, body: { message: 'This recipe no longer exists' } });
		});
	});

	describe('deleteBatchResult', () => {
		it('deletes a batch nobody logged and reports a logged one', async () => {
			const line = { foodId: chicken.id, amount: 200, unit: 'g' } as const;
			const unlogged = await saveBatch(test.db, input([line]));
			expect(await deleteBatchResult(test.db, unlogged.id)).toEqual({ ok: true });
			expect(await getBatch(test.db, unlogged.id)).toBeNull();
			const logged = await saveBatch(test.db, input([line]));
			await addBatchEntry(
				test.db,
				{ date: '2026-11-06', batchId: logged.id, amount: 1, unit: 'portion' },
				{ today: '2026-11-06', now: new Date(), timeZone: 'Europe/Zurich' }
			);
			expect(await deleteBatchResult(test.db, logged.id)).toEqual({
				ok: false,
				reason: 'batch_logged',
				message: 'Logged batches can be finished, not deleted'
			});
		});
	});

	describe('saveContainerResult', () => {
		it('returns the saved container and answers 404 for an unknown id', async () => {
			expect(await saveContainerResult(test.db, { name: 'Pot', tareG: 650 })).toMatchObject({
				name: 'Pot',
				tareG: 650
			});
			await expect(
				saveContainerResult(test.db, { id: missingId, name: 'Pot', tareG: 650 })
			).rejects.toMatchObject({
				status: 404,
				body: { message: 'This container no longer exists' }
			});
		});
	});
});
