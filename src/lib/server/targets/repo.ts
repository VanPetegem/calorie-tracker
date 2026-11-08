import { asc, desc, eq, lt, lte, type SQL } from 'drizzle-orm';
import { ADAPTIVE_WINDOW_DAYS, MAX_AGE_YEARS, MIN_AGE_YEARS } from '../../domain/constants.ts';
import { addDays, weekStart } from '../../domain/dates.ts';
import { wasSmoothed, weekTarget, type WeekTargetRow } from '../../domain/targets.ts';
import { ageInRange } from '../../domain/tdee.ts';
import { trendSeries, type WeighIn } from '../../domain/trend.ts';
import type { OnboardingInput } from '../../schemas/settings.ts';
import type { AppContext } from '../context.ts';
import type { Db } from '../db/index.ts';
import { rowWhere } from '../db/row-where.ts';
import { weeklyTargets, type WeeklyTarget } from '../db/schema.ts';
import { dailyIntakes } from '../log/repo.ts';
import {
	getSettings,
	isProfileComplete,
	onboardingWrite,
	PROFILE_FIELDS,
	profileIncomplete,
	settingsAre,
	settingsSwap,
	settingsWhere,
	type Settings,
	type TargetSettingsPatch
} from '../settings/repo.ts';
import { listWeights, weightUpsertWhere } from '../weights/repo.ts';

/**
 * What the target functions read from the request: the database, the settings row and today. `now` stamps
 * `computed_at` of a replaced row; it defaults to the clock.
 */
export type TargetContext = Pick<AppContext, 'db' | 'settings' | 'today'> & { now?: Date };

/** No target can be computed: sex, birth date, height or activity level is not set. Onboarding sets them. */
export class ProfileIncompleteError extends Error {
	override name = 'ProfileIncompleteError';
	constructor() {
		super('The profile is incomplete');
	}
}

/** No target can be computed for the week: there is no weigh-in at all. */
export class NoWeighInError extends Error {
	override name = 'NoWeighInError';
	constructor(readonly weekStart: string) {
		super(`No weigh-in to compute the target of the week of ${weekStart}`);
	}
}

/** The birth date gives an age outside MIN_AGE_YEARS to MAX_AGE_YEARS on `today`, the local day of the write. */
export class AgeOutOfRangeError extends Error {
	override name = 'AgeOutOfRangeError';
	constructor(
		readonly birthDate: string,
		readonly today: string
	) {
		super(
			`Age on ${today} is outside ${MIN_AGE_YEARS} to ${MAX_AGE_YEARS} (birth date ${birthDate})`
		);
	}
}

/** Onboarding found the profile complete when it wrote: another submit finished first. Nothing was written. */
export class ProfileAlreadySetUpError extends Error {
	override name = 'ProfileAlreadySetUpError';
	constructor() {
		super('The profile is already set up');
	}
}

/** Every try of a settings save found the row changed by another save between its read and its write. */
export class SettingsConflictError extends Error {
	override name = 'SettingsConflictError';
	constructor(readonly attempts: number) {
		super(`The settings changed during each of ${attempts} tries to save them`);
	}
}

/** How often a settings save reads, computes and tries its write before giving up with `SettingsConflictError`. */
export const SETTINGS_SAVE_ATTEMPTS = 3;

/** The TDEE used of the latest row before `monday`, null without one. */
async function previousUsed(db: Db, monday: string): Promise<number | null> {
	const [row] = await db
		.select({ tdeeUsed: weeklyTargets.tdeeUsed })
		.from(weeklyTargets)
		.where(lt(weeklyTargets.weekStart, monday))
		.orderBy(desc(weeklyTargets.weekStart))
		.limit(1);
	return row?.tdeeUsed ?? null;
}

/**
 * The row of the week starting `monday` for `settings`, from `weighIns` (all of them: `trendSeries` and `weekTarget`
 * read only what is dated before the week, see `weekTarget`), the intake of the adaptive window before the week and
 * `previous`, the TDEE used to smooth against (`previousUsed`, or null for no smoothing). Writes nothing.
 */
async function computeRow(
	db: Db,
	settings: Settings,
	monday: string,
	weighIns: WeighIn[],
	previous: number | null
): Promise<WeekTargetRow> {
	if (!isProfileComplete(settings)) throw new ProfileIncompleteError();
	if (weighIns.length === 0) throw new NoWeighInError(monday);
	const sunday = addDays(monday, -1);
	return weekTarget({
		weekStart: monday,
		profile: settings,
		rules: settings,
		series: trendSeries(weighIns, sunday),
		intakes: await dailyIntakes(db, addDays(monday, -ADAPTIVE_WINDOW_DAYS), sunday),
		previousUsed: previous
	});
}

/**
 * The unsent insert or replace of a week's row, returning it, for a `db.batch`; it writes only when `where` holds, and
 * returns no row otherwise. A replace stamps `now` as `computed_at`.
 */
function rowUpsert(db: Db, row: WeekTargetRow, now: Date, where: SQL) {
	return db
		.insert(weeklyTargets)
		.select(rowWhere(weeklyTargets, row, where))
		.onConflictDoUpdate({
			target: weeklyTargets.weekStart,
			set: { ...row, computedAt: now.toISOString() }
		})
		.returning();
}

async function rowOf(db: Db, monday: string): Promise<WeeklyTarget | undefined> {
	const [row] = await db
		.select()
		.from(weeklyTargets)
		.where(eq(weeklyTargets.weekStart, monday))
		.limit(1);
	return row;
}

/**
 * This week's row, computed and inserted first when missing. An existing row is returned as it is, without looking at
 * the profile. Two loads at once both insert; the conflict is ignored and both read the one row. Only when a row must
 * be computed does it throw `ProfileIncompleteError` without a profile, and `NoWeighInError` without a weigh-in.
 */
export async function currentTarget(ctx: TargetContext): Promise<WeeklyTarget> {
	const monday = weekStart(ctx.today);
	const existing = await rowOf(ctx.db, monday);
	if (existing) return existing;
	const [weighIns, previous] = await Promise.all([
		listWeights(ctx.db),
		previousUsed(ctx.db, monday)
	]);
	const row = await computeRow(ctx.db, ctx.settings, monday, weighIns, previous);
	await ctx.db.insert(weeklyTargets).values(row).onConflictDoNothing();
	const created = await rowOf(ctx.db, monday);
	if (!created) throw new Error(`The row of the week of ${monday} was not written`);
	return created;
}

/**
 * The target a date shows: the row of its week, else the latest earlier row, else the earliest row (days before the
 * first row). Makes this week's row first; without any weigh-in it falls back to the stored rows and throws
 * `NoWeighInError` only when there are none.
 */
export async function targetFor(ctx: TargetContext, date: string): Promise<WeeklyTarget> {
	const monday = weekStart(date);
	try {
		const current = await currentTarget(ctx);
		if (current.weekStart === monday) return current;
	} catch (error) {
		if (!(error instanceof NoWeighInError)) throw error;
	}
	const [onOrBefore] = await ctx.db
		.select()
		.from(weeklyTargets)
		.where(lte(weeklyTargets.weekStart, monday))
		.orderBy(desc(weeklyTargets.weekStart))
		.limit(1);
	if (onOrBefore) return onOrBefore;
	const [earliest] = await ctx.db
		.select()
		.from(weeklyTargets)
		.orderBy(asc(weeklyTargets.weekStart))
		.limit(1);
	if (earliest) return earliest;
	throw new NoWeighInError(weekStart(ctx.today));
}

/**
 * Writes a settings change and replaces this week's row computed with it, in one batch. The row uses the same
 * weigh-ins, window and previous row as `currentTarget`; earlier rows are not touched. The settings it merges
 * `patch` into are read from the database, not taken from `ctx`. A patch that changes the profile (sex, birth date,
 * height or activity level) is not smoothed against the previous row, so a corrected profile shows in this week's
 * target in full; nor is any later change this week once the row was made that way (`wasSmoothed`), so a goal save
 * cannot pull it back. Any other change is smoothed. `patch` needs at least one field and is validated by the caller.
 * Throws `AgeOutOfRangeError` for a birth date out of range on `ctx.today`.
 *
 * Another save landing between the read and the batch cannot mix settings into the row: the settings write is a
 * compare and swap against the row as read (`settingsSwap`), and the row is written under the same condition, first in
 * the batch, so both are written or neither. On a conflict nothing is written and the save reads, computes and tries again,
 * `SETTINGS_SAVE_ATTEMPTS` times in all, then throws `SettingsConflictError`.
 */
export async function recomputeCurrentWeek(
	ctx: TargetContext,
	patch: TargetSettingsPatch
): Promise<WeeklyTarget> {
	if (typeof patch.birthDate === 'string' && !ageInRange(patch.birthDate, ctx.today)) {
		throw new AgeOutOfRangeError(patch.birthDate, ctx.today);
	}
	for (let attempt = 1; attempt <= SETTINGS_SAVE_ATTEMPTS; attempt++) {
		const saved = await trySettingsSave(ctx, patch);
		if (saved) return saved;
	}
	throw new SettingsConflictError(SETTINGS_SAVE_ATTEMPTS);
}

/** One try of `recomputeCurrentWeek`, from a fresh read: the saved row, or undefined when the settings changed. */
async function trySettingsSave(
	ctx: TargetContext,
	patch: TargetSettingsPatch
): Promise<WeeklyTarget | undefined> {
	const monday = weekStart(ctx.today);
	const [current, existing, previous, weighIns] = await Promise.all([
		getSettings(ctx.db),
		rowOf(ctx.db, monday),
		previousUsed(ctx.db, monday),
		listWeights(ctx.db)
	]);
	const profileChanged = PROFILE_FIELDS.some(
		(field) => patch[field] !== undefined && patch[field] !== current[field]
	);
	const smooth = !profileChanged && (existing === undefined || wasSmoothed(existing, previous));
	const next: Settings = { ...current, ...patch };
	const row = await computeRow(ctx.db, next, monday, weighIns, smooth ? previous : null);
	// The row goes first and under the same condition as the swap (the settings still hold `current`), so both write
	// or neither does, and the swap sees the settings as the row's statement did.
	const [[saved], swap] = await ctx.db.batch([
		rowUpsert(ctx.db, row, ctx.now ?? new Date(), settingsWhere(settingsAre(current))),
		settingsSwap(ctx.db, current, patch)
	]);
	if (swap.meta.changes === 0) return undefined;
	if (!saved) throw new Error(`The row of the week of ${monday} was not written`); // invariant: same condition as the swap
	return saved;
}

/**
 * Saves the profile and goal rate, today's weigh-in (replacing one of today) and this week's row in one batch, and
 * returns the row. The other settings the row uses are read from the database, not `ctx`. `input` is validated by the
 * caller. Throws `AgeOutOfRangeError` when the birth date is out of range on `ctx.today`, before any write.
 *
 * Every statement of the batch runs only while the profile is still incomplete, and the settings write comes last, so
 * a second onboarding whose read came before the first one's write finds the profile complete in the batch, writes
 * nothing and throws `ProfileAlreadySetUpError`.
 */
export async function saveOnboarding(
	ctx: TargetContext,
	input: OnboardingInput
): Promise<WeeklyTarget> {
	const { kg, ...profile } = input;
	if (!ageInRange(profile.birthDate, ctx.today)) {
		throw new AgeOutOfRangeError(profile.birthDate, ctx.today);
	}
	const today: WeighIn = { date: ctx.today, kg };
	const monday = weekStart(ctx.today);
	const weighIns = (await listWeights(ctx.db)).filter((weighIn) => weighIn.date !== ctx.today);
	const [current, previous] = await Promise.all([
		getSettings(ctx.db),
		previousUsed(ctx.db, monday)
	]);
	const row = await computeRow(
		ctx.db,
		{ ...current, ...profile },
		monday,
		[...weighIns, today],
		previous
	);
	const incomplete = settingsWhere(profileIncomplete);
	const [, [saved], written] = await ctx.db.batch([
		weightUpsertWhere(ctx.db, today, incomplete),
		rowUpsert(ctx.db, row, ctx.now ?? new Date(), incomplete),
		onboardingWrite(ctx.db, profile)
	]);
	if (written.meta.changes === 0) throw new ProfileAlreadySetUpError();
	if (!saved) throw new Error(`The row of the week of ${monday} was not written`);
	return saved;
}

/** Stored rows, newest week first; the latest `limit` when given. */
export async function targetsHistory(db: Db, limit?: number): Promise<WeeklyTarget[]> {
	const query = db.select().from(weeklyTargets).orderBy(desc(weeklyTargets.weekStart));
	return limit === undefined ? query : query.limit(limit);
}
