import { trendOn, trendSeries, weeklyRate, type TrendPoint } from '../../domain/trend.ts';
import type { DeleteWeightInput, TodayWeightInput, WeightInput } from '../../schemas/weight.ts';
import type { Db } from '../db/index.ts';
import { assertLogDate } from '../log/repo.ts';
import { deleteWeight, listWeights, saveWeight } from './repo.ts';

/** What the weight commands and the page load need: the database and today in the settings timezone. */
export type WeightContext = { db: Db; today: string };

/** What the Weight page loads. `lastKg` is the latest weigh-in up to today, the entry field's prefill. */
export type WeightData = {
	today: string;
	series: TrendPoint[];
	todayKg: number | null;
	lastKg: number | null;
	trendKg: number | null;
	rate: { kg: number; pct: number } | null;
};

/**
 * Saves a weigh-in. The repository does not check the date window (the schema cannot know today), so this does:
 * a date after tomorrow is a 400 and nothing is written.
 */
export async function saveWeightOn(ctx: WeightContext, input: WeightInput): Promise<void> {
	assertLogDate(input.date, ctx.today);
	await saveWeight(ctx.db, input);
}

/**
 * Saves the entry card's weigh-in on the server's today. The page's own `today` is fixed at load, so a page left open
 * past midnight, or a Retry after an offline resume, would otherwise overwrite the day before.
 */
export async function logWeightTodayOn(ctx: WeightContext, input: TodayWeightInput): Promise<void> {
	await saveWeightOn(ctx, { date: ctx.today, kg: input.kg });
}

/** Deletes the weigh-in of a date, with the same date window as saving. */
export async function deleteWeightOn(ctx: WeightContext, input: DeleteWeightInput): Promise<void> {
	assertLogDate(input.date, ctx.today);
	await deleteWeight(ctx.db, input.date);
}

/** The Weight page: every weigh-in with its trend, today's weigh-in, the latest up to today, trend and weekly rate. */
export async function loadWeight({ db, today }: WeightContext): Promise<WeightData> {
	const series = trendSeries(await listWeights(db), today);
	const upToToday = series.filter((point) => point.date <= today);
	return {
		today,
		series,
		todayKg: series.find((point) => point.date === today)?.kg ?? null,
		lastKg: upToToday.at(-1)?.kg ?? null,
		trendKg: trendOn(series, today),
		rate: weeklyRate(series, today)
	};
}
