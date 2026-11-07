import { asc, desc, eq } from 'drizzle-orm';
import * as v from 'valibot';
import type { WeighIn } from '../../domain/trend.ts';
import { WeightInput } from '../../schemas/weight.ts';
import type { Db } from '../db/index.ts';
import { weights } from '../db/schema.ts';

const weighIn = { date: weights.date, kg: weights.kg };

/** Every weigh-in, oldest first. */
export async function listWeights(db: Db): Promise<WeighIn[]> {
	return db.select(weighIn).from(weights).orderBy(asc(weights.date));
}

/** The weigh-in with the newest date, or null when there is none. */
export async function latestWeight(db: Db): Promise<WeighIn | null> {
	const [row] = await db.select(weighIn).from(weights).orderBy(desc(weights.date)).limit(1);
	return row ?? null;
}

/** Saves the weigh-in of a date; a date that has one gets the new kg and keeps its `created_at`;
 * `updated_at` is set by the column's `$onUpdate`. */
export async function saveWeight(db: Db, input: WeightInput): Promise<void> {
	const { date, kg } = v.parse(WeightInput, input);
	await db
		.insert(weights)
		.values({ date, kg })
		.onConflictDoUpdate({ target: weights.date, set: { kg } });
}

/** Deletes the weigh-in of a date. Deleting a date without one does nothing. */
export async function deleteWeight(db: Db, date: string): Promise<void> {
	await db.delete(weights).where(eq(weights.date, date));
}
