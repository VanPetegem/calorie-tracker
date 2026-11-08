import {
	ADAPTIVE_WINDOW_DAYS,
	BLEND_PRIOR_DAYS,
	BMR_KCAL_PER_CM,
	BMR_KCAL_PER_KG,
	BMR_KCAL_PER_YEAR,
	BMR_SEX_OFFSET,
	MAX_AGE_YEARS,
	MAX_WEEKLY_TDEE_CHANGE,
	MIN_AGE_YEARS,
	MIN_VALID_DAYS,
	MIN_WEIGH_INS,
	PAL,
	TDEE_SMOOTHING,
	VALID_INTAKE_FRACTION
} from './constants';
import { addDays, daysBetween } from './dates';
import { trendOn, type TrendPoint } from './trend';

export type Sex = keyof typeof BMR_SEX_OFFSET;
export type ActivityLevel = keyof typeof PAL;

/** Basal metabolic rate in kcal per day by Mifflin St Jeor. Not rounded. */
export function bmr(input: { sex: Sex; kg: number; heightCm: number; ageYears: number }): number {
	return (
		BMR_KCAL_PER_KG * input.kg +
		BMR_KCAL_PER_CM * input.heightCm -
		BMR_KCAL_PER_YEAR * input.ageYears +
		BMR_SEX_OFFSET[input.sex]
	);
}

/** Age in whole years on `date`; the year is counted from the birthday itself. Both are `YYYY-MM-DD`. */
export function ageOn(birthDate: string, date: string): number {
	const [birthYear, birthMonthDay] = splitYear(birthDate);
	const [year, monthDay] = splitYear(date);
	return year - birthYear - (monthDay < birthMonthDay ? 1 : 0);
}

function splitYear(date: string): [number, string] {
	const [year, month, day] = date.split('-');
	return [Number(year), `${month}-${day}`];
}

/** True when the age on `today` is MIN_AGE_YEARS to MAX_AGE_YEARS, both inclusive. Both dates are `YYYY-MM-DD`. */
export function ageInRange(birthDate: string, today: string): boolean {
	const age = ageOn(birthDate, today);
	return age >= MIN_AGE_YEARS && age <= MAX_AGE_YEARS;
}

/** Total daily energy expenditure from BMR and the activity level. Not rounded. */
export function formulaTdee(bmrKcal: number, level: ActivityLevel): number {
	return bmrKcal * PAL[level];
}

export type AdaptiveTdee = {
	/** Expenditure the log and the trend imply; null when the gate fails. */
	observed: number | null;
	/** Observed blended with the formula TDEE; null when the gate fails. */
	blended: number | null;
	validDays: number;
	weighIns: number;
};

/**
 * Expenditure measured from the log and the weight trend over the ADAPTIVE_WINDOW_DAYS days before `windowEnd`
 * (`windowEnd` itself is outside). A logged day is valid at or above VALID_INTAKE_FRACTION of the median logged
 * intake of the window. With at least MIN_VALID_DAYS valid days and MIN_WEIGH_INS weigh-ins in the window, observed
 * is the mean valid intake less the energy stored per day: the trend change over the window times `rho`, spread over
 * its days. The change runs from the trend on the day before the window to the trend on its last day; a series that
 * starts inside the window runs from the kg of its first weigh-in instead (not its trend, the seed mean). Blended adds
 * the formula as BLEND_PRIOR_DAYS days. `intakes` maps dates to logged kcal; `series` is sorted by date, as `trendSeries` returns it. Not rounded.
 */
export function adaptiveTdee(input: {
	intakes: Record<string, number>;
	series: TrendPoint[];
	windowEnd: string;
	formulaTdee: number;
	rho: number;
}): AdaptiveTdee {
	const { intakes, series, windowEnd, rho } = input;
	const first = addDays(windowEnd, -ADAPTIVE_WINDOW_DAYS);
	const last = addDays(windowEnd, -1);
	const inWindow = (date: string) => date >= first && date <= last;

	const logged = Object.entries(intakes)
		.filter(([date]) => inWindow(date))
		.map(([, kcal]) => kcal);
	const floor = logged.length > 0 ? VALID_INTAKE_FRACTION * median(logged) : 0;
	const valid = logged.filter((kcal) => kcal >= floor);
	const windowPoints = series.filter((point) => inWindow(point.date));
	const counts = { validDays: valid.length, weighIns: windowPoints.length };

	const end = trendOn(series, last);
	if (counts.validDays < MIN_VALID_DAYS || counts.weighIns < MIN_WEIGH_INS || end === null) {
		return { observed: null, blended: null, ...counts };
	}
	const dayBefore = addDays(first, -1);
	const before = trendOn(series, dayBefore);
	// Without a trend before the window, the first weigh-in's own kg: its trend is the seed mean, which already holds
	// later weigh-ins and would hide part of the change.
	const start =
		before === null
			? { date: windowPoints[0].date, kg: windowPoints[0].kg }
			: { date: dayBefore, kg: before };
	const meanIntake = valid.reduce((sum, kcal) => sum + kcal, 0) / valid.length;
	const observed = meanIntake - ((end - start.kg) * rho) / daysBetween(start.date, last);
	const blended =
		(counts.validDays * observed + BLEND_PRIOR_DAYS * input.formulaTdee) /
		(counts.validDays + BLEND_PRIOR_DAYS);
	return { observed, blended, ...counts };
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The TDEE to use this week: TDEE_SMOOTHING of the previous week's plus the rest of `next`, moved at most
 * MAX_WEEKLY_TDEE_CHANGE from the previous one. Without a previous week, `next` as is. Not rounded.
 */
export function smoothTdee(next: number, previousUsed: number | null): number {
	if (previousUsed === null) return next;
	const mixed = TDEE_SMOOTHING * previousUsed + (1 - TDEE_SMOOTHING) * next;
	const change = Math.min(
		MAX_WEEKLY_TDEE_CHANGE,
		Math.max(-MAX_WEEKLY_TDEE_CHANGE, mixed - previousUsed)
	);
	return previousUsed + change;
}
