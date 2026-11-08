import { FREQUENTS_SIZE, RECENTS_SIZE } from '../../domain/constants.ts';
import type { Nutrients } from '../../domain/nutrition.ts';
import { activeBatches, portionWeights, type BatchSummary } from '../batches/repo.ts';
import type { LogEntry } from '../db/schema.ts';
import { frequents, recents, type RecentFood } from '../foods/repo.ts';
import type { AppContext } from '../context.ts';
import type { Db } from '../db/index.ts';
import { dayEntries, dayTotals } from './repo.ts';

/** The daily target shown in the hero: kcal and macros of the day's week. */
export type DayTarget = {
	kcal: number;
	proteinG: number;
	fatG: number;
	carbsG: number;
	carbsFloored: boolean;
};

/** What the Today and day pages load. `today` lets the page decide what "next" and the title mean. */
export type DayData = {
	date: string;
	today: string;
	entries: LogEntry[];
	totals: Nutrients;
	target: DayTarget | null;
	recents: RecentFood[];
	frequents: RecentFood[];
	/** Active batches, newest cooked first, for the add sheet. */
	batches: BatchSummary[];
	/**
	 * The current portion weight (cooked weight / portions) of each batch the day's batch entries point to, finished
	 * batches included; null without a cooked weight. The edit preview of a grams to portions switch needs it, because
	 * the server converts with the batch's weight as it is now.
	 */
	batchPortionG: Record<string, number | null>;
};

/**
 * The add sheet's suggestions: the active batches (which also finishes the stale ones), recents, then frequents that
 * are not already recents.
 */
export async function suggestions(
	db: Db,
	today: string,
	now: Date
): Promise<{ recents: RecentFood[]; frequents: RecentFood[]; batches: BatchSummary[] }> {
	const recentFoods = await recents(db, RECENTS_SIZE);
	const [frequentFoods, batches] = await Promise.all([
		frequents(
			db,
			today,
			FREQUENTS_SIZE,
			recentFoods.map((food) => food.id)
		),
		activeBatches(db, now)
	]);
	return { recents: recentFoods, frequents: frequentFoods, batches };
}

/** Everything one day's page needs, read in one pass. */
export async function loadDay(ctx: AppContext, date: string): Promise<DayData> {
	const [entries, suggested] = await Promise.all([
		dayEntries(ctx.db, date),
		suggestions(ctx.db, ctx.today, ctx.now)
	]);
	const batchIds = new Set<string>();
	for (const entry of entries) if (entry.batchId !== null) batchIds.add(entry.batchId);
	return {
		date,
		today: ctx.today,
		entries,
		totals: dayTotals(entries),
		// The manual target is gone; the week's target from `weekly_targets` takes its place.
		target: null,
		...suggested,
		batchPortionG: await portionWeights(ctx.db, [...batchIds])
	};
}
