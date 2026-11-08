import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { adaptiveTdee, ageOn, bmr, formulaTdee, smoothTdee, type ActivityLevel } from './tdee';
import type { TrendPoint } from './trend';

describe('bmr', () => {
	it.each([
		['male', 80, 180, 30, 1780],
		['female', 60, 165, 30, 1320.25]
	] as const)(
		'gives Mifflin St Jeor for a %s of %i kg, %i cm, %i years',
		(sex, kg, heightCm, ageYears, kcal) => {
			expect(bmr({ sex, kg, heightCm, ageYears })).toBeCloseTo(kcal, 10);
		}
	);
});

describe('ageOn', () => {
	it('counts whole years, adding one on the birthday', () => {
		expect(ageOn('1996-11-10', '2026-11-09')).toBe(29);
		expect(ageOn('1996-11-10', '2026-11-10')).toBe(30);
	});
});

describe('formulaTdee', () => {
	it('multiplies BMR by the activity level', () => {
		const levels: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
		const tdees = levels.map((level) => formulaTdee(1000, level));
		[1200, 1375, 1550, 1725, 1900].forEach((kcal, i) => expect(tdees[i]).toBeCloseTo(kcal, 10));
	});
});

describe('adaptiveTdee', () => {
	const WINDOW_END = '2026-11-09';
	/** The 21 days of the window, oldest first: the day 21 days before WINDOW_END to the day before it. */
	const windowDays = Array.from({ length: 21 }, (_, i) => addDays(WINDOW_END, i - 21));
	const intakesOn = (dates: string[], kcal: number): Record<string, number> =>
		Object.fromEntries(dates.map((date) => [date, kcal]));
	const flatSeries = (dates: string[]): TrendPoint[] =>
		dates.map((date) => ({ date, kg: 70, trend: 70 }));
	const base = { windowEnd: WINDOW_END, formulaTdee: 2500, rho: 5000 };

	it.each([
		[13, 6, null],
		[14, 6, 2400],
		[14, 5, null]
	])('with %i valid days and %i weigh-ins gives observed %s', (days, weighIns, observed) => {
		const result = adaptiveTdee({
			...base,
			intakes: intakesOn(windowDays.slice(0, days), 2400),
			series: flatSeries(windowDays.slice(0, weighIns))
		});
		expect(result).toEqual({
			observed,
			blended: observed === null ? null : expect.any(Number),
			validDays: days,
			weighIns
		});
	});

	it('counts the 21 days before windowEnd, not windowEnd itself or the day before the window', () => {
		const outside = [WINDOW_END, addDays(WINDOW_END, -22)];
		const result = adaptiveTdee({
			...base,
			intakes: { ...intakesOn(windowDays.slice(0, 14), 2400), ...intakesOn(outside, 2400) },
			series: flatSeries([outside[1], ...windowDays.slice(0, 5), outside[0]])
		});
		expect(result).toMatchObject({ validDays: 14, weighIns: 5 });
	});

	it('leaves out days under half the median intake, and observed is the mean of the rest on a flat trend', () => {
		const intakes = {
			...intakesOn(windowDays.slice(0, 15), 2000),
			[windowDays[15]]: 980,
			[windowDays[16]]: 1000
		};
		const result = adaptiveTdee({ ...base, intakes, series: flatSeries(windowDays.slice(0, 6)) });
		expect(result.validDays).toBe(16);
		expect(result.observed).toBeCloseTo((15 * 2000 + 1000) / 16, 10);
	});

	it('takes the trend change over the window, from the day before it to its last day, off the mean intake', () => {
		const series: TrendPoint[] = [
			{ date: addDays(WINDOW_END, -22), kg: 70, trend: 70 },
			...[0, 4, 8, 12, 16].map((i, k) => ({ date: windowDays[i], kg: 70, trend: 70.1 + k * 0.05 })),
			{ date: windowDays[20], kg: 70.5, trend: 70.5 },
			{ date: WINDOW_END, kg: 80, trend: 80 }
		];
		const result = adaptiveTdee({
			...base,
			rho: 4200,
			intakes: intakesOn(windowDays.slice(7), 2600),
			series
		});
		// 0.5 kg over 21 days at 4200 kcal per kg stores 100 kcal a day.
		expect(result.observed).toBeCloseTo(2500, 10);
	});

	it('measures the trend change from the first weigh-in when the series starts inside the window', () => {
		const series: TrendPoint[] = [
			...[0, 4, 8, 12, 16].map((i, k) => ({ date: windowDays[i], kg: 70, trend: 70 + k * 0.1 })),
			{ date: windowDays[20], kg: 70.5, trend: 70.5 }
		];
		const result = adaptiveTdee({
			...base,
			rho: 4000,
			intakes: intakesOn(windowDays.slice(7), 2600),
			series
		});
		// 0.5 kg over the 20 days from the first weigh-in at 4000 kcal per kg stores 100 kcal a day.
		expect(result.observed).toBeCloseTo(2500, 10);
	});

	it('blends observed with the formula, weighting the formula as 7 days', () => {
		const result = adaptiveTdee({
			...base,
			intakes: intakesOn(windowDays.slice(0, 14), 2400),
			series: flatSeries(windowDays.slice(0, 6))
		});
		expect(result.blended).toBeCloseTo((14 * 2400 + 7 * 2500) / 21, 10);
	});
});

describe('smoothTdee', () => {
	it.each([
		['uses the new value as is without a previous one', 2600, null, 2600],
		['moves 30 percent of the way from the previous value', 2600, 2500, 2530],
		['limits a rise to 150 kcal', 3500, 2500, 2650],
		['limits a fall to 150 kcal', 1500, 2500, 2350]
	])('%s', (_, next, previous, used) => {
		expect(smoothTdee(next, previous)).toBeCloseTo(used, 10);
	});
});
