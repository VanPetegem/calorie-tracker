import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '../../schemas/recipe.ts';
import { foods, recipeIngredients, recipes, type Food } from '../db/schema.ts';
import { createFood, type FoodInsert } from '../foods/repo.ts';
import { createTestDb } from '../test/d1.ts';
import {
	RecipeNotFoundError,
	UnitNotAvailableError,
	UnknownFoodError,
	archiveRecipe,
	getRecipe,
	listRecipes,
	restoreRecipe,
	saveRecipe
} from './repo.ts';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const missingId = '019a5b2e-8f3c-7d4a-9b1e-2c3d4e5f6a7b';

const foodInput = (overrides: Partial<FoodInsert> = {}): FoodInsert => ({
	name: 'Chicken',
	kcal: 165,
	protein: 31,
	carbs: 0,
	fat: 3.6,
	...overrides
});

describe('recipe repository', () => {
	let test: TestDb;
	let chicken: Food;
	let rice: Food;
	let egg: Food;
	let milk: Food;

	beforeAll(async () => {
		test = await createTestDb();
	});
	afterAll(async () => {
		await test.dispose();
	});
	beforeEach(async () => {
		await test.db.delete(recipes);
		await test.db.delete(foods).where(eq(foods.source, 'custom'));
		chicken = await createFood(test.db, foodInput());
		rice = await createFood(
			test.db,
			foodInput({ name: 'Rice', kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 })
		);
		egg = await createFood(
			test.db,
			foodInput({ name: 'Egg', kcal: 143, protein: 13, carbs: 1, fat: 10, servingG: 50 })
		);
		milk = await createFood(
			test.db,
			foodInput({
				name: 'Milk',
				nutritionBasis: 'ml',
				kcal: 64,
				protein: 3.4,
				carbs: 4.8,
				fat: 3.5
			})
		);
	});

	const chickenAndRice = (overrides: Partial<RecipeInput> = {}): RecipeInput => ({
		name: 'Chicken and rice',
		defaultPortions: 4,
		notes: null,
		ingredients: [
			{ foodId: chicken.id, amount: 200, unit: 'g' },
			{ foodId: rice.id, amount: 100, unit: 'g' }
		],
		...overrides
	});

	/** Every stored recipe and ingredient row, to prove a rejected save wrote nothing. */
	const snapshot = async () => ({
		recipes: await test.db.select().from(recipes).orderBy(recipes.id),
		ingredients: await test.db.select().from(recipeIngredients).orderBy(recipeIngredients.id)
	});

	it('computes totals and per portion from the current foods', async () => {
		const saved = await saveRecipe(test.db, chickenAndRice());
		const detail = await getRecipe(test.db, saved.id);
		expect(detail).toMatchObject({
			name: 'Chicken and rice',
			ingredientCount: 2,
			totals: { kcal: 460, protein: 64.7, fiber: 0.4 },
			perPortion: { kcal: 115, protein: 16.2, fiber: 0.1 }
		});
		expect(detail?.ingredients.map((i) => [i.food.name, i.nutrients.kcal])).toEqual([
			['Chicken', 330],
			['Rice', 130]
		]);
		const [summary] = await listRecipes(test.db);
		expect(summary).toMatchObject({ id: saved.id, ingredientCount: 2, totals: { kcal: 460 } });
		expect(summary.perPortion.kcal).toBe(115);
	});

	it('follows a food edit in the recipe totals', async () => {
		const saved = await saveRecipe(test.db, chickenAndRice());
		await test.db.update(foods).set({ kcal: 200 }).where(eq(foods.id, chicken.id));
		expect((await getRecipe(test.db, saved.id))?.totals.kcal).toBe(530);
	});

	it('replaces the ingredients on save and keeps their order', async () => {
		const saved = await saveRecipe(test.db, chickenAndRice());
		const updated = await saveRecipe(
			test.db,
			chickenAndRice({
				id: saved.id,
				name: 'Rice bowl',
				defaultPortions: 2,
				ingredients: [
					{ foodId: rice.id, amount: 150, unit: 'g' },
					{ foodId: egg.id, amount: 2, unit: 'serving' },
					{ foodId: rice.id, amount: 50, unit: 'g' }
				]
			})
		);
		expect(updated).toMatchObject({ id: saved.id, name: 'Rice bowl', defaultPortions: 2 });
		const detail = await getRecipe(test.db, saved.id);
		expect(
			detail?.ingredients.map((i) => [i.food.name, i.amount, i.unit, i.grams, i.position])
		).toEqual([
			['Rice', 150, 'g', 150, 0],
			['Egg', 2, 'serving', 100, 1],
			['Rice', 50, 'g', 50, 2]
		]);
		expect(await test.db.$count(recipeIngredients)).toBe(3);
	});

	it('creates a new recipe with its own id', async () => {
		const first = await saveRecipe(test.db, chickenAndRice());
		const second = await saveRecipe(test.db, chickenAndRice());
		expect(second.id).not.toBe(first.id);
		expect(await test.db.$count(recipes)).toBe(2);
	});

	it('rejects an id that does not exist and writes nothing', async () => {
		await expect(saveRecipe(test.db, chickenAndRice({ id: missingId }))).rejects.toBeInstanceOf(
			RecipeNotFoundError
		);
		expect(await snapshot()).toEqual({ recipes: [], ingredients: [] });
	});

	it('leaves the stored recipe unchanged when the third ingredient is an unknown food', async () => {
		const saved = await saveRecipe(test.db, chickenAndRice());
		const before = await snapshot();
		const save = saveRecipe(
			test.db,
			chickenAndRice({
				id: saved.id,
				name: 'Changed',
				ingredients: [
					{ foodId: rice.id, amount: 300, unit: 'g' },
					{ foodId: chicken.id, amount: 100, unit: 'g' },
					{ foodId: missingId, amount: 100, unit: 'g' }
				]
			})
		);
		await expect(save).rejects.toBeInstanceOf(UnknownFoodError);
		await expect(save).rejects.toMatchObject({ foodId: missingId });
		expect(await snapshot()).toEqual(before);
	});

	it('rejects a serving of a food without a serving size and writes nothing', async () => {
		const save = saveRecipe(
			test.db,
			chickenAndRice({ ingredients: [{ foodId: rice.id, amount: 1, unit: 'serving' }] })
		);
		await expect(save).rejects.toBeInstanceOf(UnitNotAvailableError);
		await expect(save).rejects.toMatchObject({ foodId: rice.id, unit: 'serving' });
		expect(await snapshot()).toEqual({ recipes: [], ingredients: [] });
	});

	it('rejects a unit that does not match the food basis', async () => {
		await expect(
			saveRecipe(
				test.db,
				chickenAndRice({ ingredients: [{ foodId: milk.id, amount: 200, unit: 'g' }] })
			)
		).rejects.toMatchObject({ name: 'UnitNotAvailableError', foodId: milk.id, unit: 'g' });
		const saved = await saveRecipe(
			test.db,
			chickenAndRice({ ingredients: [{ foodId: milk.id, amount: 200, unit: 'ml' }] })
		);
		expect((await getRecipe(test.db, saved.id))?.totals.kcal).toBe(128);
	});

	it('rejects a tampered input and writes nothing', async () => {
		const tampered = [
			chickenAndRice({ defaultPortions: 0 }),
			chickenAndRice({ defaultPortions: 101 }),
			chickenAndRice({
				ingredients: Array.from({ length: 51 }, () => ({
					foodId: rice.id,
					amount: 10,
					unit: 'g' as const
				}))
			}),
			{ ...chickenAndRice(), kcal: 1 } as RecipeInput
		];
		for (const input of tampered) {
			await expect(saveRecipe(test.db, input)).rejects.toMatchObject({ name: 'ValiError' });
		}
		expect(await snapshot()).toEqual({ recipes: [], ingredients: [] });
	});

	it('lists recipes by name regardless of case', async () => {
		for (const name of ['chili', 'Banana bread', 'apple pie']) {
			await saveRecipe(test.db, chickenAndRice({ name }));
		}
		expect((await listRecipes(test.db)).map((r) => r.name)).toEqual([
			'apple pie',
			'Banana bread',
			'chili'
		]);
	});

	it('hides an archived recipe from the list until it is restored', async () => {
		const saved = await saveRecipe(test.db, chickenAndRice());
		await archiveRecipe(test.db, saved.id);
		await archiveRecipe(test.db, saved.id);
		expect(await listRecipes(test.db)).toEqual([]);
		expect((await getRecipe(test.db, saved.id))?.archivedAt).not.toBeNull();
		await restoreRecipe(test.db, saved.id);
		await restoreRecipe(test.db, saved.id);
		expect((await listRecipes(test.db)).map((r) => r.id)).toEqual([saved.id]);
	});

	it('returns null for an unknown recipe', async () => {
		expect(await getRecipe(test.db, missingId)).toBeNull();
	});
});
