import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { batchEntrySnapshot } from '../../domain/batch.ts';
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
	LogBatchInput,
	LogFoodInput,
	QuickInput
} from '../../schemas/log.ts';
import {
	BATCH_LOG_UNITS,
	FOOD_LOG_UNITS,
	type BatchLogUnit,
	type FoodLogUnit,
	type LogUnit
} from '../../schemas/fields.ts';
import type { Db } from '../db/index.ts';
import { batches, logEntries, type Batch, type Food, type LogEntry } from '../db/schema.ts';
import { getFood, unarchiveFood } from '../foods/repo.ts';
import { newId } from '../id.ts';

/** Today in the settings timezone and the current moment, for checking dates and setting `logged_at`. */
export type LogContext = { today: string; now: Date; timeZone: string };

/** Throws 400 unless `date` is a calendar date no later than tomorrow. Every write with a date calls it. */
export function assertLogDate(date: string, today: string): void {
	if (!isAllowedLogDate(date, today)) error(400, 'You can log up to tomorrow');
}

function isFoodLogUnit(unit: LogUnit): unit is FoodLogUnit {
	return (FOOD_LOG_UNITS as readonly LogUnit[]).includes(unit);
}

/** Throws 400 unless the unit is one a batch entry can be in. Holds even when a caller skipped the schema. */
function assertBatchUnit(unit: string | null): asserts unit is BatchLogUnit {
	if (!(BATCH_LOG_UNITS as readonly (string | null)[]).includes(unit)) {
		error(400, 'A batch is logged in portions or grams');
	}
}

const NO_COOKED_WEIGHT = 'Add the cooked weight to log grams';

/**
 * Converts an amount of a food to grams, as a 400 when the unit does not fit: portions (only batches have them), g or
 * ml against the food's basis, or a serving of a food without a serving weight. Takes any log unit, so it holds even
 * when a caller skipped the schema. Without the food row only the portion check applies.
 */
function gramsFor(
	amount: number,
	unit: LogUnit,
	food: Pick<Food, 'nutritionBasis' | 'servingG'> | null
): number {
	if (!isFoodLogUnit(unit)) error(400, 'A food is not logged in portions');
	if (food) assertUnitFits(unit, food.nutritionBasis);
	const servingG = food?.servingG ?? null;
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

/** A live (not deleted) entry of one of the kinds, or 404. */
async function getEntry(
	db: Db,
	id: string,
	...kinds: [LogEntry['kind'], ...LogEntry['kind'][]]
): Promise<LogEntry> {
	const [row] = await db
		.select()
		.from(logEntries)
		.where(
			and(eq(logEntries.id, id), inArray(logEntries.kind, kinds), isNull(logEntries.deletedAt))
		)
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
function assertUnitFits(unit: FoodLogUnit, basis: 'g' | 'ml'): void {
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
	const grams = gramsFor(input.amount, input.unit, food);
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

/** A batch row, or 404. */
async function getBatchRow(db: Db, id: string): Promise<Batch> {
	const [row] = await db.select().from(batches).where(eq(batches.id, id)).limit(1);
	if (!row) error(404, 'Batch not found');
	return row;
}

/**
 * Logs portions or grams of a batch with a nutrition snapshot taken from the batch's totals (`batchEntrySnapshot`).
 * Grams need a cooked weight. A finished batch can be logged too; logging reopens nothing.
 */
export async function addBatchEntry(
	db: Db,
	input: LogBatchInput,
	ctx: LogContext
): Promise<LogEntry> {
	assertLogDate(input.date, ctx.today);
	assertBatchUnit(input.unit);
	const batch = await getBatchRow(db, input.batchId);
	if (input.unit === 'g' && batch.cookedWeightG === null) error(400, NO_COOKED_WEIGHT);
	const { nutrients, grams } = batchEntrySnapshot(
		{
			totals: batch,
			portions: batch.portions,
			cookedWeightG: batch.cookedWeightG
		},
		input.amount,
		input.unit
	);
	const [entry] = await db
		.insert(logEntries)
		.values({
			id: newId(),
			date: input.date,
			loggedAt: loggedAtFor(input.date, ctx.today, ctx.now, ctx.timeZone),
			kind: 'batch',
			batchId: batch.id,
			amount: input.amount,
			unit: input.unit,
			grams,
			label: batch.name,
			...nutrients
		})
		.returning();
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
 * Changes the amount of a food or batch entry. The stored snapshot is rescaled, never re-read from the food or the
 * batch, so later edits to them never reach the entry.
 *
 * A food entry scales by new grams / stored grams; the food is read only for its basis and serving weight. A batch
 * entry takes only portions and grams: in the same unit it scales by new amount / stored amount; a unit switch needs
 * the stored grams and scales by grams. Grams to portions reads the batch only for its current portion weight.
 */
export async function updateEntryAmount(db: Db, input: EditAmountInput): Promise<LogEntry> {
	const entry = await getEntry(db, input.id, 'food', 'batch');
	const changes =
		entry.kind === 'batch'
			? await batchAmount(db, entry, input)
			: await foodAmount(db, entry, input);
	const [updated] = await db
		.update(logEntries)
		.set({ amount: input.amount, unit: input.unit, ...changes })
		.where(and(eq(logEntries.id, entry.id), isNull(logEntries.deletedAt)))
		.returning();
	if (!updated) error(404, 'Entry not found');
	return updated;
}

type AmountChanges = Nutrients & { grams: number | null };

async function foodAmount(db: Db, entry: LogEntry, input: EditAmountInput): Promise<AmountChanges> {
	if (entry.grams === null || entry.foodId === null) error(400, 'This entry has no amount');
	const food = await getFood(db, entry.foodId);
	const grams = gramsFor(input.amount, input.unit, food);
	return { grams, ...scaleSnapshot(entry, entry.grams, grams) };
}

async function batchAmount(
	db: Db,
	entry: LogEntry,
	input: EditAmountInput
): Promise<AmountChanges> {
	assertBatchUnit(input.unit);
	if (entry.amount === null || entry.batchId === null) error(400, 'This entry has no amount');
	if (entry.unit === input.unit) {
		return {
			grams: entry.grams === null ? null : (entry.grams / entry.amount) * input.amount,
			...scaleSnapshot(entry, entry.amount, input.amount)
		};
	}
	if (entry.grams === null)
		error(400, 'This entry has no weight, so it can only change in portions');
	let grams = input.amount;
	if (input.unit === 'portion') {
		const batch = await getBatchRow(db, entry.batchId);
		if (batch.cookedWeightG === null) error(400, NO_COOKED_WEIGHT);
		grams = toGrams(input.amount, 'portion', batch.cookedWeightG / batch.portions);
	}
	return { grams, ...scaleSnapshot(entry, entry.grams, grams) };
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
