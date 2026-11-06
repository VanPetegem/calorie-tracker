import { ingredientNutrients, totals } from '#lib/domain/batch.ts';
import { toGrams, type Nutrients, type Per100 } from '#lib/domain/nutrition.ts';
import type { LogUnit } from '#lib/schemas/fields.ts';
import type { Food } from '#lib/server/db/schema.ts';

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
	unit: LogUnit;
};

/** Maps an ingredient to the values per 100 its nutrition is computed from. */
export type Per100Of = (ingredient: DraftIngredient) => Per100;

export const foodPer100: Per100Of = (ingredient) => ingredient.food;

/** Grams of an ingredient. A serving of a food without a serving weight counts as 0 g instead of throwing. */
export function draftGrams(ingredient: DraftIngredient): number {
	try {
		return toGrams(ingredient.amount, ingredient.unit, ingredient.food.servingG);
	} catch {
		return 0;
	}
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
