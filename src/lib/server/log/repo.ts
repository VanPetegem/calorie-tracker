import { error } from '@sveltejs/kit';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { isAllowedLogDate, loggedAtFor } from '../../domain/dates.ts';
import {
	scaleSnapshot,
	snapshotFor,
	sumNutrients,
	toGrams,
	type Nutrients
} from '../../domain/nutrition.ts';
import type {
	EditAmountInput,
	EditQuickInput,
	LogFoodInput,
	QuickInput
} from '../../schemas/log.ts';
import type { LogUnit } from '../../schemas/fields.ts';
import type { Db } from '../db/index.ts';
import { logEntries, type LogEntry } from '../db/schema.ts';
import { getFood, unarchiveFood } from '../foods/repo.ts';
import { newId } from '../id.ts';

/** Today in the settings timezone and the current moment, for checking dates and setting `logged_at`. */
export type LogContext = { today: string; now: Date; timeZone: string };

/** Throws 400 unless `date` is a calendar date no later than tomorrow. Every write with a date calls it. */
export function assertLogDate(date: string, today: string): void {
	if (!isAllowedLogDate(date, today)) error(400, 'You can log up to tomorrow');
}

/** Converts an amount to grams, as a 400 when the food has no serving weight for a serving amount. */
function gramsFor(amount: number, unit: LogUnit, servingG: number | null): number {
	if (unit === 'serving' && servingG === null) error(400, 'This food has no serving size');
	return toGrams(amount, unit, servingG);
}

/** Quick entries leave blank macros empty in the form, but the columns are NOT NULL. */
function quickNutrients(input: Pick<QuickInput, 'kcal' | 'protein' | 'carbs' | 'fat'>) {
	return {
		kcal: input.kcal,
		protein: input.protein ?? 0,
		carbs: input.carbs ?? 0,
		fat: input.fat ?? 0
	};
}

/** A live (not deleted) entry of the kind, or 404. */
async function getEntry(db: Db, id: string, kind: LogEntry['kind']): Promise<LogEntry> {
	const [row] = await db
		.select()
		.from(logEntries)
		.where(and(eq(logEntries.id, id), eq(logEntries.kind, kind), isNull(logEntries.deletedAt)))
		.limit(1);
	if (!row) error(404, 'Entry not found');
	return row;
}

/** One day's entries in the order they were logged. */
export async function dayEntries(db: Db, date: string): Promise<LogEntry[]> {
	return db
		.select()
		.from(logEntries)
		.where(and(eq(logEntries.date, date), isNull(logEntries.deletedAt)))
		.orderBy(asc(logEntries.loggedAt), asc(logEntries.id));
}

export function dayTotals(entries: LogEntry[]): Nutrients {
	return sumNutrients(entries);
}

/** A g or ml amount must match the food's basis. Servings fit any food. */
function assertUnitFits(unit: LogUnit, basis: 'g' | 'ml'): void {
	if (unit !== 'serving' && unit !== basis) error(400, `This food is measured in ${basis}`);
}

/** Logs an amount of a food with a nutrition snapshot taken from the food row. Logging unarchives the food. */
export async function addFoodEntry(
	db: Db,
	input: LogFoodInput,
	ctx: LogContext
): Promise<LogEntry> {
	assertLogDate(input.date, ctx.today);
	const food = await getFood(db, input.foodId);
	if (!food) error(404, 'Food not found');
	assertUnitFits(input.unit, food.nutritionBasis);
	const grams = gramsFor(input.amount, input.unit, food.servingG);
	const [entry] = await db
		.insert(logEntries)
		.values({
			id: newId(),
			date: input.date,
			loggedAt: loggedAtFor(input.date, ctx.today, ctx.now, ctx.timeZone),
			kind: 'food',
			foodId: food.id,
			amount: input.amount,
			unit: input.unit,
			grams,
			label: food.name,
			...snapshotFor(food, grams)
		})
		.returning();
	if (food.archivedAt !== null) await unarchiveFood(db, food.id);
	return entry;
}

export async function addQuickEntry(db: Db, input: QuickInput, ctx: LogContext): Promise<LogEntry> {
	assertLogDate(input.date, ctx.today);
	const [entry] = await db
		.insert(logEntries)
		.values({
			id: newId(),
			date: input.date,
			loggedAt: loggedAtFor(input.date, ctx.today, ctx.now, ctx.timeZone),
			kind: 'quick',
			label: input.label,
			...quickNutrients(input)
		})
		.returning();
	return entry;
}

/** Changes a quick entry's label and nutrition. Its day and time stay. */
export async function updateQuickEntry(
	db: Db,
	id: string,
	input: Omit<EditQuickInput, 'id'>
): Promise<LogEntry> {
	await getEntry(db, id, 'quick');
	const [entry] = await db
		.update(logEntries)
		.set({ label: input.label, ...quickNutrients(input) })
		.where(and(eq(logEntries.id, id), isNull(logEntries.deletedAt)))
		.returning();
	if (!entry) error(404, 'Entry not found');
	return entry;
}

/**
 * Changes the amount of a food entry. The stored snapshot scales by new grams / stored grams, so later edits to
 * the food never reach the entry. The food is read only for its basis and serving weight.
 */
export async function updateEntryAmount(db: Db, input: EditAmountInput): Promise<LogEntry> {
	const entry = await getEntry(db, input.id, 'food');
	if (entry.grams === null || entry.foodId === null) error(400, 'This entry has no amount');
	const food = await getFood(db, entry.foodId);
	if (food) assertUnitFits(input.unit, food.nutritionBasis);
	const grams = gramsFor(input.amount, input.unit, food?.servingG ?? null);
	const [updated] = await db
		.update(logEntries)
		.set({
			amount: input.amount,
			unit: input.unit,
			grams,
			...scaleSnapshot(entry, entry.grams, grams)
		})
		.where(and(eq(logEntries.id, entry.id), isNull(logEntries.deletedAt)))
		.returning();
	if (!updated) error(404, 'Entry not found');
	return updated;
}

/**
 * Deletes an entry softly (sets `deleted_at`) and returns it, so Undo can bring back the same row by id without
 * the client sending any values. Null when the entry is missing or already deleted.
 */
export async function deleteEntry(db: Db, id: string): Promise<LogEntry | null> {
	const [row] = await db
		.update(logEntries)
		.set({ deletedAt: new Date().toISOString() })
		.where(and(eq(logEntries.id, id), isNull(logEntries.deletedAt)))
		.returning();
	return row ?? null;
}

/** Undo: brings a deleted entry back. Restoring a live or unknown entry does nothing. */
export async function restoreEntry(db: Db, id: string): Promise<void> {
	await db
		.update(logEntries)
		.set({ deletedAt: null })
		.where(and(eq(logEntries.id, id), isNotNull(logEntries.deletedAt)));
}
