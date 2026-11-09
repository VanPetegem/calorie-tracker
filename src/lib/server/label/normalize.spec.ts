import { describe, expect, it } from 'vitest';
import { normalizeLabel, type ModelLabel } from './normalize.ts';

const label: ModelLabel = {
	found: true,
	basis: 'g',
	kcal: 520,
	protein: 6.5,
	carbs: 58,
	fat: 30,
	fiber: 3.2,
	servingG: 25
};

describe('normalizeLabel', () => {
	it('maps a full label, keeping decimals as printed', () => {
		expect(normalizeLabel(label)).toEqual({
			nutritionBasis: 'g',
			kcal: 520,
			protein: 6.5,
			carbs: 58,
			fat: 30,
			fiber: 3.2,
			servingG: 25
		});
	});

	it('keeps the ml basis and null fiber and serving', () => {
		expect(normalizeLabel({ ...label, basis: 'ml', fiber: null, servingG: null })).toMatchObject({
			nutritionBasis: 'ml',
			fiber: null,
			servingG: null
		});
	});

	it('returns null when no per 100 column was found, whatever the numbers say', () => {
		expect(normalizeLabel({ ...label, found: false })).toBeNull();
	});

	it('returns null without kcal, or with kcal outside the range', () => {
		expect(normalizeLabel({ ...label, kcal: null })).toBeNull();
		expect(normalizeLabel({ ...label, kcal: 901 })).toBeNull();
		expect(normalizeLabel({ ...label, kcal: -1 })).toBeNull();
	});

	it('drops other values outside the FoodInput ranges to null instead of clamping', () => {
		expect(
			normalizeLabel({ ...label, protein: 101, carbs: -2, fat: 100.5, fiber: 120, servingG: 5001 })
		).toMatchObject({
			kcal: 520,
			protein: null,
			carbs: null,
			fat: null,
			fiber: null,
			servingG: null
		});
	});

	it('accepts the range edges and drops a zero serving', () => {
		expect(
			normalizeLabel({ ...label, kcal: 900, protein: 100, carbs: 0, servingG: 5000 })
		).toMatchObject({ kcal: 900, protein: 100, carbs: 0, servingG: 5000 });
		expect(normalizeLabel({ ...label, servingG: 0 })).toMatchObject({ servingG: null });
	});
});
