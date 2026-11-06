import { describe, expect, it } from 'vitest';
import { macroTargets } from './targets';

describe('macroTargets', () => {
	it('sets protein at 1.8 g per kg, fat at 25% of kcal and carbs with the rest', () => {
		expect(macroTargets(3000, 70)).toEqual({
			proteinG: 126,
			fatG: 83,
			carbsG: 437,
			carbsFloored: false
		});
	});

	it('floors carbs at zero and flags it when protein and fat exceed kcal', () => {
		expect(macroTargets(1000, 120)).toEqual({
			proteinG: 216,
			fatG: 72,
			carbsG: 0,
			carbsFloored: true
		});
	});

	it('raises fat to the per kg minimum when 25% of kcal is lower', () => {
		expect(macroTargets(1500, 100)).toEqual({
			proteinG: 180,
			fatG: 60,
			carbsG: 60,
			carbsFloored: false
		});
	});

	it('rounds whole grams only at the end', () => {
		expect(macroTargets(2000, 60.5)).toEqual({
			proteinG: 109,
			fatG: 56,
			carbsG: 266,
			carbsFloored: false
		});
	});

	it('accepts custom rules', () => {
		expect(macroTargets(2000, 80, { proteinGPerKg: 2, fatPct: 0.3, fatMinGPerKg: 0.5 })).toEqual({
			proteinG: 160,
			fatG: 67,
			carbsG: 190,
			carbsFloored: false
		});
	});
});
