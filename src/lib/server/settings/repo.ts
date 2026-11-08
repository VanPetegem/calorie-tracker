import { and, eq, getTableColumns, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/index.ts';
import { settings } from '../db/schema.ts';

export type Settings = typeof settings.$inferSelect;

/** Settings with every profile field set, as `isProfileComplete` proves. */
export type CompleteSettings = Settings & {
	sex: NonNullable<Settings['sex']>;
	birthDate: string;
	heightCm: number;
	activityLevel: NonNullable<Settings['activityLevel']>;
};

/** The settings a target depends on: the profile, the goal rate and the rules. */
export type TargetSettingsPatch = Partial<
	Pick<
		Settings,
		| 'sex'
		| 'birthDate'
		| 'heightCm'
		| 'activityLevel'
		| 'goalRatePct'
		| 'proteinGPerKg'
		| 'fatPct'
		| 'energyDensity'
	>
>;

const ROW_ID = 1;

/** The single settings row, created with its defaults on first read. */
export async function getSettings(db: Db): Promise<Settings> {
	const read = () => db.select().from(settings).where(eq(settings.id, ROW_ID)).limit(1);
	const [row] = await read();
	if (row) return row;
	await db.insert(settings).values({ id: ROW_ID }).onConflictDoNothing();
	const [created] = await read();
	return created;
}

/** The settings a target's formula TDEE comes from: a target can be computed only when all of them are set. */
export const PROFILE_FIELDS = ['sex', 'birthDate', 'heightCm', 'activityLevel'] as const;

/** True when every profile field is set, so a target can be computed. */
export function isProfileComplete(value: Settings): value is CompleteSettings {
	return PROFILE_FIELDS.every((field) => value[field] !== null);
}

/**
 * Writes a settings patch to the single row, whatever it holds. Needs at least one field. The caller validates; the
 * table checks still apply. The target saves use `settingsSwap` and `onboardingWrite` instead, which refuse a row
 * another request changed.
 */
export function settingsWrite(db: Db, patch: TargetSettingsPatch) {
	return db
		.insert(settings)
		.values({ id: ROW_ID, ...patch })
		.onConflictDoUpdate({ target: settings.id, set: patch });
}

/** Every column but the id: what a save compares to tell whether the row changed since it was read. */
const MUTABLE_COLUMNS = Object.entries(getTableColumns(settings)).filter(([key]) => key !== 'id');

/** SQL true when the profile is incomplete: a profile field is null (`isProfileComplete`). */
export const profileIncomplete: SQL = or(
	...PROFILE_FIELDS.map((field) => sql`${settings[field]} IS NULL`)
)!;

/**
 * SQL true when every mutable column of the row holds `values`. `IS` so null equals null; reals compare exactly as
 * stored, which holds for a value read from the row and bound back.
 */
export function settingsAre(values: Settings): SQL {
	return and(
		...MUTABLE_COLUMNS.map(
			([key, column]) => sql`${column} IS ${sql.param(values[key as keyof Settings], column)}`
		)
	)!;
}

/** SQL true when the settings row exists and `where` holds for it, for a statement of another table. */
export function settingsWhere(where: SQL): SQL {
	return sql`EXISTS (SELECT 1 FROM ${settings} WHERE ${settings.id} = ${ROW_ID} AND ${where})`;
}

/**
 * The unsent compare and swap of a settings patch, for a `db.batch` with the target it changes: it writes only while
 * the row still holds `read`, so its result's `meta.changes` is 0 when another save changed the row since `read`.
 * Needs at least one field; the caller validates.
 */
export function settingsSwap(db: Db, read: Settings, patch: TargetSettingsPatch) {
	return db
		.update(settings)
		.set(patch)
		.where(and(eq(settings.id, ROW_ID), settingsAre(read)));
}

/**
 * The unsent onboarding write of the profile and goal rate, for a `db.batch`: it writes only while the profile is
 * incomplete, so its result's `meta.changes` is 0 when another onboarding finished first. The row must exist
 * (`getSettings` makes it).
 */
export function onboardingWrite(db: Db, patch: TargetSettingsPatch) {
	return db
		.update(settings)
		.set(patch)
		.where(and(eq(settings.id, ROW_ID), profileIncomplete));
}
