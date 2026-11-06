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

/** An ingredient names a food that is not in the library. Nothing was written. */
export class UnknownFoodError extends Error {
	override readonly name = 'UnknownFoodError';
	constructor(readonly foodId: string) {
		super(`Unknown food ${foodId}`);
	}
}

/** An ingredient uses a unit its food cannot take: a serving without a serving size, or g and ml swapped. */
export class UnitNotAvailableError extends Error {
	override readonly name = 'UnitNotAvailableError';
	constructor(
		readonly foodId: string,
		readonly unit: IngredientInput['unit']
	) {
		super(`Food ${foodId} cannot be measured in ${unit}`);
	}
}

/** A save names a recipe id that does not exist. Nothing was written. */
export class RecipeNotFoundError extends Error {
	override readonly name = 'RecipeNotFoundError';
	constructor(readonly recipeId: string) {
		super(`Recipe ${recipeId} not found`);
	}
}

type IngredientRow = { ingredient: RecipeIngredient; food: Food };

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
	const sum = totals(
		rows.map(({ ingredient, food }) => ({ per100: food, grams: ingredient.grams }))
	);
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
		ingredients: rows.map(({ ingredient, food }) => ({
			...ingredient,
			food,
			nutrients: ingredientNutrients({ per100: food, grams: ingredient.grams })
		}))
	};
}

/** Gram equivalent of an ingredient amount. g and ml must match the food's basis; a serving needs a serving size. */
function gramsFor(ingredient: IngredientInput, food: Food): number {
	const fits =
		ingredient.unit === 'serving'
			? food.servingG !== null
			: ingredient.unit === food.nutritionBasis;
	if (!fits) throw new UnitNotAvailableError(food.id, ingredient.unit);
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
		if (!food) throw new UnknownFoodError(ingredient.foodId);
		return {
			id: newId(),
			recipeId,
			foodId: food.id,
			amount: ingredient.amount,
			unit: ingredient.unit,
			grams: gramsFor(ingredient, food),
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
		db.insert(recipeIngredients).values(lines)
	]);
	return recipe;
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
