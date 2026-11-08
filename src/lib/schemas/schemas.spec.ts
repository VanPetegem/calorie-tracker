import * as v from 'valibot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FoodInput, UpdateFoodInput } from './food.ts';
import { BatchIdInput, BatchInput, ContainerIdInput, ContainerInput } from './batch.ts';
import {
	EditAmountInput,
	EditQuickInput,
	LogBatchInput,
	LogFoodInput,
	QuickInput,
	RestoreEntryInput
} from './log.ts';
import { fitsUnit, LOG_UNITS } from './fields.ts';
import { ArchiveRecipeInput, RecipeInput } from './recipe.ts';
import { GoalInput, MacroRulesInput, OnboardingInput, ProfileInput } from './settings.ts';
import { DeleteWeightInput, WeightInput } from './weight.ts';

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

	it('stores a typed UPC-A as EAN-13 so a scan finds it', () => {
		expect(v.parse(FoodInput, { ...food, barcode: ' 036000291452 ' }).barcode).toBe(
			'0036000291452'
		);
	});

	it('keeps a barcode that does not normalize as typed', () => {
		expect(v.parse(FoodInput, { ...food, barcode: '12345678901234' }).barcode).toBe(
			'12345678901234'
		);
		expect(v.parse(FoodInput, { ...food, barcode: '7610000000002' }).barcode).toBe('7610000000002');
	});

	it('rejects an empty name', () => {
		expect(v.safeParse(FoodInput, { ...food, name: '  ' }).success).toBe(false);
	});

	it('says "Enter a number" for text in an optional number field', () => {
		const result = v.safeParse(FoodInput, { ...food, fiber: 'abc' });
		expect(result.success).toBe(false);
		expect(result.issues?.map((issue) => issue.message)).toEqual(['Enter a number']);
	});

	it('keeps the range message for an optional number out of range', () => {
		const result = v.safeParse(FoodInput, { ...food, fiber: '101' });
		expect(result.issues?.map((issue) => issue.message)).toEqual(['Enter at most 100']);
	});
});

describe('UpdateFoodInput', () => {
	it('is a food plus the id of the food to change', () => {
		expect(v.parse(UpdateFoodInput, { ...food, id: foodId })).toMatchObject({
			id: foodId,
			kcal: 370
		});
		expect(v.safeParse(UpdateFoodInput, food).success).toBe(false);
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

	it('rejects portions: only batches are logged in portions', () => {
		expect(v.safeParse(LogFoodInput, { ...entry, unit: 'portion', amount: 1 }).success).toBe(false);
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

	it('accepts portions for a batch entry, up to MAX_PORTIONS; the repository refuses them for a food entry', () => {
		expect(v.safeParse(EditAmountInput, { id: foodId, amount: 100, unit: 'portion' }).success).toBe(
			true
		);
		expect(
			v.safeParse(EditAmountInput, { id: foodId, amount: 100.5, unit: 'portion' }).success
		).toBe(false);
	});
});

describe('LogBatchInput', () => {
	const entry = { date: '2026-11-06', batchId: foodId, amount: '1,5', unit: 'portion' };

	it('accepts portions and grams', () => {
		expect(v.parse(LogBatchInput, entry)).toEqual({ ...entry, amount: 1.5 });
		expect(v.safeParse(LogBatchInput, { ...entry, amount: 200, unit: 'g' }).success).toBe(true);
	});

	it('rejects ml and servings: a batch is logged in portions or grams', () => {
		for (const unit of ['ml', 'serving']) {
			expect(v.safeParse(LogBatchInput, { ...entry, unit }).success, unit).toBe(false);
		}
	});

	it('rejects 0 and 101 portions', () => {
		expect(v.safeParse(LogBatchInput, { ...entry, amount: 100 }).success).toBe(true);
		expect(v.safeParse(LogBatchInput, { ...entry, amount: 0 }).success).toBe(false);
		expect(v.safeParse(LogBatchInput, { ...entry, amount: 101 }).success).toBe(false);
	});

	it('rejects nutrition sent by the client', () => {
		expect(v.safeParse(LogBatchInput, { ...entry, kcal: 1 }).success).toBe(false);
	});
});

describe('log units', () => {
	it('include portion, limited to MAX_PORTIONS', () => {
		expect(LOG_UNITS).toContain('portion');
		expect(fitsUnit({ amount: 100, unit: 'portion' })).toBe(true);
		expect(fitsUnit({ amount: 100.5, unit: 'portion' })).toBe(false);
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

describe('ProfileInput', () => {
	// Age counts from today's UTC date; 2026-11-08 here.
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-08T12:00:00.000Z') });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	const profile = {
		sex: 'male',
		birthDate: '1990-05-01',
		heightCm: '180,5',
		activityLevel: 'light'
	};

	it('accepts a profile with a comma decimal height', () => {
		expect(v.parse(ProfileInput, profile)).toEqual({ ...profile, heightCm: 180.5 });
	});

	it('accepts ages 16 and 100 and rejects 15 and 101', () => {
		const ok = (birthDate: string) => v.safeParse(ProfileInput, { ...profile, birthDate }).success;
		expect(ok('2010-11-08')).toBe(true);
		expect(ok('2010-11-09')).toBe(false);
		expect(ok('1925-11-09')).toBe(true);
		expect(ok('1925-11-08')).toBe(false);
	});

	it('accepts heights 100 and 250 cm and rejects 99 and 250.1', () => {
		const ok = (heightCm: unknown) => v.safeParse(ProfileInput, { ...profile, heightCm }).success;
		expect(ok(100)).toBe(true);
		expect(ok('250')).toBe(true);
		expect(ok(99)).toBe(false);
		expect(ok('250,1')).toBe(false);
	});

	it('rejects an unknown sex or activity level, a bad date and extra keys', () => {
		expect(v.safeParse(ProfileInput, { ...profile, sex: 'other' }).success).toBe(false);
		expect(v.safeParse(ProfileInput, { ...profile, activityLevel: 'extreme' }).success).toBe(false);
		expect(v.safeParse(ProfileInput, { ...profile, birthDate: '1990-02-30' }).success).toBe(false);
		expect(v.safeParse(ProfileInput, { ...profile, kg: 72 }).success).toBe(false);
	});
});

describe('OnboardingInput', () => {
	const input = {
		sex: 'female',
		birthDate: '1995-03-10',
		heightCm: 165,
		activityLevel: 'moderate',
		kg: '58,4',
		goalRatePct: 0.35
	};

	it('takes the profile, the weight and the goal rate', () => {
		expect(v.parse(OnboardingInput, input)).toEqual({ ...input, kg: 58.4 });
		expect(v.safeParse(OnboardingInput, { ...input, kg: '' }).success).toBe(false);
		expect(v.safeParse(OnboardingInput, { ...input, date: '2026-11-08' }).success).toBe(false);
	});

	it('checks the profile and the goal rate as ProfileInput and GoalInput do', () => {
		expect(v.safeParse(OnboardingInput, { ...input, heightCm: 99 }).success).toBe(false);
		expect(v.safeParse(OnboardingInput, { ...input, goalRatePct: 0.4 }).success).toBe(false);
	});
});

describe('GoalInput', () => {
	it('accepts the presets 0.25, 0.35 and 0.5, also as text', () => {
		expect(v.parse(GoalInput, { goalRatePct: 0.25 })).toEqual({ goalRatePct: 0.25 });
		expect(v.parse(GoalInput, { goalRatePct: '0,35' })).toEqual({ goalRatePct: 0.35 });
		expect(v.parse(GoalInput, { goalRatePct: '0.5' })).toEqual({ goalRatePct: 0.5 });
	});

	it('rejects any other rate and extra keys', () => {
		expect(v.safeParse(GoalInput, { goalRatePct: 0.4 }).success).toBe(false);
		expect(v.safeParse(GoalInput, { goalRatePct: 0.35, kg: 72 }).success).toBe(false);
	});
});

describe('MacroRulesInput', () => {
	const rules = { proteinGPerKg: '1,8', fatPct: 0.25, energyDensity: '5000' };

	it('accepts the limits of each rule', () => {
		expect(v.parse(MacroRulesInput, rules)).toEqual({
			proteinGPerKg: 1.8,
			fatPct: 0.25,
			energyDensity: 5000
		});
		const limits = [
			{ proteinGPerKg: 1.2, fatPct: 0.15, energyDensity: 3000 },
			{ proteinGPerKg: 3, fatPct: 0.4, energyDensity: 7700 }
		];
		for (const value of limits) expect(v.parse(MacroRulesInput, value)).toEqual(value);
	});

	it.each([
		['proteinGPerKg', 1.19],
		['proteinGPerKg', 3.01],
		['fatPct', 0.149],
		['fatPct', 0.401],
		['energyDensity', 2999],
		['energyDensity', 7701]
	])('rejects %s = %s', (key, value) => {
		expect(v.safeParse(MacroRulesInput, { ...rules, [key]: value }).success).toBe(false);
	});

	it('rejects extra keys', () => {
		expect(v.safeParse(MacroRulesInput, { ...rules, goalRatePct: 0.35 }).success).toBe(false);
	});
});

describe('RecipeInput', () => {
	const ingredient = { foodId, amount: '200', unit: 'g' };
	const recipe = { name: ' Chili ', defaultPortions: '4', notes: '', ingredients: [ingredient] };
	const withIngredients = (count: number) => ({
		...recipe,
		ingredients: Array.from({ length: count }, () => ingredient)
	});

	it('accepts a new recipe without an id', () => {
		expect(v.parse(RecipeInput, recipe)).toEqual({
			name: 'Chili',
			defaultPortions: 4,
			notes: null,
			ingredients: [{ foodId, amount: 200, unit: 'g' }]
		});
	});

	it('rejects 0 and 101 portions', () => {
		expect(v.safeParse(RecipeInput, { ...recipe, defaultPortions: 100 }).success).toBe(true);
		expect(v.safeParse(RecipeInput, { ...recipe, defaultPortions: 0 }).success).toBe(false);
		expect(v.safeParse(RecipeInput, { ...recipe, defaultPortions: 101 }).success).toBe(false);
	});

	it('rejects 0 and 51 ingredients', () => {
		expect(v.safeParse(RecipeInput, withIngredients(50)).success).toBe(true);
		expect(v.safeParse(RecipeInput, withIngredients(0)).success).toBe(false);
		expect(v.safeParse(RecipeInput, withIngredients(51)).success).toBe(false);
	});

	it('rejects nutrition sent with the recipe or an ingredient', () => {
		expect(v.safeParse(RecipeInput, { ...recipe, kcal: 500 }).success).toBe(false);
		expect(
			v.safeParse(RecipeInput, { ...recipe, ingredients: [{ ...ingredient, kcal: 500 }] }).success
		).toBe(false);
	});

	it('accepts g, ml and serving for an ingredient and rejects portion', () => {
		const unit = (value: string) => ({
			...recipe,
			ingredients: [{ foodId, amount: 1, unit: value }]
		});
		for (const accepted of ['g', 'ml', 'serving']) {
			expect(v.safeParse(RecipeInput, unit(accepted)).success, accepted).toBe(true);
		}
		expect(v.safeParse(RecipeInput, unit('portion')).success).toBe(false);
	});

	it('applies the amount limits of the ingredient unit', () => {
		const serving = (amount: number) => ({
			...recipe,
			ingredients: [{ foodId, amount, unit: 'serving' }]
		});
		expect(v.safeParse(RecipeInput, serving(50)).success).toBe(true);
		expect(v.safeParse(RecipeInput, serving(51)).success).toBe(false);
	});

	it('rejects notes over 2000 characters and an id that is not a uuid', () => {
		expect(v.safeParse(RecipeInput, { ...recipe, notes: 'x'.repeat(2001) }).success).toBe(false);
		expect(v.safeParse(RecipeInput, { ...recipe, id: 'x' }).success).toBe(false);
	});
});

describe('ArchiveRecipeInput', () => {
	it('takes only an id', () => {
		expect(v.parse(ArchiveRecipeInput, { id: foodId })).toEqual({ id: foodId });
		expect(v.safeParse(ArchiveRecipeInput, { id: foodId, name: 'x' }).success).toBe(false);
	});
});

describe('BatchInput', () => {
	const ingredient = { foodId, amount: '200', unit: 'g' };
	const batch = {
		recipeId: '',
		name: ' Chili ',
		cookedOn: '2026-11-06',
		portions: '4',
		cookedWeightG: '1600,5',
		ingredients: [ingredient]
	};
	const withIngredients = (count: number) => ({
		...batch,
		ingredients: Array.from({ length: count }, () => ingredient)
	});

	it('accepts a one off batch without an id', () => {
		expect(v.parse(BatchInput, batch)).toEqual({
			recipeId: null,
			name: 'Chili',
			cookedOn: '2026-11-06',
			portions: 4,
			cookedWeightG: 1600.5,
			ingredients: [{ foodId, amount: 200, unit: 'g' }]
		});
	});

	it('takes an ingredient id for a line the batch already has', () => {
		const parsed = v.parse(BatchInput, {
			...batch,
			ingredients: [{ ...ingredient, id: foodId }]
		});
		expect(parsed.ingredients[0].id).toBe(foodId);
		expect(
			v.safeParse(BatchInput, { ...batch, ingredients: [{ ...ingredient, id: 'x' }] }).success
		).toBe(false);
	});

	it('rejects 0 and 101 portions', () => {
		expect(v.safeParse(BatchInput, { ...batch, portions: 100 }).success).toBe(true);
		expect(v.safeParse(BatchInput, { ...batch, portions: 0 }).success).toBe(false);
		expect(v.safeParse(BatchInput, { ...batch, portions: 101 }).success).toBe(false);
	});

	it('takes a blank cooked weight as none and limits it to 20000 g', () => {
		expect(v.parse(BatchInput, { ...batch, cookedWeightG: ' ' }).cookedWeightG).toBeNull();
		expect(v.safeParse(BatchInput, { ...batch, cookedWeightG: 20000 }).success).toBe(true);
		expect(v.safeParse(BatchInput, { ...batch, cookedWeightG: 0 }).success).toBe(false);
		expect(v.safeParse(BatchInput, { ...batch, cookedWeightG: 20001 }).success).toBe(false);
	});

	it('rejects 0 and 51 ingredients', () => {
		expect(v.safeParse(BatchInput, withIngredients(50)).success).toBe(true);
		expect(v.safeParse(BatchInput, withIngredients(0)).success).toBe(false);
		expect(v.safeParse(BatchInput, withIngredients(51)).success).toBe(false);
	});

	it('rejects nutrition sent with the batch or an ingredient', () => {
		expect(v.safeParse(BatchInput, { ...batch, kcal: 500 }).success).toBe(false);
		expect(
			v.safeParse(BatchInput, { ...batch, ingredients: [{ ...ingredient, kcal: 500 }] }).success
		).toBe(false);
	});

	it('rejects a portion as an ingredient unit and a date that is not a calendar date', () => {
		expect(
			v.safeParse(BatchInput, { ...batch, ingredients: [{ ...ingredient, unit: 'portion' }] })
				.success
		).toBe(false);
		expect(v.safeParse(BatchInput, { ...batch, cookedOn: '2026-02-30' }).success).toBe(false);
	});
});

describe('ContainerInput', () => {
	it('accepts a name and a tare up to 10000 g', () => {
		expect(v.parse(ContainerInput, { name: ' Pot ', tareG: '650' })).toEqual({
			name: 'Pot',
			tareG: 650
		});
		expect(v.safeParse(ContainerInput, { name: 'Pot', tareG: 10001 }).success).toBe(false);
		expect(v.safeParse(ContainerInput, { name: 'Pot', tareG: 0 }).success).toBe(false);
	});

	it('limits the name to 100 characters', () => {
		expect(v.safeParse(ContainerInput, { name: 'x'.repeat(101), tareG: 1 }).success).toBe(false);
	});
});

describe('BatchIdInput and ContainerIdInput', () => {
	it('take only an id', () => {
		for (const schema of [BatchIdInput, ContainerIdInput]) {
			expect(v.parse(schema, { id: foodId })).toEqual({ id: foodId });
			expect(v.safeParse(schema, { id: foodId, name: 'x' }).success).toBe(false);
		}
	});
});

describe('WeightInput', () => {
	it('accepts comma decimals and the limits 20 and 400 kg', () => {
		expect(v.parse(WeightInput, { date: '2026-11-07', kg: '72,5' })).toEqual({
			date: '2026-11-07',
			kg: 72.5
		});
		expect(v.parse(WeightInput, { date: '2026-11-07', kg: 20 }).kg).toBe(20);
		expect(v.parse(WeightInput, { date: '2026-11-07', kg: '400' }).kg).toBe(400);
	});

	it('rejects 19.9 and 400.1 kg', () => {
		expect(v.safeParse(WeightInput, { date: '2026-11-07', kg: '19,9' }).success).toBe(false);
		expect(v.safeParse(WeightInput, { date: '2026-11-07', kg: 400.1 }).success).toBe(false);
	});

	it('rejects a date that is not a calendar date and extra keys', () => {
		expect(v.safeParse(WeightInput, { date: '2026-02-30', kg: 72 }).success).toBe(false);
		expect(v.safeParse(WeightInput, { date: '2026-11-07', kg: 72, trend: 71 }).success).toBe(false);
	});
});

describe('DeleteWeightInput', () => {
	it('takes only a calendar date', () => {
		expect(v.parse(DeleteWeightInput, { date: '2026-11-07' })).toEqual({ date: '2026-11-07' });
		expect(v.safeParse(DeleteWeightInput, { date: '2026-11-07', kg: 72 }).success).toBe(false);
		expect(v.safeParse(DeleteWeightInput, { date: '7.11.2026' }).success).toBe(false);
		expect(v.safeParse(DeleteWeightInput, { date: '2026-02-30' }).success).toBe(false);
	});
});
