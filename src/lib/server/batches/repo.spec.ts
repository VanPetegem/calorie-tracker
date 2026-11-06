import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_INGREDIENTS } from '../../domain/constants.ts';
import type { BatchInput } from '../../schemas/batch.ts';
import {
	batchIngredients,
	batches,
	containers,
	foods,
	logEntries,
	recipes,
	type Food
} from '../db/schema.ts';
import { createFood, type FoodInsert } from '../foods/repo.ts';
import { addBatchEntry, deleteEntry } from '../log/repo.ts';
import {
	RecipeNotFoundError,
	saveRecipe,
	UnitNotAvailableError,
	UnknownFoodError
} from '../recipes/repo.ts';
import { createTestDb } from '../test/d1.ts';
import {
	activeBatches,
	BatchLoggedError,
	BatchNotFoundError,
	ContainerNotFoundError,
	deleteBatch,
	deleteContainer,
	draftFromRecipe,
	finishBatch,
	finishedBatches,
	getBatch,
	listContainers,
	reopenBatch,
	saveBatch,
	saveContainer,
	UnknownIngredientError
} from './repo.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const missingId = '019a5b2e-8f3c-7d4a-9b1e-2c3d4e5f6a7b';
const NOW = new Date('2026-11-06T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const foodInput = (overrides: Partial<FoodInsert> = {}): FoodInsert => ({
	name: 'Stew base',
	kcal: 200,
	protein: 10,
	carbs: 20,
	fat: 8,
	fiber: 2,
	...overrides
});

describe('batch repository', () => {
	let test: TestDb;
	let stew: Food;
	let rice: Food;
	let egg: Food;

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
		await test.db.delete(recipes);
		await test.db.delete(foods).where(eq(foods.source, 'custom'));
		stew = await createFood(test.db, foodInput());
		rice = await createFood(
			test.db,
			foodInput({ name: 'Rice', kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 })
		);
		egg = await createFood(
			test.db,
			foodInput({
				name: 'Egg',
				kcal: 143,
				protein: 13,
				carbs: 1,
				fat: 10,
				fiber: null,
				servingG: 50
			})
		);
	});

	/** 1000 g of stew base: 2000 kcal in 4 portions, 1600 g cooked. */
	const stewBatch = (overrides: Partial<BatchInput> = {}): BatchInput => ({
		recipeId: null,
		name: 'Stew',
		cookedOn: '2026-11-06',
		portions: 4,
		cookedWeightG: 1600,
		ingredients: [{ foodId: stew.id, amount: 1000, unit: 'g' }],
		...overrides
	});

	/** Every stored batch and batch ingredient row, to prove a rejected save wrote nothing. */
	const snapshot = async () => ({
		batches: await test.db.select().from(batches).orderBy(batches.id),
		ingredients: await test.db.select().from(batchIngredients).orderBy(batchIngredients.id)
	});

	const ctx = { today: '2026-11-06', now: NOW, timeZone: 'Europe/Zurich' };

	/** Moves a batch's created and updated times, as if it was last touched at `iso`. */
	const setTouched = (id: string, iso: string) =>
		test.d1
			.prepare('UPDATE batches SET created_at = ?1, updated_at = ?1 WHERE id = ?2')
			.bind(iso, id)
			.run();

	describe('draftFromRecipe', () => {
		it('copies the name, default portions and ingredients of the recipe', async () => {
			const recipe = await saveRecipe(test.db, {
				name: 'Chili',
				defaultPortions: 6,
				notes: null,
				ingredients: [
					{ foodId: rice.id, amount: 300, unit: 'g' },
					{ foodId: egg.id, amount: 2, unit: 'serving' }
				]
			});
			expect(await draftFromRecipe(test.db, recipe.id, '2026-11-06')).toEqual({
				recipeId: recipe.id,
				name: 'Chili',
				cookedOn: '2026-11-06',
				portions: 6,
				cookedWeightG: null,
				ingredients: [
					{ foodId: rice.id, amount: 300, unit: 'g' },
					{ foodId: egg.id, amount: 2, unit: 'serving' }
				]
			});
		});

		it('returns null for an unknown recipe', async () => {
			expect(await draftFromRecipe(test.db, missingId, '2026-11-06')).toBeNull();
		});
	});

	describe('saveBatch', () => {
		it('snapshots each ingredient from its food and sums the totals', async () => {
			const saved = await saveBatch(
				test.db,
				stewBatch({
					ingredients: [
						{ foodId: stew.id, amount: 1000, unit: 'g' },
						{ foodId: egg.id, amount: 2, unit: 'serving' }
					]
				})
			);
			expect(saved).toMatchObject({
				name: 'Stew',
				portions: 4,
				cookedWeightG: 1600,
				kcal: 2143,
				protein: 113,
				carbs: 201,
				fat: 90,
				fiber: 20,
				finishedAt: null
			});
			const detail = await getBatch(test.db, saved.id);
			expect(
				detail?.ingredients.map((i) => [
					i.name,
					i.amount,
					i.unit,
					i.grams,
					i.kcal,
					i.fiber,
					i.position
				])
			).toEqual([
				['Stew base', 1000, 'g', 1000, 200, 2, 0],
				['Egg', 2, 'serving', 100, 143, null, 1]
			]);
			expect(detail).toMatchObject({
				perPortion: { kcal: 535.8 },
				per100g: { kcal: 133.9 },
				portionsLeft: 4,
				liveEntryCount: 0
			});
		});

		it('keeps the old snapshot of an existing line and snapshots a new line from the edited food', async () => {
			const saved = await saveBatch(test.db, stewBatch());
			const [line] = (await getBatch(test.db, saved.id))!.ingredients;
			await test.db.update(foods).set({ kcal: 300, protein: 20 }).where(eq(foods.id, stew.id));
			const updated = await saveBatch(
				test.db,
				stewBatch({
					id: saved.id,
					ingredients: [
						{ id: line.id, foodId: stew.id, amount: 500, unit: 'g' },
						{ foodId: stew.id, amount: 100, unit: 'g' }
					]
				})
			);
			const detail = await getBatch(test.db, saved.id);
			expect(detail?.ingredients.map((i) => [i.id, i.amount, i.grams, i.kcal, i.protein])).toEqual([
				[line.id, 500, 500, 200, 10],
				[expect.any(String), 100, 100, 300, 20]
			]);
			expect(updated).toMatchObject({ kcal: 1300, protein: 70 });
		});

		it('prices a serving line from the serving weight it was saved with, not the food', async () => {
			const saved = await saveBatch(
				test.db,
				stewBatch({ ingredients: [{ foodId: egg.id, amount: 2, unit: 'serving' }] })
			);
			const [line] = (await getBatch(test.db, saved.id))!.ingredients;
			await test.db.update(foods).set({ servingG: 60 }).where(eq(foods.id, egg.id));
			const save = (amount: number) =>
				saveBatch(
					test.db,
					stewBatch({
						id: saved.id,
						ingredients: [{ id: line.id, foodId: egg.id, amount, unit: 'serving' }]
					})
				);
			await save(3);
			let detail = await getBatch(test.db, saved.id);
			expect(detail?.ingredients[0]).toMatchObject({ grams: 150, servingG: 50 });
			expect(detail?.kcal).toBe(214.5);
			await test.db.update(foods).set({ servingG: null }).where(eq(foods.id, egg.id));
			await save(1);
			detail = await getBatch(test.db, saved.id);
			expect(detail?.ingredients[0]).toMatchObject({ grams: 50, servingG: 50 });
		});

		it("switches an existing line's unit against the food and keeps its values per 100", async () => {
			const saved = await saveBatch(
				test.db,
				stewBatch({ ingredients: [{ foodId: egg.id, amount: 100, unit: 'g' }] })
			);
			const [line] = (await getBatch(test.db, saved.id))!.ingredients;
			await test.db.update(foods).set({ kcal: 999 }).where(eq(foods.id, egg.id));
			await saveBatch(
				test.db,
				stewBatch({
					id: saved.id,
					ingredients: [{ id: line.id, foodId: egg.id, amount: 3, unit: 'serving' }]
				})
			);
			expect((await getBatch(test.db, saved.id))?.ingredients[0]).toMatchObject({
				unit: 'serving',
				grams: 150,
				kcal: 143
			});
			const refused = saveBatch(
				test.db,
				stewBatch({
					id: saved.id,
					ingredients: [{ id: line.id, foodId: egg.id, amount: 100, unit: 'ml' }]
				})
			);
			await expect(refused).rejects.toBeInstanceOf(UnitNotAvailableError);
			await expect(refused).rejects.toMatchObject({ index: 0, message: 'Egg is measured in g' });
		});

		it('drops the lines left out and keeps the order of the input', async () => {
			const saved = await saveBatch(
				test.db,
				stewBatch({
					ingredients: [
						{ foodId: stew.id, amount: 1000, unit: 'g' },
						{ foodId: rice.id, amount: 200, unit: 'g' }
					]
				})
			);
			const [stewLine, riceLine] = (await getBatch(test.db, saved.id))!.ingredients;
			await saveBatch(
				test.db,
				stewBatch({
					id: saved.id,
					ingredients: [
						{ foodId: egg.id, amount: 1, unit: 'serving' },
						{ id: riceLine.id, foodId: rice.id, amount: 200, unit: 'g' }
					]
				})
			);
			const detail = await getBatch(test.db, saved.id);
			expect(detail?.ingredients.map((i) => [i.name, i.position])).toEqual([
				['Egg', 0],
				['Rice', 1]
			]);
			expect(detail?.ingredients.some((i) => i.id === stewLine.id)).toBe(false);
			expect(await test.db.$count(batchIngredients)).toBe(2);
		});

		it('rejects a line id of another batch and writes nothing', async () => {
			const other = await saveBatch(test.db, stewBatch({ name: 'Other' }));
			const [foreign] = (await getBatch(test.db, other.id))!.ingredients;
			const saved = await saveBatch(test.db, stewBatch());
			const before = await snapshot();
			for (const target of [saved.id, undefined]) {
				const save = saveBatch(
					test.db,
					stewBatch({
						id: target,
						name: 'Changed',
						ingredients: [
							{ foodId: rice.id, amount: 100, unit: 'g' },
							{ id: foreign.id, foodId: stew.id, amount: 5, unit: 'g' }
						]
					})
				);
				await expect(save).rejects.toBeInstanceOf(UnknownIngredientError);
				await expect(save).rejects.toMatchObject({
					ingredientId: foreign.id,
					index: 1,
					message: 'This ingredient is no longer in the batch'
				});
			}
			expect(await snapshot()).toEqual(before);
		});

		it('rejects an unknown line id, a line sent twice, and a line with another food', async () => {
			const saved = await saveBatch(test.db, stewBatch());
			const [line] = (await getBatch(test.db, saved.id))!.ingredients;
			const before = await snapshot();
			for (const ingredients of [
				[{ id: missingId, foodId: stew.id, amount: 5, unit: 'g' as const }],
				[
					{ id: line.id, foodId: stew.id, amount: 5, unit: 'g' as const },
					{ id: line.id, foodId: stew.id, amount: 5, unit: 'g' as const }
				],
				[{ id: line.id, foodId: rice.id, amount: 5, unit: 'g' as const }]
			]) {
				await expect(
					saveBatch(test.db, stewBatch({ id: saved.id, ingredients }))
				).rejects.toMatchObject({ name: 'UnknownIngredientError', index: ingredients.length - 1 });
			}
			expect(await snapshot()).toEqual(before);
		});

		it('rejects an unknown food or a serving without a serving size and writes nothing', async () => {
			const unknown = saveBatch(
				test.db,
				stewBatch({
					ingredients: [
						{ foodId: stew.id, amount: 100, unit: 'g' },
						{ foodId: missingId, amount: 100, unit: 'g' }
					]
				})
			);
			await expect(unknown).rejects.toBeInstanceOf(UnknownFoodError);
			await expect(unknown).rejects.toMatchObject({ foodId: missingId, index: 1 });
			await expect(
				saveBatch(
					test.db,
					stewBatch({ ingredients: [{ foodId: rice.id, amount: 1, unit: 'serving' }] })
				)
			).rejects.toMatchObject({
				name: 'UnitNotAvailableError',
				index: 0,
				message: 'Rice has no serving size'
			});
			expect(await snapshot()).toEqual({ batches: [], ingredients: [] });
		});

		it('validates the input itself: nutrition sent along, 0 or 101 portions, 51 ingredients', async () => {
			const tampered = [
				{ ...stewBatch(), kcal: 1 },
				stewBatch({ ingredients: [{ foodId: stew.id, amount: 1, unit: 'g', kcal: 1 } as never] }),
				stewBatch({ portions: 0 }),
				stewBatch({ portions: 101 }),
				stewBatch({
					ingredients: Array.from({ length: MAX_INGREDIENTS + 1 }, () => ({
						foodId: stew.id,
						amount: 1,
						unit: 'g' as const
					}))
				})
			] as BatchInput[];
			for (const input of tampered) {
				await expect(saveBatch(test.db, input)).rejects.toMatchObject({ name: 'ValiError' });
			}
			expect(await snapshot()).toEqual({ batches: [], ingredients: [] });
		});

		it('saves the maximum number of ingredients', async () => {
			const saved = await saveBatch(
				test.db,
				stewBatch({
					ingredients: Array.from({ length: MAX_INGREDIENTS }, (_, i) => ({
						foodId: rice.id,
						amount: i + 1,
						unit: 'g' as const
					}))
				})
			);
			expect((await getBatch(test.db, saved.id))?.ingredients.map((i) => i.amount)).toEqual(
				Array.from({ length: MAX_INGREDIENTS }, (_, i) => i + 1)
			);
		});

		it('rejects an unknown batch or recipe id and writes nothing', async () => {
			await expect(saveBatch(test.db, stewBatch({ id: missingId }))).rejects.toMatchObject({
				name: 'BatchNotFoundError',
				message: 'This batch no longer exists'
			});
			await expect(saveBatch(test.db, stewBatch({ recipeId: missingId }))).rejects.toBeInstanceOf(
				RecipeNotFoundError
			);
			expect(await snapshot()).toEqual({ batches: [], ingredients: [] });
		});

		it('fails with BatchNotFoundError when the update returns no row', async () => {
			const saved = await saveBatch(test.db, stewBatch());
			await test.db.run(
				sql.raw(
					'CREATE TRIGGER skip_batch_update BEFORE UPDATE ON batches BEGIN SELECT RAISE(IGNORE); END'
				)
			);
			try {
				await expect(saveBatch(test.db, stewBatch({ id: saved.id }))).rejects.toBeInstanceOf(
					BatchNotFoundError
				);
			} finally {
				await test.db.run(sql.raw('DROP TRIGGER skip_batch_update'));
			}
		});
	});

	describe('activeBatches and auto finish', () => {
		it('keeps a batch touched 6 days 23 hours ago and finishes one touched 7 days and 1 minute ago', async () => {
			const fresh = await saveBatch(test.db, stewBatch({ name: 'Fresh' }));
			const stale = await saveBatch(test.db, stewBatch({ name: 'Stale' }));
			await setTouched(fresh.id, ago(6 * DAY + 23 * HOUR));
			await setTouched(stale.id, ago(7 * DAY + 60 * 1000));
			expect((await activeBatches(test.db, NOW)).map((b) => b.name)).toEqual(['Fresh']);
			expect((await getBatch(test.db, stale.id))?.finishedAt).not.toBeNull();
			expect((await getBatch(test.db, fresh.id))?.finishedAt).toBeNull();
			expect((await finishedBatches(test.db)).map((b) => b.name)).toEqual(['Stale']);
		});

		it('keeps an old batch active while it was logged 2 days ago, but not for a deleted entry', async () => {
			const logged = await saveBatch(test.db, stewBatch({ name: 'Logged' }));
			const deleted = await saveBatch(test.db, stewBatch({ name: 'Deleted' }));
			for (const batch of [logged, deleted]) {
				const entry = await addBatchEntry(
					test.db,
					{ date: '2026-11-04', batchId: batch.id, amount: 1, unit: 'portion' },
					ctx
				);
				await test.db
					.update(logEntries)
					.set({ loggedAt: ago(2 * DAY) })
					.where(eq(logEntries.id, entry.id));
				await setTouched(batch.id, ago(10 * DAY));
				if (batch === deleted) await deleteEntry(test.db, entry.id);
			}
			const active = await activeBatches(test.db, NOW);
			expect(active.map((b) => [b.name, b.lastActivity, b.portionsLeft])).toEqual([
				['Logged', ago(2 * DAY), 3]
			]);
		});

		it('lists active batches newest cooked first with portions left and values per portion and 100 g', async () => {
			const older = await saveBatch(
				test.db,
				stewBatch({ name: 'Older', cookedOn: '2026-11-01', cookedWeightG: null })
			);
			await saveBatch(test.db, stewBatch({ name: 'Newer', cookedOn: '2026-11-05' }));
			await addBatchEntry(
				test.db,
				{ date: '2026-11-06', batchId: older.id, amount: 1.5, unit: 'portion' },
				ctx
			);
			const active = await activeBatches(test.db, new Date());
			expect(
				active.map((b) => [b.name, b.portionsLeft, b.perPortion.kcal, b.per100g?.kcal ?? null])
			).toEqual([
				['Newer', 4, 500, 125],
				['Older', 2.5, 500, null]
			]);
		});

		it('keeps a batch finished long ago active once it is reopened', async () => {
			const saved = await saveBatch(test.db, stewBatch());
			await finishBatch(test.db, saved.id);
			await setTouched(saved.id, ago(30 * DAY));
			await reopenBatch(test.db, saved.id);
			expect((await activeBatches(test.db, new Date())).map((b) => b.id)).toEqual([saved.id]);
		});
	});

	describe('finish, reopen and delete', () => {
		it('finishes and reopens, each idempotent, and lists finished batches newest first', async () => {
			const first = await saveBatch(test.db, stewBatch({ name: 'First' }));
			const second = await saveBatch(test.db, stewBatch({ name: 'Second' }));
			await finishBatch(test.db, first.id);
			const finishedAt = (await getBatch(test.db, first.id))?.finishedAt;
			await finishBatch(test.db, first.id);
			expect((await getBatch(test.db, first.id))?.finishedAt).toBe(finishedAt);
			await finishBatch(test.db, second.id);
			expect((await finishedBatches(test.db)).map((b) => b.name)).toEqual(['Second', 'First']);
			expect((await finishedBatches(test.db, 1)).map((b) => b.name)).toEqual(['Second']);
			await reopenBatch(test.db, first.id);
			await reopenBatch(test.db, first.id);
			expect((await activeBatches(test.db, new Date())).map((b) => b.name)).toEqual(['First']);
		});

		it('refuses to delete a batch with a live entry', async () => {
			const saved = await saveBatch(test.db, stewBatch());
			await addBatchEntry(
				test.db,
				{ date: '2026-11-06', batchId: saved.id, amount: 1, unit: 'portion' },
				ctx
			);
			const before = await snapshot();
			const refused = deleteBatch(test.db, saved.id);
			await expect(refused).rejects.toBeInstanceOf(BatchLoggedError);
			await expect(refused).rejects.toMatchObject({
				message: 'Logged batches can be finished, not deleted'
			});
			expect(await snapshot()).toEqual(before);
			expect((await getBatch(test.db, saved.id))?.liveEntryCount).toBe(1);
		});

		it('deletes a batch with only deleted entries, together with those entries and its lines', async () => {
			const saved = await saveBatch(test.db, stewBatch());
			const entry = await addBatchEntry(
				test.db,
				{ date: '2026-11-06', batchId: saved.id, amount: 1, unit: 'portion' },
				ctx
			);
			await deleteEntry(test.db, entry.id);
			await deleteBatch(test.db, saved.id);
			expect(await snapshot()).toEqual({ batches: [], ingredients: [] });
			expect(await test.db.$count(logEntries)).toBe(0);
			expect(await getBatch(test.db, saved.id)).toBeNull();
		});
	});

	describe('containers', () => {
		it('creates, lists by name, renames and deletes', async () => {
			const pot = await saveContainer(test.db, { name: 'pot', tareG: 650 });
			await saveContainer(test.db, { name: 'Box', tareG: 120 });
			expect((await listContainers(test.db)).map((c) => c.name)).toEqual(['Box', 'pot']);
			const renamed = await saveContainer(test.db, { id: pot.id, name: 'Big pot', tareG: 700 });
			expect(renamed).toMatchObject({ id: pot.id, name: 'Big pot', tareG: 700 });
			await deleteContainer(test.db, pot.id);
			expect((await listContainers(test.db)).map((c) => c.name)).toEqual(['Box']);
		});

		it('rejects an unknown container id', async () => {
			await expect(
				saveContainer(test.db, { id: missingId, name: 'Pot', tareG: 1 })
			).rejects.toBeInstanceOf(ContainerNotFoundError);
			expect(await listContainers(test.db)).toEqual([]);
		});
	});

	it('returns null for an unknown batch', async () => {
		expect(await getBatch(test.db, missingId)).toBeNull();
	});
});
