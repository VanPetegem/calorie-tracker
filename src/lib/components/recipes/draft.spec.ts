import { describe, expect, it } from 'vitest';
import { totals } from '#lib/domain/batch.ts';
import type { RecipeDetail } from '#lib/server/recipes/repo.ts';
import {
	draftGrams,
	draftNutrients,
	draftTotals,
	recipeDraft,
	type DraftIngredient
} from './draft.ts';

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

describe('a line with its own snapshot', () => {
	it('is priced from the snapshot instead of its food', () => {
		const snapshot = { kcal: 100, protein: 1, carbs: 1, fat: 1, fiber: null };
		expect(draftNutrients(ingredient({ unit: 'g', amount: 50, snapshot })).kcal).toBe(50);
		expect(draftNutrients(ingredient({ unit: 'g', amount: 50 })).kcal).toBe(300);
	});
});

describe('recipeDraft', () => {
	const detail = (overrides: Partial<RecipeDetail['ingredients'][number]>) =>
		({
			id: 'r1',
			name: 'Dressing',
			defaultPortions: 2.5,
			notes: 'Shake well',
			ingredients: [
				{
					id: 'i1',
					recipeId: 'r1',
					foodId: food.id,
					amount: 2,
					unit: 'serving',
					grams: 30,
					position: 0,
					food: { ...food, brand: null },
					nutrients: { kcal: 180 },
					...overrides
				}
			]
		}) as unknown as RecipeDetail;

	it('carries name, portions, notes and the ingredients', () => {
		const draft = recipeDraft(detail({}));
		expect(draft).toMatchObject({
			id: 'r1',
			name: 'Dressing',
			defaultPortions: 2.5,
			notes: 'Shake well'
		});
		expect(draft.ingredients).toHaveLength(1);
		expect(draft.ingredients[0]).toMatchObject({ amount: 2, unit: 'serving' });
		expect(draft.ingredients[0]!.food).toEqual(food);
	});

	it('gives the editor the same totals as the stored recipe for a serving of a food without weight', () => {
		const [line] = recipeDraft(detail({})).ingredients;
		expect(draftNutrients(line!).kcal).toBe(180);
	});

	it('gives every line its own key', () => {
		const two = detail({});
		two.ingredients.push({ ...two.ingredients[0]!, id: 'i2', position: 1 });
		const keys = recipeDraft(two).ingredients.map((i) => i.key);
		expect(new Set(keys).size).toBe(2);
	});
});
