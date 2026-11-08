import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { macroTargets, targetKcal, weekTarget, type Profile, type TargetRules } from './targets';
import { trendSeries, type WeighIn } from './trend';

const RULES = { proteinGPerKg: 1.8, fatPct: 0.25 };

describe('macroTargets', () => {
	it('sets protein at 1.8 g per kg, fat at 25% of kcal and carbs with the rest', () => {
		expect(macroTargets(3000, 70, RULES)).toEqual({
			proteinG: 126,
			fatG: 83,
			carbsG: 437,
			carbsFloored: false
		});
	});

	it('floors carbs at zero and flags it when protein and fat exceed kcal', () => {
		expect(macroTargets(1000, 120, RULES)).toEqual({
			proteinG: 216,
			fatG: 72,
			carbsG: 0,
			carbsFloored: true
		});
	});

	it('raises fat to the per kg minimum when 25% of kcal is lower', () => {
		expect(macroTargets(1500, 100, RULES)).toEqual({
			proteinG: 180,
			fatG: 60,
			carbsG: 60,
			carbsFloored: false
		});
	});

	it('rounds whole grams only at the end', () => {
		expect(macroTargets(2000, 60.5, RULES)).toEqual({
			proteinG: 109,
			fatG: 56,
			carbsG: 266,
			carbsFloored: false
		});
	});

	it('accepts custom rules', () => {
		expect(macroTargets(2000, 80, { proteinGPerKg: 2, fatPct: 0.3 })).toEqual({
			proteinG: 160,
			fatG: 67,
			carbsG: 190,
			carbsFloored: false
		});
	});
});

describe('targetKcal', () => {
	it.each([
		['adds the goal gain at the energy density and rounds to 10 kcal', 2501, 70, 0.35, 5000, 2680],
		['raises a target under 1.05 x TDEE', 2400, 50, 0.25, 5000, 2520],
		['lowers a target over 1.20 x TDEE', 2000, 100, 0.5, 7700, 2400]
	])('%s', (_, tdeeUsed, trendKg, goalRatePct, rho, kcal) => {
		expect(targetKcal(tdeeUsed, trendKg, goalRatePct, rho)).toBe(kcal);
	});
});

describe('weekTarget', () => {
	const WEEK = '2026-11-09';
	// 29 on the week's Monday, 30 the day after.
	const profile: Profile = {
		sex: 'male',
		birthDate: '1996-11-10',
		heightCm: 180,
		activityLevel: 'moderate',
		goalRatePct: 0.5
	};
	const rules: TargetRules = { proteinGPerKg: 1.8, fatPct: 0.25, energyDensity: 5000 };
	const weighInsOn = (offsets: number[], kg = 80): WeighIn[] =>
		offsets.map((n) => ({ date: addDays(WEEK, n), kg }));
	const seriesOf = (weighIns: WeighIn[]) => trendSeries(weighIns, addDays(WEEK, -1));
	const intakesOn = (offsets: number[], kcal: number): Record<string, number> =>
		Object.fromEntries(offsets.map((n) => [addDays(WEEK, n), kcal]));
	// BMR 10 x 80 + 6.25 x 180 - 5 x 29 + 5 = 1785, x 1.55 for moderate.
	const FORMULA = 1785 * 1.55;

	it('smooths the formula TDEE with the previous one when the gate fails', () => {
		const row = weekTarget({
			weekStart: WEEK,
			profile,
			rules,
			series: seriesOf(weighInsOn([-30, -20, -10])),
			intakes: {},
			previousUsed: 2750
		});
		const used = 0.7 * 2750 + 0.3 * FORMULA;
		expect(row).toEqual({
			weekStart: WEEK,
			tdeeFormula: expect.closeTo(FORMULA, 10),
			tdeeAdaptive: null,
			tdeeUsed: expect.closeTo(used, 10),
			// 2755.03 + 0.4 kg x 5000 / 7 = 3040.74.
			targetKcal: 3040,
			proteinG: 144,
			fatG: 84,
			carbsG: 426,
			carbsFloored: false,
			trendKg: 80,
			rateKgPerWeek: 0,
			validDays: 0,
			weighIns: 2
		});
	});

	it('smooths the blended adaptive TDEE with the previous one when the gate passes', () => {
		// The trend rises 0.42 kg over the 21 day window; 0.3 kg in the last 14 days.
		const trends: [number, number][] = [
			[-22, 79.58],
			[-21, 79.6],
			[-17, 79.7],
			[-13, 79.8],
			[-9, 79.9],
			[-5, 79.95],
			[-1, 80]
		];
		const row = weekTarget({
			weekStart: WEEK,
			profile,
			rules,
			series: trends.map(([n, trend]) => ({ date: addDays(WEEK, n), kg: trend, trend })),
			intakes: intakesOn([-14, -13, -12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1], 3000),
			previousUsed: 2800
		});
		// 0.42 kg x 5000 kcal per kg over 21 days is 100 kcal a day stored.
		const blended = (14 * (3000 - 100) + 7 * FORMULA) / 21;
		expect(row).toEqual({
			weekStart: WEEK,
			tdeeFormula: expect.closeTo(FORMULA, 10),
			tdeeAdaptive: expect.closeTo(blended, 10),
			tdeeUsed: expect.closeTo(0.7 * 2800 + 0.3 * blended, 10),
			// 2816.68 + 285.71 = 3102.39.
			targetKcal: 3100,
			proteinG: 144,
			fatG: 86,
			carbsG: 437,
			carbsFloored: false,
			trendKg: 80,
			rateKgPerWeek: expect.closeTo(0.15, 10),
			validDays: 14,
			weighIns: 6
		});
	});

	it('gives the same row whether or not weigh-ins from the week itself exist', () => {
		const before = [
			{ date: addDays(WEEK, -10), kg: 80 },
			{ date: addDays(WEEK, -3), kg: 81 }
		];
		const during = [
			{ date: addDays(WEEK, 0), kg: 90 },
			{ date: addDays(WEEK, 2), kg: 95 },
			{ date: addDays(WEEK, 7), kg: 99 }
		];
		const input = { weekStart: WEEK, profile, rules, intakes: {}, previousUsed: 2700 };
		expect(weekTarget({ ...input, series: seriesOf([...before, ...during]) })).toEqual(
			weekTarget({ ...input, series: seriesOf(before) })
		);
	});

	it('uses the first weigh-in for the trend when none is before the week', () => {
		const row = weekTarget({
			weekStart: WEEK,
			profile,
			rules,
			series: seriesOf(weighInsOn([2]).concat(weighInsOn([3], 82))),
			intakes: {},
			previousUsed: null
		});
		expect(row).toMatchObject({ trendKg: 80, rateKgPerWeek: null, weighIns: 0 });
	});

	it('throws without any weigh-in', () => {
		expect(() =>
			weekTarget({ weekStart: WEEK, profile, rules, series: [], intakes: {}, previousUsed: null })
		).toThrow(RangeError);
	});
});
