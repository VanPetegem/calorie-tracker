import { FREQUENTS_SIZE, RECENTS_SIZE } from '../../domain/constants.ts';
import { macroTargets } from '../../domain/targets.ts';
import type { Nutrients } from '../../domain/nutrition.ts';
import type { LogEntry } from '../db/schema.ts';
import { frequents, recents, type RecentFood } from '../foods/repo.ts';
import type { AppContext } from '../context.ts';
import type { Db } from '../db/index.ts';
import type { Settings } from '../settings/repo.ts';
import { dayEntries, dayTotals } from './repo.ts';

/** The daily target shown in the hero: kcal as entered, macros from `macroTargets`. */
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
};

/** The manual target, or null while kcal and body weight are not both set. */
export function dayTarget(
	settings: Pick<Settings, 'manualTargetKcal' | 'manualWeightKg'>
): DayTarget | null {
	const { manualTargetKcal: kcal, manualWeightKg: weightKg } = settings;
	if (kcal === null || weightKg === null) return null;
	return { kcal, ...macroTargets(kcal, weightKg) };
}

/** The add sheet's suggestions: recents, then frequents that are not already recents. */
export async function suggestions(
	db: Db,
	today: string
): Promise<{ recents: RecentFood[]; frequents: RecentFood[] }> {
	const recentFoods = await recents(db, RECENTS_SIZE);
	const frequentFoods = await frequents(
		db,
		today,
		FREQUENTS_SIZE,
		recentFoods.map((food) => food.id)
	);
	return { recents: recentFoods, frequents: frequentFoods };
}

/** Everything one day's page needs, read in one pass. */
export async function loadDay(ctx: AppContext, date: string): Promise<DayData> {
	const [entries, suggested] = await Promise.all([
		dayEntries(ctx.db, date),
		suggestions(ctx.db, ctx.today)
	]);
	return {
		date,
		today: ctx.today,
		entries,
		totals: dayTotals(entries),
		target: dayTarget(ctx.settings),
		...suggested
	};
}
