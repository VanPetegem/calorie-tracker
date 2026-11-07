import { DAYS_PER_WEEK } from '#lib/domain/constants.ts';
import { addDays, daysBetween } from '#lib/domain/dates.ts';
import type { TrendPoint } from '#lib/domain/trend.ts';

/** The ranges of the chart's range control. `days` is the number of calendar days ending today; null is all. */
export const RANGES = [
	{ key: '30', label: '30 days', days: 30 },
	{ key: '90', label: '90 days', days: 90 },
	{ key: '365', label: '1 year', days: 365 },
	{ key: 'all', label: 'All', days: null }
] as const;

export type RangeKey = (typeof RANGES)[number]['key'];

/** A stored range key, or null when it is not one of the four. */
export function parseRange(raw: string | null): RangeKey | null {
	return RANGES.find((range) => range.key === raw)?.key ?? null;
}

/**
 * The points inside the last `rangeDays` calendar days, today included (30 days start 29 days before today), and
 * every later point (a weigh-in for tomorrow). Null keeps everything. `series` is sorted, as `trendSeries` returns it.
 */
export function visiblePoints(
	series: TrendPoint[],
	today: string,
	rangeDays: number | null
): TrendPoint[] {
	if (rangeDays === null) return series;
	const first = addDays(today, -(rangeDays - 1));
	return series.filter((point) => point.date >= first);
}

export type Domain = { min: number; max: number };

/**
 * The y domain that fits the weights and the trend of the points, `padKg` above and below. A flat series gets the
 * same padding, so its line is not on the edge. Null without points.
 */
export function yDomain(points: TrendPoint[], padKg: number): Domain | null {
	if (points.length === 0) return null;
	let min = Infinity;
	let max = -Infinity;
	for (const point of points) {
		min = Math.min(min, point.kg, point.trend);
		max = Math.max(max, point.kg, point.trend);
	}
	// Rounded so 69.8 - 0.5 is 69.3, not 69.30000000000001.
	return { min: round(min - padKg, 6), max: round(max + padKg, 6) };
}

/** A function that maps a value of `domain` onto `range` (which may run backwards). An empty domain maps to the middle. */
export function scale(domain: Domain, range: [number, number]): (value: number) => number {
	const span = domain.max - domain.min;
	const [from, to] = range;
	if (span === 0) return () => (from + to) / 2;
	return (value) => from + ((value - domain.min) / span) * (to - from);
}

/** Round tick values inside the domain, never more than `count`, as many as fit. Empty for an empty domain. */
export function niceTicks(domain: Domain, count: number): number[] {
	const span = domain.max - domain.min;
	if (!(span > 0) || count < 2) return [];
	const magnitude = 10 ** Math.floor(Math.log10(span / count));
	const steps = [1, 2, 5, 10, 20, 50].map((m) => m * magnitude);
	for (const step of steps) {
		const ticks = ticksAt(domain, step);
		if (ticks.length <= count) return ticks;
	}
	return [];
}

function ticksAt(domain: Domain, step: number): number[] {
	const ticks: number[] = [];
	for (let i = Math.ceil(domain.min / step - 1e-9); ; i++) {
		const value = round(i * step, 6);
		if (value > domain.max + 1e-9) return ticks;
		ticks.push(value);
	}
}

/** An SVG path through the points, with coordinates rounded to 2 places. Empty for no points. */
export function linePath(points: { x: number; y: number }[]): string {
	return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x, 2)} ${round(p.y, 2)}`).join('');
}

/** The index of the x closest to `x` (the first of two), or -1 for no xs. */
export function nearestIndex(xs: number[], x: number): number {
	let best = -1;
	let distance = Infinity;
	xs.forEach((candidate, i) => {
		const d = Math.abs(candidate - x);
		if (d < distance) {
			best = i;
			distance = d;
		}
	});
	return best;
}

export type Goal = { from: string; trendKg: number; kgPerWeek: number };

/**
 * The goal slope inside the dates `window`: from the goal's start (or the window start, when the goal began earlier)
 * to the window end. Null when the goal starts after the window.
 */
export function goalLine(
	goal: Goal,
	window: { start: string; end: string }
): { start: { date: string; kg: number }; end: { date: string; kg: number } } | null {
	if (goal.from > window.end) return null;
	const at = (date: string) => ({
		date,
		kg: goal.trendKg + (goal.kgPerWeek * daysBetween(goal.from, date)) / DAYS_PER_WEEK
	});
	return { start: at(goal.from > window.start ? goal.from : window.start), end: at(window.end) };
}

const parts = new Intl.DateTimeFormat('en-GB', {
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC'
});

/** A `YYYY-MM-DD` date as "Sat 7 Nov", or "Sat 7 Nov 2026" with `year`. Built from parts, so no locale adds commas. */
export function formatDay(date: string, options: { year?: boolean } = {}): string {
	const field = (type: Intl.DateTimeFormatPartTypes) =>
		parts.formatToParts(new Date(`${date}T00:00:00Z`)).find((part) => part.type === type)?.value;
	const text = `${field('weekday')} ${field('day')} ${field('month')}`;
	return options.year ? `${text} ${field('year')}` : text;
}

const kgFormat = new Intl.NumberFormat('en-GB', {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
	useGrouping: false
});

/** A weight with one decimal, "71.2". The unit is the caller's. */
export function formatKg(kg: number): string {
	return kgFormat.format(kg);
}

/** A number with a sign for anything but zero and `digits` decimals: "+0.24", "-0.30", "0.00". */
export function formatSigned(value: number, digits: number): string {
	return new Intl.NumberFormat('en-GB', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
		signDisplay: 'exceptZero',
		useGrouping: false
	}).format(value);
}

const tickDay = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	timeZone: 'UTC'
});
const tickMonth = new Intl.DateTimeFormat('en-GB', {
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC'
});

/** An x axis label: "7 Nov", or "Nov 2026" when the axis spans more than `LONG_AXIS_DAYS` days. */
export function formatTick(date: string, spanDays: number): string {
	const instant = new Date(`${date}T00:00:00Z`);
	return (spanDays > LONG_AXIS_DAYS ? tickMonth : tickDay).format(instant);
}

/** Beyond this many days the x axis names months and years instead of days. */
const LONG_AXIS_DAYS = 200;

function round(value: number, places: number): number {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}
