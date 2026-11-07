import { ingredientGrams, ingredientNutrients, totals } from '#lib/domain/batch.ts';
import type { Nutrients, Per100 } from '#lib/domain/nutrition.ts';
import type { IngredientUnit } from '#lib/schemas/fields.ts';
import type { BatchInput } from '#lib/schemas/batch.ts';
import type { BatchDetail } from '#lib/server/batches/repo.ts';
import type { Food } from '#lib/server/db/schema.ts';
import type { RecipeDetail } from '#lib/server/recipes/repo.ts';

/** The part of a food an ingredient needs: identity, values per 100 and the serving weight. */
export type DraftFood = Pick<
	Food,
	'id' | 'name' | 'nutritionBasis' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'servingG'
>;

/** An ingredient being edited. `key` is a client id for keyed `#each`; the same food may appear twice. */
export type DraftIngredient = {
	key: string;
	food: DraftFood;
	amount: number;
	unit: IngredientUnit;
	/** Grams stored with the line by the server. Used only for a serving of a food without a serving weight. */
	grams?: number;
	/** The stored line's id. Batch ingredients (3b) keep it so a save can tell existing lines from new ones. */
	id?: string;
	/** The line's own values per 100 (a batch ingredient's snapshot). Priced instead of the food's when present. */
	snapshot?: Per100;
};

/** Maps an ingredient to the values per 100 its nutrition is computed from. */
export type Per100Of = (ingredient: DraftIngredient) => Per100;

export const foodPer100: Per100Of = (ingredient) => ingredient.snapshot ?? ingredient.food;

/** Grams of an ingredient; the math lives in the domain. */
export function draftGrams(ingredient: DraftIngredient): number {
	return ingredientGrams({
		amount: ingredient.amount,
		unit: ingredient.unit,
		servingG: ingredient.food.servingG,
		storedGrams: ingredient.grams
	});
}

/** Nutrition of one ingredient. */
export function draftNutrients(
	ingredient: DraftIngredient,
	per100: Per100Of = foodPer100
): Nutrients {
	return ingredientNutrients({ per100: per100(ingredient), grams: draftGrams(ingredient) });
}

/** Total nutrition of a list of ingredients: what the recipe page passes to `NutritionSummary`. */
export function draftTotals(
	ingredients: DraftIngredient[],
	per100: Per100Of = foodPer100
): Nutrients {
	return totals(ingredients.map((i) => ({ per100: per100(i), grams: draftGrams(i) })));
}

/** A new client key. */
export function newKey(): string {
	return crypto.randomUUID();
}

/** A recipe as the editor holds it. Without an id it is a new recipe. */
export type RecipeDraft = {
	id?: string;
	name: string;
	defaultPortions: number;
	notes: string | null;
	ingredients: DraftIngredient[];
};

/**
 * The editor's starting point for a stored recipe. Each line keeps the grams the server computed (live serving
 * weight, or the stored grams when the food lost its serving size), so the editor's totals equal the list's.
 */
export function recipeDraft(recipe: RecipeDetail): RecipeDraft {
	return {
		id: recipe.id,
		name: recipe.name,
		defaultPortions: recipe.defaultPortions,
		notes: recipe.notes,
		ingredients: recipe.ingredients.map(({ food, amount, unit, grams }) => {
			const { id, name, nutritionBasis, kcal, protein, carbs, fat, fiber, servingG } = food;
			return {
				key: newKey(),
				food: { id, name, nutritionBasis, kcal, protein, carbs, fat, fiber, servingG },
				amount,
				unit,
				grams
			};
		})
	};
}

/** A batch as the editor holds it. Without an id it is a new batch. */
export type BatchDraft = {
	id?: string;
	recipeId: string | null;
	name: string;
	cookedOn: string;
	portions: number;
	/** The net weight, null until the batch is weighed. */
	cookedWeightG: number | null;
	ingredients: DraftIngredient[];
};

/**
 * The editor's starting point for a stored batch. Each line keeps its `id` (so a save knows it is an existing line
 * and keeps its snapshot), its own values per 100 as `snapshot`, its own name, and the serving weight the server
 * prices servings with (`servingG`), not the food's, so the editor's numbers equal the server's. A line whose food is
 * gone borrows its own id as the food id, which the server accepts for a line that keeps its unit.
 */
export function batchDraft(batch: BatchDetail): BatchDraft {
	return {
		id: batch.id,
		recipeId: batch.recipeId,
		name: batch.name,
		cookedOn: batch.cookedOn,
		portions: batch.portions,
		cookedWeightG: batch.cookedWeightG,
		ingredients: batch.ingredients.map((line) => {
			const { kcal, protein, carbs, fat, fiber } = line;
			return {
				key: newKey(),
				id: line.id,
				food: {
					id: line.foodId ?? line.id,
					name: line.name,
					nutritionBasis: line.food?.nutritionBasis ?? (line.unit === 'ml' ? 'ml' : 'g'),
					kcal,
					protein,
					carbs,
					fat,
					fiber,
					servingG: line.servingG
				},
				amount: line.amount,
				unit: line.unit,
				grams: line.grams,
				snapshot: { kcal, protein, carbs, fat, fiber }
			};
		})
	};
}

/**
 * A new batch prefilled from a recipe: the fields come from `draftFromRecipe`'s input, the lines (with their foods,
 * which the input only names) from the recipe. The lines have no id and no snapshot: the server snapshots them.
 */
export function batchDraftFromRecipe(input: BatchInput, recipe: RecipeDetail): BatchDraft {
	return {
		recipeId: input.recipeId,
		name: input.name,
		cookedOn: input.cookedOn,
		portions: input.portions,
		cookedWeightG: input.cookedWeightG,
		ingredients: recipeDraft(recipe).ingredients
	};
}
