import {
	DAYS_PER_WEEK,
	FAT_MIN_G_PER_KG,
	KCAL_PER_G_CARBS,
	KCAL_PER_G_FAT,
	KCAL_PER_G_PROTEIN,
	TARGET_MAX_FACTOR,
	TARGET_MIN_FACTOR,
	TARGET_ROUND_KCAL
} from './constants';
import { addDays } from './dates';
import {
	adaptiveTdee,
	ageOn,
	bmr,
	formulaTdee,
	smoothTdee,
	type ActivityLevel,
	type Sex
} from './tdee';
import { trendOn, weeklyRate, type TrendPoint } from './trend';

/** The macro rules from settings: protein per kg of trend weight and fat as a share of kcal. */
export type MacroRules = { proteinGPerKg: number; fatPct: number };

/** Every rule from settings behind a week's target: the macro rules and the energy density of gained weight. */
export type TargetRules = MacroRules & { energyDensity: number };

/** The person behind a week's target: a complete profile and the goal rate in percent of trend weight per week. */
export type Profile = {
	sex: Sex;
	birthDate: string;
	heightCm: number;
	activityLevel: ActivityLevel;
	goalRatePct: number;
};

/** One `weekly_targets` row, every column but `computed_at`. */
export type WeekTargetRow = {
	weekStart: string;
	tdeeFormula: number;
	tdeeAdaptive: number | null;
	tdeeUsed: number;
	targetKcal: number;
	proteinG: number;
	carbsG: number;
	fatG: number;
	carbsFloored: boolean;
	trendKg: number;
	rateKgPerWeek: number | null;
	validDays: number;
	weighIns: number;
};

/**
 * Daily macro targets in whole grams. Protein is set per kg of trend weight. Fat is the larger of its share of kcal
 * and FAT_MIN_G_PER_KG. Carbs take the remaining kcal and are floored at zero. Math runs on raw values and rounds only
 * at the end.
 */
export function macroTargets(
	kcal: number,
	weightKg: number,
	rules: MacroRules
): { proteinG: number; fatG: number; carbsG: number; carbsFloored: boolean } {
	const proteinG = rules.proteinGPerKg * weightKg;
	// Fat in kcal avoids float error that would shift carbs across a rounding boundary.
	const fatKcal = Math.max(rules.fatPct * kcal, FAT_MIN_G_PER_KG * weightKg * KCAL_PER_G_FAT);
	const carbsRaw = (kcal - proteinG * KCAL_PER_G_PROTEIN - fatKcal) / KCAL_PER_G_CARBS;
	const carbsFloored = carbsRaw < 0;
	return {
		proteinG: Math.round(proteinG),
		fatG: Math.round(fatKcal / KCAL_PER_G_FAT),
		carbsG: carbsFloored ? 0 : Math.round(carbsRaw),
		carbsFloored
	};
}

/**
 * Daily target kcal: the TDEE used plus the daily share of the goal gain (`goalRatePct` percent of trend weight per
 * week at `rho` kcal per kg), clamped to TARGET_MIN_FACTOR to TARGET_MAX_FACTOR times the TDEE used, then rounded to
 * TARGET_ROUND_KCAL.
 */
export function targetKcal(
	tdeeUsed: number,
	trendKg: number,
	goalRatePct: number,
	rho: number
): number {
	const goalKgPerWeek = (trendKg * goalRatePct) / 100;
	const raw = tdeeUsed + (goalKgPerWeek * rho) / DAYS_PER_WEEK;
	const clamped = Math.min(
		TARGET_MAX_FACTOR * tdeeUsed,
		Math.max(TARGET_MIN_FACTOR * tdeeUsed, raw)
	);
	return Math.round(clamped / TARGET_ROUND_KCAL) * TARGET_ROUND_KCAL;
}

/**
 * The target row of the week starting `weekStart`. Everything comes from the days before that Monday: the trend and
 * rate on the Sunday before, and the adaptive window ending there, so weigh-ins and intakes from the week itself never
 * change the row. Pass `trendSeries(weighIns, addDays(weekStart, -1))` built from the weigh-ins dated before
 * `weekStart`. When there are none (the first week, where the onboarding weigh-in is today), pass the single earliest
 * weigh-in ever instead (`rowWeighIns` in the targets repository does both): its kg stands in for the trend and the
 * rate is null, and later weigh-ins of the week cannot change the row.
 * `previousUsed` is the TDEE used of the latest earlier row, null for the first. Age is taken on `weekStart`.
 * Throws a RangeError for an empty series.
 */
export function weekTarget(input: {
	weekStart: string;
	profile: Profile;
	rules: TargetRules;
	series: TrendPoint[];
	intakes: Record<string, number>;
	previousUsed: number | null;
}): WeekTargetRow {
	const { weekStart, profile, rules, series, intakes, previousUsed } = input;
	const sunday = addDays(weekStart, -1);
	const trendKg = trendOn(series, sunday) ?? series.at(0)?.kg;
	if (trendKg === undefined) throw new RangeError('weekTarget needs at least one weigh-in');

	const tdeeFormula = formulaTdee(
		bmr({
			sex: profile.sex,
			kg: trendKg,
			heightCm: profile.heightCm,
			ageYears: ageOn(profile.birthDate, weekStart)
		}),
		profile.activityLevel
	);
	const adaptive = adaptiveTdee({
		intakes,
		series,
		windowEnd: weekStart,
		formulaTdee: tdeeFormula,
		rho: rules.energyDensity
	});
	const tdeeUsed = smoothTdee(adaptive.blended ?? tdeeFormula, previousUsed);
	const kcal = targetKcal(tdeeUsed, trendKg, profile.goalRatePct, rules.energyDensity);
	return {
		weekStart,
		tdeeFormula,
		tdeeAdaptive: adaptive.blended,
		tdeeUsed,
		targetKcal: kcal,
		...macroTargets(kcal, trendKg, rules),
		trendKg,
		rateKgPerWeek: weeklyRate(series, sunday)?.kg ?? null,
		validDays: adaptive.validDays,
		weighIns: adaptive.weighIns
	};
}
