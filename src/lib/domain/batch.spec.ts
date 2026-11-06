import { describe, expect, it } from 'vitest';
import {
	ingredientGrams,
	ingredientNutrients,
	perPortion,
	totals,
	type IngredientLine
} from './batch';
import { type Nutrients, type Per100 } from './nutrition';

const chicken: Per100 = { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 };
const rice: Per100 = { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 };
const dinner: Nutrients = { kcal: 460, protein: 64.7, carbs: 28, fat: 7.5, fiber: 0.4 };

const chickenAndRice: IngredientLine[] = [
	{ per100: chicken, grams: 200 },
	{ per100: rice, grams: 100 }
];

describe('ingredientNutrients', () => {
	it('scales the line to its grams', () => {
		expect(ingredientNutrients({ per100: chicken, grams: 200 })).toEqual({
			kcal: 330,
			protein: 62,
			carbs: 0,
			fat: 7.2,
			fiber: 0
		});
	});
});

describe('totals', () => {
	it('adds 200 g chicken and 100 g rice to 460 kcal with macros', () => {
		expect(totals(chickenAndRice)).toEqual(dinner);
	});

	it('counts a null fiber line as zero and returns a number', () => {
		const lines: IngredientLine[] = [
			{ per100: { ...chicken, fiber: null }, grams: 200 },
			{ per100: rice, grams: 100 }
		];
		const fiber = totals(lines).fiber;
		expect(fiber).toBe(0.4);
		expect(typeof fiber).toBe('number');
	});

	it('returns zeros with fiber 0 for an empty list', () => {
		expect(totals([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
	});
});

describe('perPortion', () => {
	it('divides every value by the portions', () => {
		expect(perPortion(dinner, 4)).toEqual({
			kcal: 115,
			protein: 16.2,
			carbs: 7,
			fat: 1.9,
			fiber: 0.1
		});
	});

	it('rounds to one decimal, so 460 kcal over 1.5 portions is 306.7', () => {
		expect(perPortion(dinner, 1.5)).toEqual({
			kcal: 306.7,
			protein: 43.1,
			carbs: 18.7,
			fat: 5,
			fiber: 0.3
		});
	});

	it('keeps fiber null', () => {
		expect(perPortion({ ...dinner, fiber: null }, 2).fiber).toBeNull();
	});

	it('throws a RangeError for zero, negative, NaN or infinite portions', () => {
		expect(() => perPortion(dinner, 0)).toThrow(RangeError);
		expect(() => perPortion(dinner, -1)).toThrow(RangeError);
		expect(() => perPortion(dinner, Number.NaN)).toThrow(RangeError);
		expect(() => perPortion(dinner, Number.POSITIVE_INFINITY)).toThrow(RangeError);
	});
});

describe('ingredientGrams', () => {
	it('takes g and ml as they are', () => {
		expect(ingredientGrams({ amount: 80, unit: 'g', servingG: null })).toBe(80);
		expect(ingredientGrams({ amount: 250, unit: 'ml', servingG: 40 })).toBe(250);
	});

	it('multiplies servings by the current serving weight, ignoring the stored grams', () => {
		expect(ingredientGrams({ amount: 2, unit: 'serving', servingG: 40, storedGrams: 30 })).toBe(80);
	});

	it('keeps the stored grams for a serving of a food that lost its serving weight', () => {
		expect(ingredientGrams({ amount: 2, unit: 'serving', servingG: null, storedGrams: 30 })).toBe(
			30
		);
	});

	it('counts such a serving as 0 g when nothing was stored', () => {
		expect(ingredientGrams({ amount: 2, unit: 'serving', servingG: null })).toBe(0);
	});
});
