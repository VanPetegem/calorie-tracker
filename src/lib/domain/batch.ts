import {
	round1,
	snapshotFor,
	sumNutrients,
	toGrams,
	type Nutrients,
	type Per100,
	type Unit
} from './nutrition';

/** One ingredient: its values per 100 g and the grams used. */
export type IngredientLine = { per100: Per100; grams: number };

/** What an ingredient's grams come from: the amount and unit as entered, the food's serving weight, saved grams. */
export type IngredientAmount = {
	amount: number;
	unit: Unit;
	/** The food's current serving weight. */
	servingG: number | null;
	/** Grams saved with the line. Only a serving of a food that no longer has a serving weight falls back on it. */
	storedGrams?: number;
};

/**
 * Grams of an ingredient with the food as it is now: a serving follows the food's current serving weight. When the
 * food has none (it lost it after the line was saved), the saved grams stand, or 0 g when there are none.
 */
export function ingredientGrams({ amount, unit, servingG, storedGrams }: IngredientAmount): number {
	if (unit === 'serving' && servingG === null) return storedGrams ?? 0;
	return toGrams(amount, unit, servingG);
}

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
