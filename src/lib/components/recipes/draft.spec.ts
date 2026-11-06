import { describe, expect, it } from 'vitest';
import { totals } from '#lib/domain/batch.ts';
import { draftGrams, draftNutrients, draftTotals, type DraftIngredient } from './draft.ts';

const food = {
	id: 'f1',
	name: 'Tahini',
	nutritionBasis: 'g',
	kcal: 600,
	protein: 17,
	carbs: 12,
	fat: 54,
	fiber: 9,
	servingG: null
} as const;
const oats = { ...food, id: 'f2', name: 'Oats', kcal: 372, servingG: 40 } as const;

const ingredient = (extra: Partial<DraftIngredient>): DraftIngredient => ({
	key: 'k',
	food,
	amount: 2,
	unit: 'serving',
	...extra
});

describe('draftGrams', () => {
	it('uses the stored grams for a serving of a food without a serving weight', () => {
		expect(draftGrams(ingredient({ grams: 30 }))).toBe(30);
	});

	it('is 0 g for such a serving without stored grams, and does not throw', () => {
		expect(draftGrams(ingredient({}))).toBe(0);
	});

	it('follows the current serving weight when the food has one', () => {
		expect(draftGrams(ingredient({ food: oats, grams: 30 }))).toBe(80);
	});
});

describe('draftNutrients and draftTotals', () => {
	it('prices a serving without weight from its stored grams', () => {
		expect(draftNutrients(ingredient({ grams: 30 })).kcal).toBe(180);
	});

	it('equals the domain totals for the same lines', () => {
		const list = [
			ingredient({ grams: 30 }),
			ingredient({ key: 'k2', food: oats, amount: 2 }),
			ingredient({ key: 'k3', unit: 'g', amount: 15 })
		];
		const lines = [
			{ per100: food, grams: 30 },
			{ per100: oats, grams: 80 },
			{ per100: food, grams: 15 }
		];
		expect(draftTotals(list)).toEqual(totals(lines));
	});

	it('uses the per100 mapper instead of the food, for batch snapshots', () => {
		const list = [ingredient({ unit: 'g', amount: 100 })];
		expect(draftTotals(list, () => ({ ...food, kcal: 100 })).kcal).toBe(100);
	});
});
