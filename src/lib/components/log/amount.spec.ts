import { describe, expect, it } from 'vitest';
import {
	batchSource,
	batchUnitOptions,
	convertAmount,
	convertBatchAmount,
	defaultAmount,
	defaultBatchAmount,
	entryBatchSource,
	NO_COOKED_WEIGHT_HINT,
	NO_ENTRY_WEIGHT_HINT,
	NO_PORTION_WEIGHT_HINT,
	previewBatchAmount,
	unitOptions
} from './amount.ts';

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

/** 2000 kcal in 4 portions and 1600 g: a portion is 500 kcal and 400 g. */
const stew = {
	name: 'Stew',
	kcal: 2000,
	protein: 120,
	carbs: 200,
	fat: 80,
	fiber: null,
	portions: 4,
	cookedWeightG: 1600
};

describe('batch amounts', () => {
	it('previews 1.5 portions as 750 kcal and 600 g, and 200 g as 250 kcal', () => {
		const source = batchSource(stew);
		expect(previewBatchAmount(source, 1.5, 'portion')).toMatchObject({
			nutrients: { kcal: 750 },
			grams: 600
		});
		expect(previewBatchAmount(source, 200, 'g')).toMatchObject({
			nutrients: { kcal: 250 },
			grams: 200
		});
	});

	it('previews a portion without grams for an unweighed batch, and refuses grams and bad amounts', () => {
		const source = batchSource({ ...stew, cookedWeightG: null });
		expect(previewBatchAmount(source, 2, 'portion')).toMatchObject({
			nutrients: { kcal: 1000 },
			grams: null
		});
		expect(previewBatchAmount(source, 100, 'g')).toBeNull();
		expect(previewBatchAmount(batchSource(stew), 0, 'portion')).toBeNull();
		expect(previewBatchAmount(batchSource(stew), Number.NaN, 'g')).toBeNull();
	});

	it('offers grams only for a weighed batch, with the reason when it does not', () => {
		expect(batchUnitOptions(batchSource(stew))).toEqual([{ value: 'portion' }, { value: 'g' }]);
		expect(batchUnitOptions(batchSource({ ...stew, cookedWeightG: null }))).toEqual([
			{ value: 'portion' },
			{ value: 'g', disabled: NO_COOKED_WEIGHT_HINT }
		]);
		expect(NO_COOKED_WEIGHT_HINT).toBe('Add the cooked weight to log grams');
	});

	it('starts at one portion, or at the entry amount when editing', () => {
		expect(defaultBatchAmount(batchSource(stew), null)).toEqual({ amount: 1, unit: 'portion' });
		expect(defaultBatchAmount(batchSource(stew), { amount: 200, unit: 'g' })).toEqual({
			amount: 200,
			unit: 'g'
		});
		// A unit that is off falls back to one portion.
		expect(
			defaultBatchAmount(batchSource({ ...stew, cookedWeightG: null }), { amount: 200, unit: 'g' })
		).toEqual({ amount: 1, unit: 'portion' });
	});

	it('keeps the same quantity across units: 1.5 portions are 600 g', () => {
		const source = batchSource(stew);
		expect(convertBatchAmount(source, 1.5, 'portion', 'g')).toBe(600);
		expect(convertBatchAmount(source, 200, 'g', 'portion')).toBe(0.5);
		expect(convertBatchAmount(source, 5, 'portion', 'portion')).toBe(5);
		expect(
			convertBatchAmount(batchSource({ ...stew, cookedWeightG: null }), 5, 'portion', 'g')
		).toBe(5);
	});
});

describe('entryBatchSource', () => {
	const nutrients = { kcal: 750, protein: 45, carbs: 75, fat: 30, fiber: null };

	it('rescales a portion entry by amount over its amount, and by grams over its grams', () => {
		const source = entryBatchSource(
			{ ...nutrients, amount: 1.5, unit: 'portion', grams: 600 },
			400
		)!;
		expect(previewBatchAmount(source, 3, 'portion')).toMatchObject({
			nutrients: { kcal: 1500 },
			grams: 1200
		});
		expect(previewBatchAmount(source, 300, 'g')).toMatchObject({ nutrients: { kcal: 375 } });
		expect(batchUnitOptions(source).map((o) => o.disabled)).toEqual([undefined, undefined]);
	});

	it('previews grams to portions with the batch current portion weight', () => {
		const entry = { ...nutrients, kcal: 250, amount: 200, unit: 'g', grams: 200 };
		const source = entryBatchSource(entry, 400)!;
		expect(previewBatchAmount(source, 1, 'portion')).toMatchObject({
			nutrients: { kcal: 500 },
			grams: 400
		});
		expect(previewBatchAmount(source, 100, 'g')).toMatchObject({ nutrients: { kcal: 125 } });
		expect(convertBatchAmount(source, 200, 'g', 'portion')).toBe(0.5);
		// The batch lost its cooked weight: only the same unit is offered.
		expect(batchUnitOptions(entryBatchSource(entry, null)!)).toEqual([
			{ value: 'portion', disabled: NO_PORTION_WEIGHT_HINT },
			{ value: 'g' }
		]);
	});

	it('edits a portion entry without grams in portions only', () => {
		const source = entryBatchSource(
			{ ...nutrients, amount: 2, unit: 'portion', grams: null },
			400
		)!;
		expect(previewBatchAmount(source, 1, 'portion')).toMatchObject({
			nutrients: { kcal: 375 },
			grams: null
		});
		expect(batchUnitOptions(source)).toEqual([
			{ value: 'portion' },
			{ value: 'g', disabled: NO_ENTRY_WEIGHT_HINT }
		]);
	});

	it('is null for an entry that is not a batch amount', () => {
		expect(
			entryBatchSource({ ...nutrients, amount: null, unit: null, grams: null }, 400)
		).toBeNull();
		expect(
			entryBatchSource({ ...nutrients, amount: 2, unit: 'serving', grams: 100 }, 400)
		).toBeNull();
	});
});
