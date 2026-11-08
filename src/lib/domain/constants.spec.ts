import { describe, expect, it } from 'vitest';
import {
	DEFAULT_ENERGY_DENSITY,
	DEFAULT_GOAL_RATE,
	GOAL_RATES,
	MAX_AGE_YEARS,
	MAX_ENERGY_DENSITY,
	MAX_FAT_PCT,
	MAX_HEIGHT_CM,
	MAX_PROTEIN_G_PER_KG,
	MIN_AGE_YEARS,
	MIN_ENERGY_DENSITY,
	MIN_FAT_PCT,
	MIN_HEIGHT_CM,
	MIN_PROTEIN_G_PER_KG,
	FREQUENTS_SIZE,
	FREQUENTS_WINDOW_DAYS,
	MACRO_RULE_DEFAULTS,
	MAX_AMOUNT_GRAMS_OR_ML,
	MAX_AMOUNT_SERVINGS,
	MAX_KCAL_PER_100,
	MAX_MACRO_PER_100,
	MAX_QUICK_KCAL,
	MIN_KCAL_PER_100,
	MIN_MACRO_PER_100,
	MIN_QUICK_KCAL,
	OFF_REFRESH_AGE_DAYS,
	RECENTS_SIZE
} from './constants';

describe('domain constants', () => {
	it('holds the phase 2 validation limits', () => {
		expect([MIN_KCAL_PER_100, MAX_KCAL_PER_100]).toEqual([0, 900]);
		expect([MIN_MACRO_PER_100, MAX_MACRO_PER_100]).toEqual([0, 100]);
		expect(MAX_AMOUNT_GRAMS_OR_ML).toBe(5000);
		expect(MAX_AMOUNT_SERVINGS).toBe(50);
		expect([MIN_QUICK_KCAL, MAX_QUICK_KCAL]).toEqual([0, 10000]);
	});

	it('holds the macro rule defaults, refresh age and list sizes', () => {
		expect(MACRO_RULE_DEFAULTS).toEqual({ proteinGPerKg: 1.8, fatPct: 0.25 });
		expect(OFF_REFRESH_AGE_DAYS).toBe(180);
		expect(RECENTS_SIZE).toBe(10);
		expect(FREQUENTS_SIZE).toBe(10);
		expect(FREQUENTS_WINDOW_DAYS).toBe(30);
	});

	it('holds the phase 4 profile, goal and rule limits and defaults', () => {
		expect([MIN_HEIGHT_CM, MAX_HEIGHT_CM]).toEqual([100, 250]);
		expect([MIN_AGE_YEARS, MAX_AGE_YEARS]).toEqual([16, 100]);
		expect(GOAL_RATES).toEqual([0.25, 0.35, 0.5]);
		expect(DEFAULT_GOAL_RATE).toBe(0.35);
		expect([MIN_PROTEIN_G_PER_KG, MAX_PROTEIN_G_PER_KG]).toEqual([1.2, 3]);
		expect([MIN_FAT_PCT, MAX_FAT_PCT]).toEqual([0.15, 0.4]);
		expect([MIN_ENERGY_DENSITY, DEFAULT_ENERGY_DENSITY, MAX_ENERGY_DENSITY]).toEqual([
			3000, 5000, 7700
		]);
	});
});
