import { and, asc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import * as v from 'valibot';
import { ingredientNutrients, perPortion, totals } from '../../domain/batch.ts';
import { toGrams, type Nutrients } from '../../domain/nutrition.ts';
import { RecipeInput, type IngredientInput } from '../../schemas/recipe.ts';
import type { Db } from '../db/index.ts';
import {
	foods,
	recipeIngredients,
	recipes,
	type Food,
	type Recipe,
	type RecipeIngredient
} from '../db/schema.ts';
import { newId } from '../id.ts';

export type RecipeSummary = Recipe & {
	totals: Nutrients;
	perPortion: Nutrients;
	ingredientCount: number;
};

export type RecipeDetail = RecipeSummary & {
	ingredients: (RecipeIngredient & { food: Food; nutrients: Nutrients })[];
};

/**
 * An ingredient names a food that is not in the library. Nothing was written. `index` is the ingredient's
 * position in the input, so the form can mark the line.
 */
export class UnknownFoodError extends Error {
	override readonly name = 'UnknownFoodError';
	constructor(
		readonly foodId: string,
		readonly index: number
	) {
		super('This food is no longer in your library');
	}
}

/**
 * An ingredient uses a unit its food cannot take: a serving without a serving size, or g and ml swapped. Nothing
 * was written. `index` is the ingredient's position in the input.
 */
export class UnitNotAvailableError extends Error {
	override readonly name = 'UnitNotAvailableError';
	readonly foodId: string;
	constructor(
		food: Pick<Food, 'id' | 'name' | 'nutritionBasis'>,
		readonly unit: IngredientInput['unit'],
		readonly index: number
	) {
		super(
			unit === 'serving'
				? `${food.name} has no serving size`
				: `${food.name} is measured in ${food.nutritionBasis}`
		);
		this.foodId = food.id;
	}
}

/** A save names a recipe id that does not exist. Nothing was written. */
export class RecipeNotFoundError extends Error {
	override readonly name = 'RecipeNotFoundError';
	constructor(readonly recipeId: string) {
		super('This recipe no longer exists');
	}
}

/**
 * D1 binds at most 100 values per statement and an ingredient row binds 7 (one per column), so a recipe's
 * ingredients are inserted 14 rows per statement.
 */
const INGREDIENT_ROWS_PER_INSERT = Math.floor(100 / 7);

type IngredientRow = { ingredient: RecipeIngredient; food: Food };

/**
 * Grams of an ingredient with the food as it is now. A recipe is a live template, so a serving line follows the
 * food's current serving size; when the food no longer has one, the grams saved with the recipe stand.
 */
function liveGrams({ ingredient, food }: IngredientRow): number {
	if (ingredient.unit !== 'serving' || food.servingG === null) return ingredient.grams;
	return toGrams(ingredient.amount, 'serving', food.servingG);
}

/** Ingredients with their current foods, grouped by recipe in position order. */
async function ingredientRows(db: Db, where: SQL | undefined): Promise<IngredientRow[]> {
	return db
		.select({ ingredient: recipeIngredients, food: foods })
		.from(recipeIngredients)
		.innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
		.innerJoin(foods, eq(foods.id, recipeIngredients.foodId))
		.where(where)
		.orderBy(asc(recipeIngredients.recipeId), asc(recipeIngredients.position));
}

function summarize(recipe: Recipe, rows: IngredientRow[]): RecipeSummary {
	const sum = totals(rows.map((row) => ({ per100: row.food, grams: liveGrams(row) })));
	return {
		...recipe,
		totals: sum,
		perPortion: perPortion(sum, recipe.defaultPortions),
		ingredientCount: rows.length
	};
}

/** Recipes that are not archived, by name ignoring case, with nutrition from the current foods. */
export async function listRecipes(db: Db): Promise<RecipeSummary[]> {
	const list = await db
		.select()
		.from(recipes)
		.where(isNull(recipes.archivedAt))
		.orderBy(sql`${recipes.name} collate nocase`, asc(recipes.id));
	const rows = await ingredientRows(db, isNull(recipes.archivedAt));
	const byRecipe = Map.groupBy(rows, (row) => row.ingredient.recipeId);
	return list.map((recipe) => summarize(recipe, byRecipe.get(recipe.id) ?? []));
}

/** A recipe with its ingredients in order, archived or not. Null when it does not exist. */
export async function getRecipe(db: Db, id: string): Promise<RecipeDetail | null> {
	const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
	if (!recipe) return null;
	const rows = await ingredientRows(db, eq(recipes.id, id));
	return {
		...summarize(recipe, rows),
		ingredients: rows.map((row) => {
			const grams = liveGrams(row);
			return {
				...row.ingredient,
				grams,
				food: row.food,
				nutrients: ingredientNutrients({ per100: row.food, grams })
			};
		})
	};
}

/** Gram equivalent of an ingredient amount. g and ml must match the food's basis; a serving needs a serving size. */
function gramsFor(ingredient: IngredientInput, food: Food, index: number): number {
	const fits =
		ingredient.unit === 'serving'
			? food.servingG !== null
			: ingredient.unit === food.nutritionBasis;
	if (!fits) throw new UnitNotAvailableError(food, ingredient.unit, index);
	return toGrams(ingredient.amount, ingredient.unit, food.servingG);
}

/**
 * Creates (no id) or replaces a whole recipe. Everything is checked before the first write: the input against
 * `RecipeInput`, the recipe id, every food and unit. The recipe row and its ingredients are then written in one D1
 * batch, so a failure leaves the stored recipe as it was.
 */
export async function saveRecipe(db: Db, input: RecipeInput): Promise<Recipe> {
	const parsed = v.parse(RecipeInput, input);
	if (parsed.id !== undefined) {
		const [existing] = await db
			.select({ id: recipes.id })
			.from(recipes)
			.where(eq(recipes.id, parsed.id))
			.limit(1);
		if (!existing) throw new RecipeNotFoundError(parsed.id);
	}
	const foodIds = [...new Set(parsed.ingredients.map((ingredient) => ingredient.foodId))];
	const foodById = new Map(
		(await db.select().from(foods).where(inArray(foods.id, foodIds))).map((food) => [food.id, food])
	);
	const recipeId = parsed.id ?? newId();
	const lines = parsed.ingredients.map((ingredient, position) => {
		const food = foodById.get(ingredient.foodId);
		if (!food) throw new UnknownFoodError(ingredient.foodId, position);
		return {
			id: newId(),
			recipeId,
			foodId: food.id,
			amount: ingredient.amount,
			unit: ingredient.unit,
			grams: gramsFor(ingredient, food, position),
			position
		};
	});
	const fields = {
		name: parsed.name,
		defaultPortions: parsed.defaultPortions,
		notes: parsed.notes
	};
	const writeRecipe =
		parsed.id === undefined
			? db
					.insert(recipes)
					.values({ id: recipeId, ...fields })
					.returning()
			: db.update(recipes).set(fields).where(eq(recipes.id, recipeId)).returning();
	const [[recipe]] = await db.batch([
		writeRecipe,
		db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId)),
		...chunk(lines, INGREDIENT_ROWS_PER_INSERT).map((rows) =>
			db.insert(recipeIngredients).values(rows)
		)
	]);
	// The id was checked above; a row that is gone by now (deleted in between) must not pass as saved.
	if (!recipe) throw new RecipeNotFoundError(recipeId);
	return recipe;
}

function chunk<T>(items: T[], size: number): T[][] {
	return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
		items.slice(i * size, (i + 1) * size)
	);
}

/** Hides a recipe from the list. Archiving an archived or unknown recipe does nothing. */
export async function archiveRecipe(db: Db, id: string): Promise<void> {
	await db
		.update(recipes)
		.set({ archivedAt: new Date().toISOString() })
		.where(and(eq(recipes.id, id), isNull(recipes.archivedAt)));
}

/** Undo of an archive. Restoring a live or unknown recipe does nothing. */
export async function restoreRecipe(db: Db, id: string): Promise<void> {
	await db
		.update(recipes)
		.set({ archivedAt: null })
		.where(and(eq(recipes.id, id), isNotNull(recipes.archivedAt)));
}
