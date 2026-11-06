import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.ts';
import { settings } from '../db/schema.ts';

export type Settings = typeof settings.$inferSelect;

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

/** Saves the temporary daily target; null clears kcal and weight together. */
export async function saveManualTarget(
	db: Db,
	value: { kcal: number; weightKg: number } | null
): Promise<void> {
	const target = { manualTargetKcal: value?.kcal ?? null, manualWeightKg: value?.weightKg ?? null };
	await db
		.insert(settings)
		.values({ id: ROW_ID, ...target })
		.onConflictDoUpdate({ target: settings.id, set: target });
}
