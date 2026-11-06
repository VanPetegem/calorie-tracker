import { describe, expect, it } from 'vitest';
import {
	batchEntrySnapshot,
	ingredientGrams,
	ingredientNutrients,
	isStale,
	netWeight,
	per100g,
	perPortion,
	portionsLeft,
	totals,
	type BatchShape,
	type IngredientLine
} from './batch';
import { type Nutrients, type Per100 } from './nutrition';

const chicken: Per100 = { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 };
const rice: Per100 = { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 };
const dinner: Nutrients = { kcal: 460, protein: 64.7, carbs: 28, fat: 7.5, fiber: 0.4 };
const stew: Nutrients = { kcal: 2000, protein: 120, carbs: 200, fat: 80, fiber: 20 };
const fourPortionStew: BatchShape = { totals: stew, portions: 4, cookedWeightG: 1600 };

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

describe('per100g', () => {
	it('scales the totals to 100 g of the cooked weight', () => {
		expect(per100g(stew, 1600)).toEqual({
			kcal: 125,
			protein: 7.5,
			carbs: 12.5,
			fat: 5,
			fiber: 1.3
		});
	});

	it('throws a RangeError for a cooked weight of zero or less', () => {
		expect(() => per100g(stew, 0)).toThrow(RangeError);
		expect(() => per100g(stew, -1)).toThrow(RangeError);
	});
});

describe('batchEntrySnapshot', () => {
	it('takes 1.5 of 4 portions of a 2000 kcal batch as 750 kcal and, at 1600 g cooked, 600 g', () => {
		expect(batchEntrySnapshot(fourPortionStew, 1.5, 'portion')).toEqual({
			nutrients: { kcal: 750, protein: 45, carbs: 75, fat: 30, fiber: 7.5 },
			grams: 600
		});
	});

	it('takes 200 g of a 1600 g batch as 250 kcal', () => {
		expect(batchEntrySnapshot(fourPortionStew, 200, 'g')).toEqual({
			nutrients: { kcal: 250, protein: 15, carbs: 25, fat: 10, fiber: 2.5 },
			grams: 200
		});
	});

	it('gives null grams for a portion of a batch without a cooked weight', () => {
		const unweighed = { ...fourPortionStew, cookedWeightG: null };
		expect(batchEntrySnapshot(unweighed, 1, 'portion')).toEqual({
			nutrients: { kcal: 500, protein: 30, carbs: 50, fat: 20, fiber: 5 },
			grams: null
		});
	});

	it('throws a RangeError for grams without a cooked weight', () => {
		const unweighed = { ...fourPortionStew, cookedWeightG: null };
		expect(() => batchEntrySnapshot(unweighed, 200, 'g')).toThrow(RangeError);
	});
});

describe('portionsLeft', () => {
	it('leaves 2 of 4 portions after 1 portion and 400 g of a 1600 g batch', () => {
		const entries = [
			{ amount: 1, unit: 'portion', grams: 400 },
			{ amount: 400, unit: 'g', grams: 400 }
		];
		expect(portionsLeft(fourPortionStew, entries)).toBe(2);
	});

	it('goes negative when more is logged than the batch holds', () => {
		expect(portionsLeft(fourPortionStew, [{ amount: 5, unit: 'portion', grams: null }])).toBe(-1);
	});

	it('ignores gram entries when the batch has no cooked weight', () => {
		const unweighed = { ...fourPortionStew, cookedWeightG: null };
		const entries = [
			{ amount: 200, unit: 'g', grams: 200 },
			{ amount: 1, unit: 'portion', grams: null }
		];
		expect(portionsLeft(unweighed, entries)).toBe(3);
	});

	it('throws a RangeError for a unit that is not a batch unit', () => {
		expect(() =>
			portionsLeft(fourPortionStew, [{ amount: 1, unit: 'serving', grams: 40 }])
		).toThrow(RangeError);
	});
});

describe('netWeight', () => {
	it('subtracts the tare: 1850 g gross in a 650 g container is 1200 g', () => {
		expect(netWeight(1850, 650)).toBe(1200);
	});

	it('throws a RangeError when the net weight is not above zero', () => {
		expect(() => netWeight(600, 650)).toThrow(RangeError);
		expect(() => netWeight(650, 650)).toThrow(RangeError);
	});
});

describe('isStale', () => {
	const lastActivity = '2026-11-01T12:00:00.000Z';

	it('is stale 1 ms after 7 days without activity', () => {
		expect(isStale(lastActivity, new Date('2026-11-08T12:00:00.001Z'))).toBe(true);
	});

	it('is not stale at exactly 7 days without activity', () => {
		expect(isStale(lastActivity, new Date('2026-11-08T12:00:00.000Z'))).toBe(false);
	});
});
