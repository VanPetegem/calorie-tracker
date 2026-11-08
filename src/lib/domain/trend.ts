import { addDays, daysBetween } from './dates';
import {
	DAYS_PER_WEEK,
	PERCENT,
	RATE_WINDOW_DAYS,
	TREND_ALPHA,
	TREND_SEED_WEIGH_INS
} from './constants';

/** A weigh-in: a local calendar date (`YYYY-MM-DD`) and the weight in kg. */
export type WeighIn = { date: string; kg: number };

/** A weigh-in with the weight trend on its date. */
export type TrendPoint = WeighIn & { trend: number };

/**
 * The weight trend of every weigh-in, oldest first. The trend starts at the mean of the first weigh-ins (up to
 * TREND_SEED_WEIGH_INS) and moves toward each later weigh-in by a share that grows with the days since the previous
 * one: 1 - (1 - TREND_ALPHA)^days. With `seedUntil`, only weigh-ins on or before it enter the seed (when there are
 * any), so a weigh-in for tomorrow cannot change today's trend. The input is not changed.
 */
export function trendSeries(weighIns: WeighIn[], seedUntil?: string): TrendPoint[] {
	if (weighIns.length === 0) return [];
	const sorted = [...weighIns].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
	const seedable =
		seedUntil === undefined ? sorted : sorted.filter((weighIn) => weighIn.date <= seedUntil);
	const seed = (seedable.length > 0 ? seedable : sorted).slice(0, TREND_SEED_WEIGH_INS);
	let trend = seed.reduce((sum, weighIn) => sum + weighIn.kg, 0) / seed.length;
	const first = sorted[0];
	const series: TrendPoint[] = [{ date: first.date, kg: first.kg, trend }];
	for (let i = 1; i < sorted.length; i++) {
		const { date, kg } = sorted[i];
		const days = daysBetween(sorted[i - 1].date, date);
		const share = 1 - (1 - TREND_ALPHA) ** days;
		trend = trend + share * (kg - trend);
		series.push({ date, kg, trend });
	}
	return series;
}

/**
 * The trend on a date: the trend of the last point at or before it, null before the first weigh-in. `series` is
 * sorted by date, as `trendSeries` returns it.
 */
export function trendOn(series: TrendPoint[], date: string): number | null {
	const last = series.findLast((point) => point.date <= date);
	return last ? last.trend : null;
}

/**
 * The weekly weight change at `today`, in kg and in percent of today's trend. Null while there is no trend
 * RATE_WINDOW_DAYS days before `today`. Values are not rounded.
 */
export function weeklyRate(
	series: TrendPoint[],
	today: string
): { kg: number; pct: number } | null {
	const earlier = trendOn(series, addDays(today, -RATE_WINDOW_DAYS));
	const now = trendOn(series, today);
	if (earlier === null || now === null) return null;
	const kg = (DAYS_PER_WEEK * (now - earlier)) / RATE_WINDOW_DAYS;
	return { kg, pct: (kg / now) * PERCENT };
}
