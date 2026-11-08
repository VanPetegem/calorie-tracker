import { eq } from 'drizzle-orm';
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

/** True when sex, birth date, height and activity level are all set, so a target can be computed. */
export function isProfileComplete(value: Settings): value is CompleteSettings {
	return (
		value.sex !== null &&
		value.birthDate !== null &&
		value.heightCm !== null &&
		value.activityLevel !== null
	);
}

/**
 * The unsent write of a settings patch to the single row, for a `db.batch` with the target it changes. Needs at least
 * one field. The caller validates; the table checks still apply.
 */
export function settingsWrite(db: Db, patch: TargetSettingsPatch) {
	return db
		.insert(settings)
		.values({ id: ROW_ID, ...patch })
		.onConflictDoUpdate({ target: settings.id, set: patch });
}
