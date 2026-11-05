import { macroTargets } from '../../domain/targets.ts';
import type { Nutrients } from '../../domain/nutrition.ts';
import type { LogEntry } from '../db/schema.ts';
import { frequents, recents, type RecentFood } from '../foods/repo.ts';
import type { AppContext } from '../context.ts';
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

/** Everything one day's page needs, read in one pass. */
export async function loadDay(ctx: AppContext, date: string): Promise<DayData> {
	const [entries, recentFoods] = await Promise.all([dayEntries(ctx.db, date), recents(ctx.db)]);
	const frequentFoods = await frequents(
		ctx.db,
		ctx.today,
		10,
		recentFoods.map((food) => food.id)
	);
	return {
		date,
		today: ctx.today,
		entries,
		totals: dayTotals(entries),
		target: dayTarget(ctx.settings),
		recents: recentFoods,
		frequents: frequentFoods
	};
}
