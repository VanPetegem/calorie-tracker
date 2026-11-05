import { describe, expect, it } from 'vitest';
import {
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
		expect(MACRO_RULE_DEFAULTS).toEqual({ proteinGPerKg: 1.8, fatPct: 0.25, fatMinGPerKg: 0.6 });
		expect(OFF_REFRESH_AGE_DAYS).toBe(180);
		expect(RECENTS_SIZE).toBe(10);
		expect(FREQUENTS_SIZE).toBe(10);
		expect(FREQUENTS_WINDOW_DAYS).toBe(30);
	});
});
