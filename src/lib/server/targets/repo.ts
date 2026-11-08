import { asc, desc, eq, lt, lte } from 'drizzle-orm';
import * as v from 'valibot';
import { ADAPTIVE_WINDOW_DAYS } from '../../domain/constants.ts';
import { addDays, weekStart } from '../../domain/dates.ts';
import { weekTarget, type WeekTargetRow } from '../../domain/targets.ts';
import { trendSeries, type WeighIn } from '../../domain/trend.ts';
import { OnboardingInput } from '../../schemas/settings.ts';
import type { AppContext } from '../context.ts';
import type { Db } from '../db/index.ts';
import { weeklyTargets, type WeeklyTarget } from '../db/schema.ts';
import { dailyIntakes } from '../log/repo.ts';
import {
	isProfileComplete,
	settingsWrite,
	type Settings,
	type TargetSettingsPatch
} from '../settings/repo.ts';
import { listWeights, weightUpsert } from '../weights/repo.ts';

/** What the target functions read from the request: the database, the settings row and today. */
export type TargetContext = Pick<AppContext, 'db' | 'settings' | 'today'>;

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

/**
 * The weigh-ins the row of the week starting `monday` is built from: those dated before it. When there are none (the
 * first week, where the onboarding weigh-in is today), the single earliest weigh-in ever, so the row does not depend
 * on later weigh-ins of the week. Empty only without any weigh-in.
 */
export function rowWeighIns(weighIns: WeighIn[], monday: string): WeighIn[] {
	const before = weighIns.filter((weighIn) => weighIn.date < monday);
	if (before.length > 0) return before;
	const earliest = weighIns.reduce<WeighIn | null>(
		(first, weighIn) => (first === null || weighIn.date < first.date ? weighIn : first),
		null
	);
	return earliest === null ? [] : [earliest];
}

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
 * The row of the week starting `monday` for `settings`, from `weighIns` (see `rowWeighIns`), the intake of the
 * adaptive window before the week and the previous row. Writes nothing.
 */
async function computeRow(
	db: Db,
	settings: Settings,
	monday: string,
	weighIns: WeighIn[]
): Promise<WeekTargetRow> {
	if (!isProfileComplete(settings)) throw new ProfileIncompleteError();
	const used = rowWeighIns(weighIns, monday);
	if (used.length === 0) throw new NoWeighInError(monday);
	const sunday = addDays(monday, -1);
	const [intakes, previous] = await Promise.all([
		dailyIntakes(db, addDays(monday, -ADAPTIVE_WINDOW_DAYS), sunday),
		previousUsed(db, monday)
	]);
	return weekTarget({
		weekStart: monday,
		profile: settings,
		rules: settings,
		series: trendSeries(used, sunday),
		intakes,
		previousUsed: previous
	});
}

/** The unsent insert or replace of a week's row, returning it, for a `db.batch`. A replace stamps a new `computed_at`. */
function rowUpsert(db: Db, row: WeekTargetRow) {
	return db
		.insert(weeklyTargets)
		.values(row)
		.onConflictDoUpdate({
			target: weeklyTargets.weekStart,
			set: { ...row, computedAt: new Date().toISOString() }
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
 * This week's row, computed and inserted first when missing. Two loads at once both insert; the conflict is ignored
 * and both read the one row. Throws `ProfileIncompleteError` without a profile and `NoWeighInError` when the row is
 * missing and there is no weigh-in.
 */
export async function currentTarget(ctx: TargetContext): Promise<WeeklyTarget> {
	const monday = weekStart(ctx.today);
	const existing = await rowOf(ctx.db, monday);
	if (existing) return existing;
	const row = await computeRow(ctx.db, ctx.settings, monday, await listWeights(ctx.db));
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
 * weigh-ins, window and previous row as `currentTarget`; earlier rows are not touched. `patch` needs at least one
 * field and is validated by the caller.
 */
export async function recomputeCurrentWeek(
	ctx: TargetContext,
	patch: TargetSettingsPatch
): Promise<WeeklyTarget> {
	const monday = weekStart(ctx.today);
	const row = await computeRow(
		ctx.db,
		{ ...ctx.settings, ...patch },
		monday,
		await listWeights(ctx.db)
	);
	const [, [saved]] = await ctx.db.batch([settingsWrite(ctx.db, patch), rowUpsert(ctx.db, row)]);
	return saved;
}

/**
 * Saves the profile and goal rate, today's weigh-in (replacing one of today) and this week's row in one batch, and
 * returns the row.
 */
export async function saveOnboarding(
	ctx: TargetContext,
	input: OnboardingInput
): Promise<WeeklyTarget> {
	const { kg, ...profile } = v.parse(OnboardingInput, input);
	const today: WeighIn = { date: ctx.today, kg };
	const monday = weekStart(ctx.today);
	const weighIns = (await listWeights(ctx.db)).filter((weighIn) => weighIn.date !== ctx.today);
	const row = await computeRow(ctx.db, { ...ctx.settings, ...profile }, monday, [
		...weighIns,
		today
	]);
	const [, , [saved]] = await ctx.db.batch([
		settingsWrite(ctx.db, profile),
		weightUpsert(ctx.db, today),
		rowUpsert(ctx.db, row)
	]);
	return saved;
}

/** Stored rows, newest week first; the latest `limit` when given. */
export async function targetsHistory(db: Db, limit?: number): Promise<WeeklyTarget[]> {
	const query = db.select().from(weeklyTargets).orderBy(desc(weeklyTargets.weekStart));
	return limit === undefined ? query : query.limit(limit);
}
