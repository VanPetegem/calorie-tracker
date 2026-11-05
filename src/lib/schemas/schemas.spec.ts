import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { FoodInput } from './food.ts';
import {
	EditAmountInput,
	EditQuickInput,
	LogFoodInput,
	QuickInput,
	RestoreEntryInput
} from './log.ts';
import { ManualTargetInput } from './settings.ts';

const foodId = '019a5b2e-8f3c-7d4a-9b1e-2c3d4e5f6a7b';

const food = {
	name: 'Oats',
	nutritionBasis: 'g',
	kcal: '370',
	protein: '12,5',
	carbs: '59',
	fat: '7'
};

describe('FoodInput', () => {
	it('accepts comma decimals', () => {
		const result = v.parse(FoodInput, food);
		expect(result).toMatchObject({ kcal: 370, protein: 12.5, brand: null, fiber: null });
	});

	it('rejects kcal above 900 per 100', () => {
		expect(v.safeParse(FoodInput, { ...food, kcal: 901 }).success).toBe(false);
	});

	it('rejects a macro above 100 per 100', () => {
		expect(v.safeParse(FoodInput, { ...food, fat: '100,1' }).success).toBe(false);
	});

	it('rejects text that is not a number', () => {
		expect(v.safeParse(FoodInput, { ...food, carbs: '1.000,5' }).success).toBe(false);
	});

	it('treats empty optional fields as missing', () => {
		const result = v.parse(FoodInput, {
			...food,
			brand: ' ',
			barcode: '',
			fiber: '',
			servingG: ''
		});
		expect(result).toMatchObject({ brand: null, barcode: null, fiber: null, servingG: null });
	});

	it('rejects an empty name', () => {
		expect(v.safeParse(FoodInput, { ...food, name: '  ' }).success).toBe(false);
	});
});

describe('LogFoodInput', () => {
	const entry = { date: '2026-11-05', foodId, amount: '150', unit: 'g' };

	it('accepts a valid entry', () => {
		expect(v.parse(LogFoodInput, entry)).toEqual({ ...entry, amount: 150 });
	});

	it('rejects amount 0', () => {
		expect(v.safeParse(LogFoodInput, { ...entry, amount: 0 }).success).toBe(false);
	});

	it('rejects 5001 g', () => {
		expect(v.safeParse(LogFoodInput, { ...entry, amount: 5001 }).success).toBe(false);
	});

	it('limits servings to 50', () => {
		expect(v.safeParse(LogFoodInput, { ...entry, unit: 'serving', amount: 50 }).success).toBe(true);
		expect(v.safeParse(LogFoodInput, { ...entry, unit: 'serving', amount: 51 }).success).toBe(
			false
		);
	});

	it('rejects a nutrition value sent by the client', () => {
		expect(v.safeParse(LogFoodInput, { ...entry, kcal: 100 }).success).toBe(false);
	});

	it('rejects a date that is not a calendar date', () => {
		expect(v.safeParse(LogFoodInput, { ...entry, date: '2026-02-30' }).success).toBe(false);
	});
});

describe('EditAmountInput', () => {
	it('applies the amount limits of the unit', () => {
		expect(
			v.safeParse(EditAmountInput, { id: foodId, amount: '2,5', unit: 'serving' }).success
		).toBe(true);
		expect(v.safeParse(EditAmountInput, { id: foodId, amount: 5001, unit: 'ml' }).success).toBe(
			false
		);
	});
});

describe('EditQuickInput', () => {
	it('takes the quick fields and an id, without a date', () => {
		expect(v.parse(EditQuickInput, { id: foodId, kcal: '700', fat: '' })).toEqual({
			id: foodId,
			label: null,
			kcal: 700,
			protein: null,
			carbs: null,
			fat: null
		});
		expect(v.safeParse(EditQuickInput, { id: foodId, kcal: 700, date: '2026-11-05' }).success).toBe(
			false
		);
	});
});

describe('RestoreEntryInput', () => {
	it('takes only an id', () => {
		expect(v.parse(RestoreEntryInput, { id: foodId })).toEqual({ id: foodId });
		expect(v.safeParse(RestoreEntryInput, { id: 'x' }).success).toBe(false);
		expect(v.safeParse(RestoreEntryInput, { id: foodId, kcal: 1e9 }).success).toBe(false);
	});
});

describe('QuickInput', () => {
	it('accepts kcal only', () => {
		expect(v.parse(QuickInput, { date: '2026-11-05', kcal: '650' })).toEqual({
			date: '2026-11-05',
			label: null,
			kcal: 650,
			protein: null,
			carbs: null,
			fat: null
		});
	});

	it('rejects kcal above 10000', () => {
		expect(v.safeParse(QuickInput, { date: '2026-11-05', kcal: 10001 }).success).toBe(false);
	});
});

describe('ManualTargetInput', () => {
	it('accepts both values', () => {
		expect(v.parse(ManualTargetInput, { kcal: '2800', weightKg: '72,5' })).toEqual({
			kcal: 2800,
			weightKg: 72.5
		});
	});

	it('accepts neither value', () => {
		expect(v.parse(ManualTargetInput, { kcal: '', weightKg: null })).toEqual({
			kcal: null,
			weightKg: null
		});
	});

	it('rejects only one value', () => {
		expect(v.safeParse(ManualTargetInput, { kcal: '2800', weightKg: '' }).success).toBe(false);
	});
});
