import { asc, eq, type SQL } from 'drizzle-orm';
import * as v from 'valibot';
import type { WeighIn } from '../../domain/trend.ts';
import { WeightInput } from '../../schemas/weight.ts';
import type { Db } from '../db/index.ts';
import { rowWhere } from '../db/row-where.ts';
import { weights } from '../db/schema.ts';

const weighIn = { date: weights.date, kg: weights.kg };

/** Every weigh-in, oldest first. */
export async function listWeights(db: Db): Promise<WeighIn[]> {
	return db.select(weighIn).from(weights).orderBy(asc(weights.date));
}

/** The weigh-in of a date, or null when it has none. */
export async function weightOn(db: Db, date: string): Promise<WeighIn | null> {
	const [row] = await db.select(weighIn).from(weights).where(eq(weights.date, date)).limit(1);
	return row ?? null;
}

/** Saves the weigh-in of a date; a date that has one gets the new kg and keeps its `created_at`;
 * `updated_at` is set by the column's `$onUpdate`. */
export async function saveWeight(db: Db, input: WeightInput): Promise<void> {
	await weightUpsert(db, v.parse(WeightInput, input));
}

/** What a weigh-in does when its date has one: the new kg replaces the old, `created_at` stays. */
function replaceKg({ kg }: WeighIn) {
	return { target: weights.date, set: { kg } };
}

/** The unsent write behind `saveWeight`, for a `db.batch`. The caller validates. */
export function weightUpsert(db: Db, weighIn: WeighIn) {
	return db.insert(weights).values(weighIn).onConflictDoUpdate(replaceKg(weighIn));
}

/** `weightUpsert` that writes only when `where` holds, and nothing otherwise, for a `db.batch` that stands or falls together. */
export function weightUpsertWhere(db: Db, weighIn: WeighIn, where: SQL) {
	return db
		.insert(weights)
		.select(rowWhere(weights, weighIn, where))
		.onConflictDoUpdate(replaceKg(weighIn));
}

/** Saves a weigh-in only when its date has none, and says whether it did: an Undo must not overwrite a newer one. */
export async function restoreWeight(db: Db, input: WeightInput): Promise<boolean> {
	const { date, kg } = v.parse(WeightInput, input);
	const rows = await db
		.insert(weights)
		.values({ date, kg })
		.onConflictDoNothing({ target: weights.date })
		.returning({ date: weights.date });
	return rows.length > 0;
}

/** Deletes the weigh-in of a date and says whether there was one. Deleting a date without one does nothing. */
export async function deleteWeight(db: Db, date: string): Promise<boolean> {
	const rows = await db
		.delete(weights)
		.where(eq(weights.date, date))
		.returning({ date: weights.date });
	return rows.length > 0;
}
