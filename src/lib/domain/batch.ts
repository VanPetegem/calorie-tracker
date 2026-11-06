import { round1, snapshotFor, sumNutrients, type Nutrients, type Per100 } from './nutrition';

/** One ingredient: its values per 100 g and the grams used. */
export type IngredientLine = { per100: Per100; grams: number };

/** Nutrition for one ingredient line. */
export function ingredientNutrients(line: IngredientLine): Nutrients {
	return snapshotFor(line.per100, line.grams);
}

/** Total nutrition for a list of ingredients. An empty list gives zeros with fiber 0. */
export function totals(lines: IngredientLine[]): Nutrients {
	return sumNutrients(lines.map(ingredientNutrients));
}

/** Nutrition for one portion, rounded to one decimal. Rejects zero, negative, NaN and infinite portions. */
export function perPortion(totals: Nutrients, portions: number): Nutrients {
	if (!Number.isFinite(portions) || portions <= 0)
		throw new RangeError('Portions must be greater than zero');
	const scale = (value: number) => round1(value / portions);
	return {
		kcal: scale(totals.kcal),
		protein: scale(totals.protein),
		carbs: scale(totals.carbs),
		fat: scale(totals.fat),
		fiber: totals.fiber === null ? null : scale(totals.fiber)
	};
}
