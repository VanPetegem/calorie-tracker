import type { WeeklyTarget } from '#lib/server/db/schema.ts';

/** A stored week row built on the formula TDEE (no adaptive estimate), with `overrides` on top. */
export function weekRow(weekStart: string, overrides: Partial<WeeklyTarget> = {}): WeeklyTarget {
	return {
		weekStart,
		tdeeFormula: 2600,
		tdeeAdaptive: null,
		tdeeUsed: 2600,
		targetKcal: 2450,
		proteinG: 126,
		carbsG: 300,
		fatG: 80,
		carbsFloored: false,
		trendKg: 70.4,
		rateKgPerWeek: 0.25,
		validDays: 3,
		weighIns: 4,
		computedAt: '2026-11-02T06:00:00.000Z',
		...overrides
	};
}
