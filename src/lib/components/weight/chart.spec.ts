import { describe, expect, it } from 'vitest';
import type { TrendPoint } from '#lib/domain/trend.ts';
import {
	formatDay,
	formatKg,
	formatSigned,
	formatTick,
	goalLine,
	linePath,
	nearestIndex,
	niceTicks,
	parseRange,
	scale,
	visiblePoints,
	yDomain
} from './chart.ts';

const point = (date: string, kg: number, trend = kg): TrendPoint => ({ date, kg, trend });
const today = '2026-11-07';

describe('visiblePoints', () => {
	const series = [
		point('2026-10-08', 70),
		point('2026-10-09', 71),
		point('2026-11-07', 72),
		point('2026-11-08', 73)
	];

	it('keeps the last 30 calendar days with today, and a weigh-in logged for tomorrow', () => {
		// 30 days with today start on 2026-10-09; 2026-10-08 is the 31st day back.
		expect(visiblePoints(series, today, 30).map((p) => p.date)).toEqual([
			'2026-10-09',
			'2026-11-07',
			'2026-11-08'
		]);
	});

	it('keeps everything for no range', () => {
		expect(visiblePoints(series, today, null)).toHaveLength(4);
	});

	it('gives nothing for an empty series and keeps the order', () => {
		expect(visiblePoints([], today, 30)).toEqual([]);
		expect(visiblePoints(series, today, 365).map((p) => p.date)).toEqual(series.map((p) => p.date));
	});
});

describe('yDomain', () => {
	it('is null without points', () => {
		expect(yDomain([], 0.5)).toBeNull();
	});

	it('pads the lowest and the highest of the weights and the trend', () => {
		const domain = yDomain([point('2026-11-01', 70, 70.5), point('2026-11-02', 72, 69.8)], 0.5);
		expect(domain).toEqual({ min: 69.3, max: 72.5 });
	});

	it('gives flat data and a single point a span, so the line is not on the edge', () => {
		expect(yDomain([point('2026-11-01', 70)], 0.5)).toEqual({ min: 69.5, max: 70.5 });
		expect(yDomain([point('2026-11-01', 70), point('2026-11-02', 70)], 0.5)).toEqual({
			min: 69.5,
			max: 70.5
		});
	});
});

describe('scale', () => {
	it('maps the domain onto the range, also upside down', () => {
		expect(scale({ min: 0, max: 10 }, [0, 100])(2.5)).toBe(25);
		expect(scale({ min: 60, max: 80 }, [200, 0])(70)).toBe(100);
	});

	it('puts a value of an empty domain in the middle of the range', () => {
		expect(scale({ min: 5, max: 5 }, [0, 100])(5)).toBe(50);
	});
});

describe('niceTicks', () => {
	it('picks round values inside the domain', () => {
		expect(niceTicks({ min: 69.5, max: 70.5 }, 4)).toEqual([69.5, 70, 70.5]);
		expect(niceTicks({ min: 68.2, max: 74.9 }, 4)).toEqual([70, 72, 74]);
	});

	it('gives none for an empty domain', () => {
		expect(niceTicks({ min: 70, max: 70 }, 4)).toEqual([]);
	});

	it('never gives more than the count, and always some, for any span', () => {
		for (const span of [0.3, 0.7, 1, 1.5, 3.3, 6.7, 12, 45, 130]) {
			for (const min of [19.9, 69.3, 70, 118.45]) {
				const ticks = niceTicks({ min, max: min + span }, 5);
				expect(ticks.length, `${min} + ${span}`).toBeGreaterThan(0);
				expect(ticks.length, `${min} + ${span}`).toBeLessThanOrEqual(5);
			}
		}
	});
});

describe('linePath', () => {
	it('is empty for no points and a move then lines otherwise, rounded to 2 places', () => {
		expect(linePath([])).toBe('');
		expect(
			linePath([
				{ x: 0, y: 10.123 },
				{ x: 5.5, y: 20 }
			])
		).toBe('M0 10.12L5.5 20');
	});
});

describe('nearestIndex', () => {
	it('finds the closest x, the first of two equal distances, and -1 for none', () => {
		expect(nearestIndex([10, 20, 40], 26)).toBe(1);
		expect(nearestIndex([10, 20, 40], 31)).toBe(2);
		expect(nearestIndex([10, 20], 15)).toBe(0);
		expect(nearestIndex([], 15)).toBe(-1);
	});
});

describe('goalLine', () => {
	const goal = { from: '2026-11-02', trendKg: 70, kgPerWeek: 0.35 };

	it('runs from the goal start to the end of the window at the goal slope', () => {
		expect(goalLine(goal, { start: '2026-10-09', end: '2026-11-09' })).toEqual({
			start: { date: '2026-11-02', kg: 70 },
			end: { date: '2026-11-09', kg: 70.35 }
		});
	});

	it('starts at the window start, on the slope, when the goal began earlier', () => {
		const line = goalLine(goal, { start: '2026-11-09', end: '2026-11-16' });
		expect(line?.start.date).toBe('2026-11-09');
		expect(line?.start.kg).toBeCloseTo(70.35, 10);
		expect(line?.end.kg).toBeCloseTo(70.7, 10);
	});

	it('is null when the goal starts after the window', () => {
		expect(goalLine(goal, { start: '2026-10-09', end: '2026-11-01' })).toBeNull();
	});
});

describe('parseRange', () => {
	it('accepts the four ranges and nothing else', () => {
		for (const key of ['30', '90', '365', 'all']) expect(parseRange(key)).toBe(key);
		for (const bad of [null, '', '7', 'ALL', '30 ']) expect(parseRange(bad)).toBeNull();
	});
});

describe('formatDay', () => {
	it('names the weekday, day and month, and the year on request', () => {
		expect(formatDay('2026-11-07')).toBe('Sat 7 Nov');
		expect(formatDay('2026-11-07', { year: true })).toBe('Sat 7 Nov 2026');
	});
});

describe('formatKg', () => {
	it('shows one decimal', () => {
		expect(formatKg(71.24)).toBe('71.2');
		expect(formatKg(70)).toBe('70.0');
		expect(formatKg(1234.56)).toBe('1234.6');
	});
});

describe('formatSigned', () => {
	it('signs gains and losses and leaves zero bare, also after rounding', () => {
		expect(formatSigned(0.2449, 2)).toBe('+0.24');
		expect(formatSigned(-0.3, 2)).toBe('-0.30');
		expect(formatSigned(0, 2)).toBe('0.00');
		expect(formatSigned(-0.001, 2)).toBe('0.00');
	});
});

describe('formatTick', () => {
	it('names the day on a short axis and the month and year on a long one', () => {
		expect(formatTick('2026-11-07', 30)).toBe('7 Nov');
		expect(formatTick('2026-11-07', 200)).toBe('7 Nov');
		expect(formatTick('2026-11-07', 201)).toBe('Nov 2026');
	});
});
