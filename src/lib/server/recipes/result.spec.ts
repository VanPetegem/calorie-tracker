import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { RecipeInput } from '../../schemas/recipe.ts';
import { foods, recipes, type Food } from '../db/schema.ts';
import { createFood } from '../foods/repo.ts';
import { createTestDb } from '../test/d1.ts';
import { getRecipe } from './repo.ts';
import { saveRecipeResult } from './result.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const missingId = '019a5b2e-8f3c-7d4a-9b1e-2c3d4e5f6a7b';

describe('saveRecipeResult', () => {
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
		await test.db.delete(recipes);
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

	const input = (ingredients: RecipeInput['ingredients']): RecipeInput => ({
		name: 'Chicken rice',
		defaultPortions: 4,
		notes: null,
		ingredients
	});

	it('returns the id of the saved recipe', async () => {
		const result = await saveRecipeResult(
			test.db,
			input([{ foodId: chicken.id, amount: 200, unit: 'g' }])
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect((await getRecipe(test.db, result.id))?.name).toBe('Chicken rice');
	});

	it('reports an unknown food with the index of its line and writes nothing', async () => {
		const result = await saveRecipeResult(
			test.db,
			input([
				{ foodId: chicken.id, amount: 200, unit: 'g' },
				{ foodId: missingId, amount: 1, unit: 'g' }
			])
		);
		expect(result).toEqual({
			ok: false,
			reason: 'unknown_food',
			message: 'This food is no longer in your library',
			index: 1
		});
		expect(await test.db.select().from(recipes)).toHaveLength(0);
	});

	it('reports a unit the food cannot take with the index of its line', async () => {
		const result = await saveRecipeResult(
			test.db,
			input([{ foodId: plain.id, amount: 2, unit: 'serving' }])
		);
		expect(result).toEqual({
			ok: false,
			reason: 'unit_not_available',
			message: 'Plain has no serving size',
			index: 0
		});
	});

	it('answers 404 for a recipe that does not exist', async () => {
		await expect(
			saveRecipeResult(test.db, {
				...input([{ foodId: chicken.id, amount: 200, unit: 'g' }]),
				id: missingId
			})
		).rejects.toMatchObject({ status: 404, body: { message: 'This recipe no longer exists' } });
	});
});
