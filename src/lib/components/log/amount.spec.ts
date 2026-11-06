import { describe, expect, it } from 'vitest';
import { convertAmount, defaultAmount, unitOptions } from './amount.ts';

const oats = { nutritionBasis: 'g' as const, servingG: 40 };
const plain = { nutritionBasis: 'g' as const, servingG: null };
const juice = { nutritionBasis: 'ml' as const, servingG: null };

describe('defaultAmount', () => {
	it('uses the last used amount first', () => {
		expect(defaultAmount(oats, { amount: 75, unit: 'g' })).toEqual({ amount: 75, unit: 'g' });
	});

	it('then one serving', () => {
		expect(defaultAmount(oats, null)).toEqual({ amount: 1, unit: 'serving' });
	});

	it('then 100 g, or 100 ml for a liquid', () => {
		expect(defaultAmount(plain, null)).toEqual({ amount: 100, unit: 'g' });
		expect(defaultAmount(juice, null)).toEqual({ amount: 100, unit: 'ml' });
	});

	it('ignores a last used serving when the food has no serving weight any more', () => {
		expect(defaultAmount(plain, { amount: 2, unit: 'serving' })).toEqual({
			amount: 100,
			unit: 'g'
		});
	});

	it("uses the entry's grams when its servings no longer fit the food", () => {
		expect(defaultAmount(plain, { amount: 2, unit: 'serving', grams: 80 })).toEqual({
			amount: 80,
			unit: 'g'
		});
	});
});

describe('convertAmount', () => {
	it('keeps the grams when the unit changes', () => {
		expect(convertAmount(80, 'g', 'serving', 40)).toBe(2);
		expect(convertAmount(1.5, 'serving', 'g', 40)).toBe(60);
	});

	it('rounds to two decimals', () => {
		expect(convertAmount(100, 'g', 'serving', 30)).toBe(3.33);
	});

	it('leaves the amount alone between g and ml or without a serving weight', () => {
		expect(convertAmount(80, 'g', 'ml', null)).toBe(80);
		expect(convertAmount(80, 'g', 'serving', null)).toBe(80);
	});
});

describe('unitOptions', () => {
	it('offers the base unit, plus serving when the food has a serving weight', () => {
		expect(unitOptions(oats)).toEqual(['g', 'serving']);
		expect(unitOptions(plain)).toEqual(['g']);
		expect(unitOptions(juice)).toEqual(['ml']);
	});
});
