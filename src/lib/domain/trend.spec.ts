import { describe, expect, it } from 'vitest';
import { trendOn, trendSeries, weeklyRate, type TrendPoint, type WeighIn } from './trend';

describe('trendSeries', () => {
	it('gives an empty series for no weigh-ins', () => {
		expect(trendSeries([])).toEqual([]);
	});

	it('gives one weigh-in a trend equal to its weight', () => {
		expect(trendSeries([{ date: '2026-11-01', kg: 70.4 }])).toEqual([
			{ date: '2026-11-01', kg: 70.4, trend: 70.4 }
		]);
	});

	it('starts the trend at the mean of the first three weigh-ins', () => {
		const series = trendSeries([
			{ date: '2026-11-01', kg: 70 },
			{ date: '2026-11-02', kg: 71 },
			{ date: '2026-11-03', kg: 72 }
		]);
		expect(series[0].trend).toBeCloseTo(71, 10);
		// The seed weigh-ins after the first still move the trend from the mean.
		expect(series[1].trend).toBeCloseTo(71, 10);
		expect(series[2].trend).toBeCloseTo(71.1, 10);
	});

	it('takes the mean of the weigh-ins there are when there are fewer than three', () => {
		const series = trendSeries([
			{ date: '2026-11-01', kg: 70 },
			{ date: '2026-11-02', kg: 71 }
		]);
		expect(series[0].trend).toBeCloseTo(70.5, 10);
	});

	it('moves 0.1 of the way to a weigh-in one day later', () => {
		const series = trendSeries([
			{ date: '2026-11-01', kg: 70 },
			{ date: '2026-11-02', kg: 70 },
			{ date: '2026-11-03', kg: 70 },
			{ date: '2026-11-04', kg: 71 }
		]);
		expect(series[3].trend).toBeCloseTo(70.1, 10);
	});

	it('uses 1 - 0.9^5 of the way for a gap of 5 days', () => {
		const series = trendSeries([
			{ date: '2026-11-01', kg: 70 },
			{ date: '2026-11-02', kg: 70 },
			{ date: '2026-11-03', kg: 70 },
			{ date: '2026-11-08', kg: 80 }
		]);
		expect(series[3].trend).toBeCloseTo(70 + (1 - 0.9 ** 5) * 10, 10);
	});

	it('gives unsorted input the same series as the weigh-ins in date order', () => {
		expect(
			trendSeries([
				{ date: '2026-11-01', kg: 70 },
				{ date: '2026-11-02', kg: 70 },
				{ date: '2026-11-03', kg: 70 },
				{ date: '2026-11-05', kg: 71 },
				{ date: '2026-11-04', kg: 72 }
			])
		).toEqual(
			trendSeries([
				{ date: '2026-11-01', kg: 70 },
				{ date: '2026-11-02', kg: 70 },
				{ date: '2026-11-03', kg: 70 },
				{ date: '2026-11-04', kg: 72 },
				{ date: '2026-11-05', kg: 71 }
			])
		);
	});

	it('does not mutate its input', () => {
		const input: WeighIn[] = [
			{ date: '2026-11-03', kg: 72 },
			{ date: '2026-11-01', kg: 70 },
			{ date: '2026-11-02', kg: 71 }
		];
		const before = structuredClone(input);
		trendSeries(input);
		expect(input).toEqual(before);
	});

	it('holds a flat trend when every weigh-in weighs the same', () => {
		const series = trendSeries(
			['2026-11-01', '2026-11-02', '2026-11-05', '2026-11-06', '2026-11-20'].map((date) => ({
				date,
				kg: 72.3
			}))
		);
		expect(series).toHaveLength(5);
		for (const point of series) expect(point.trend).toBeCloseTo(72.3, 10);
	});
});

describe('trendOn', () => {
	const series: TrendPoint[] = [
		{ date: '2026-11-01', kg: 70, trend: 70 },
		{ date: '2026-11-03', kg: 72, trend: 70.5 }
	];

	it('is null before the first weigh-in', () => {
		expect(trendOn(series, '2026-10-31')).toBeNull();
	});

	it('is the trend on a weigh-in date', () => {
		expect(trendOn(series, '2026-11-01')).toBe(70);
		expect(trendOn(series, '2026-11-03')).toBe(70.5);
	});

	it('is the last trend at or before a date between weigh-ins', () => {
		expect(trendOn(series, '2026-11-02')).toBe(70);
	});

	it('stays at the last trend after the last weigh-in', () => {
		expect(trendOn(series, '2026-11-09')).toBe(70.5);
	});
});

describe('weeklyRate', () => {
	it('is null with 13 days of history and set with 14', () => {
		const series: TrendPoint[] = [
			{ date: '2026-10-25', kg: 70, trend: 70 },
			{ date: '2026-11-08', kg: 71.2, trend: 71.2 }
		];
		expect(weeklyRate(series, '2026-11-07')).toBeNull();
		expect(weeklyRate(series, '2026-11-08')).not.toBeNull();
	});

	it('takes the change from the trend 14 days back and divides the percent by the trend today', () => {
		const series: TrendPoint[] = [
			{ date: '2026-10-25', kg: 70, trend: 70 },
			{ date: '2026-11-08', kg: 71.2, trend: 71.2 }
		];
		const rate = weeklyRate(series, '2026-11-08');
		expect(rate?.kg).toBeCloseTo(0.6, 10);
		expect(rate?.pct).toBeCloseTo((0.6 / 71.2) * 100, 10);
		expect(rate?.pct).not.toBeCloseTo((0.6 / 70) * 100, 3);
	});

	it('uses the last trend at or before the day 14 days back', () => {
		const series: TrendPoint[] = [
			{ date: '2026-10-24', kg: 69, trend: 69 },
			{ date: '2026-10-27', kg: 70, trend: 70 },
			{ date: '2026-11-08', kg: 71.2, trend: 71.2 }
		];
		expect(weeklyRate(series, '2026-11-08')?.kg).toBeCloseTo(1.1, 10);
	});

	it('is null for an empty series', () => {
		expect(weeklyRate([], '2026-11-08')).toBeNull();
	});
});
