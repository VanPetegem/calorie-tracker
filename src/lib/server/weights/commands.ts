import { trendOn, trendSeries, weeklyRate, type TrendPoint } from '../../domain/trend.ts';
import type { DeleteWeightInput, TodayWeightInput, WeightInput } from '../../schemas/weight.ts';
import type { Db } from '../db/index.ts';
import { assertLogDate } from '../log/repo.ts';
import { deleteWeight, listWeights, restoreWeight, saveWeight, weightOn } from './repo.ts';

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
 * Saves a weigh-in and says whether its date already had one (the toast says "Updated" or "Logged"). The repository
 * does not check the date window (the schema cannot know today), so this does: a date after tomorrow is a 400 and
 * nothing is written.
 */
export async function saveWeightOn(
	ctx: WeightContext,
	input: WeightInput
): Promise<{ existed: boolean }> {
	assertLogDate(input.date, ctx.today);
	const existed = (await weightOn(ctx.db, input.date)) !== null;
	await saveWeight(ctx.db, input);
	return { existed };
}

/**
 * Saves the entry card's weigh-in on the server's today. The page's own `today` is fixed at load, so a page left open
 * past midnight, or a Retry after an offline resume, would otherwise overwrite the day before.
 */
export async function logWeightTodayOn(
	ctx: WeightContext,
	input: TodayWeightInput
): Promise<{ existed: boolean }> {
	return saveWeightOn(ctx, { date: ctx.today, kg: input.kg });
}

/**
 * Deletes the weigh-in of a date and says whether there was one, so the page offers Undo only for a real delete. No
 * date window: a stored weigh-in that moved past tomorrow (a timezone change) must still be deletable.
 */
export async function deleteWeightOn(
	ctx: WeightContext,
	input: DeleteWeightInput
): Promise<{ removed: boolean }> {
	return { removed: await deleteWeight(ctx.db, input.date) };
}

/** Undo of a delete: puts the weigh-in back only when its date has none again, and says whether it did. */
export async function restoreWeightOn(
	ctx: WeightContext,
	input: WeightInput
): Promise<{ restored: boolean }> {
	return { restored: await restoreWeight(ctx.db, input) };
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
