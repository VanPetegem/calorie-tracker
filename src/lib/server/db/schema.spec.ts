import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../test/d1.ts';
import { foods, recipeIngredients, recipes, settings, user } from './schema.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const food = (overrides: Partial<typeof foods.$inferInsert> = {}): typeof foods.$inferInsert => ({
	id: crypto.randomUUID(),
	source: 'custom',
	name: 'Oats',
	searchText: 'oats',
	kcal: 370,
	protein: 13,
	carbs: 59,
	fat: 7,
	...overrides
});

/** Drizzle wraps the D1 error; the constraint name is in the cause. */
const failedOn = (constraint: string) => ({
	cause: { message: expect.stringContaining(constraint) }
});

describe('schema constraints', () => {
	let test: TestDb;
	beforeEach(async () => {
		test = await createTestDb();
	});
	afterEach(async () => {
		await test.dispose();
	});

	it('rejects a second food with the same barcode', async () => {
		await test.db.insert(foods).values(food({ barcode: '7610000000001' }));
		await expect(
			test.db.insert(foods).values(food({ barcode: '7610000000001' }))
		).rejects.toMatchObject(failedOn('UNIQUE constraint failed: foods.barcode'));
	});

	it('rejects a second food with the same source and source ref', async () => {
		await test.db.insert(foods).values(food({ source: 'blv', sourceRef: '123' }));
		await expect(
			test.db.insert(foods).values(food({ source: 'blv', sourceRef: '123' }))
		).rejects.toMatchObject(failedOn('UNIQUE constraint failed: foods.source, foods.source_ref'));
	});

	it('allows several custom foods without a barcode or source ref', async () => {
		await test.db.insert(foods).values([food(), food()]);
		// The BLV migration seeds generic foods; only the custom ones are ours.
		expect(await test.db.$count(foods, eq(foods.source, 'custom'))).toBe(2);
	});

	it('rejects settings with a manual target but no weight', async () => {
		await expect(
			test.db.insert(settings).values({ id: 1, manualTargetKcal: 2800 })
		).rejects.toMatchObject(failedOn('CHECK constraint failed: settings_manual_target_pair'));
	});

	it('rejects a second settings row', async () => {
		await expect(test.db.insert(settings).values({ id: 2 })).rejects.toMatchObject(
			failedOn('CHECK constraint failed: settings_single_row')
		);
	});

	it('accepts settings with both manual values or neither', async () => {
		await test.db.insert(settings).values({ id: 1 });
		await test.db.update(settings).set({ manualTargetKcal: 2800, manualWeightKg: 72.5 });
		const [row] = await test.db.select().from(settings);
		expect(row).toMatchObject({
			timezone: 'Europe/Zurich',
			manualTargetKcal: 2800,
			manualWeightKg: 72.5
		});
	});

	it('keeps the single account trigger', async () => {
		const now = new Date();
		const person = { name: 'A', emailVerified: false, createdAt: now, updatedAt: now };
		await test.db.insert(user).values({ ...person, id: 'u1', email: 'a@example.com' });
		await expect(
			test.db.insert(user).values({ ...person, id: 'u2', email: 'b@example.com' })
		).rejects.toMatchObject(failedOn('sign up is closed'));
	});

	it('rejects a recipe with zero default portions', async () => {
		await expect(
			test.db.insert(recipes).values({ id: crypto.randomUUID(), name: 'Chili', defaultPortions: 0 })
		).rejects.toMatchObject(failedOn('CHECK constraint failed: recipes_default_portions_positive'));
	});

	describe('recipe ingredients', () => {
		const recipeId = crypto.randomUUID();
		const oats = food();
		beforeEach(async () => {
			await test.db.insert(foods).values(oats);
			await test.db.insert(recipes).values({ id: recipeId, name: 'Porridge', defaultPortions: 2 });
			await test.db.insert(recipeIngredients).values({
				id: crypto.randomUUID(),
				recipeId,
				foodId: oats.id,
				amount: 80,
				unit: 'g',
				grams: 80,
				position: 0
			});
		});

		it('are deleted with their recipe', async () => {
			await test.db.delete(recipes).where(eq(recipes.id, recipeId));
			expect(await test.db.$count(recipeIngredients)).toBe(0);
		});

		it('keep their food from being deleted', async () => {
			await expect(test.db.delete(foods).where(eq(foods.id, oats.id))).rejects.toMatchObject(
				failedOn('FOREIGN KEY constraint failed')
			);
		});
	});
});
