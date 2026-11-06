import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import * as v from 'valibot';
import {
	isStale,
	per100g,
	perPortion,
	portionsLeft,
	totals,
	type BatchShape
} from '../../domain/batch.ts';
import { toGrams, type Nutrients } from '../../domain/nutrition.ts';
import { BatchInput, ContainerInput, type BatchIngredientInput } from '../../schemas/batch.ts';
import type { Db } from '../db/index.ts';
import {
	batchIngredients,
	batches,
	containers,
	foods,
	logEntries,
	recipes,
	type Batch,
	type BatchIngredient,
	type Container,
	type Food
} from '../db/schema.ts';
import { newId } from '../id.ts';
import {
	getRecipe,
	RecipeNotFoundError,
	UnitNotAvailableError,
	UnknownFoodError
} from '../recipes/repo.ts';

export type BatchSummary = Batch & {
	/** Raw, may be negative; the UI clamps it at 0. */
	portionsLeft: number;
	perPortion: Nutrients;
	/** Null until the batch has a cooked weight. */
	per100g: Nutrients | null;
	/** Latest of created, updated and the latest live entry's `logged_at`. */
	lastActivity: string;
};

export type BatchDetailIngredient = BatchIngredient & {
	/** The food the line was snapshotted from, as it is now; null when there is none. */
	food: Food | null;
	/**
	 * The serving weight a save prices a serving of this line with: the one saved with a serving line
	 * (`grams / amount`), else the food's current one. The editor prices servings with it so it agrees with the server.
	 */
	servingG: number | null;
};

export type BatchDetail = BatchSummary & {
	ingredients: BatchDetailIngredient[];
	liveEntryCount: number;
};

/** A batch line id that is not a line of the batch being saved (another batch's, unknown, or sent twice). */
export class UnknownIngredientError extends Error {
	override readonly name = 'UnknownIngredientError';
	constructor(
		readonly ingredientId: string,
		readonly index: number
	) {
		super('This ingredient is no longer in the batch');
	}
}

/** A save names a batch id that does not exist. Nothing was written. */
export class BatchNotFoundError extends Error {
	override readonly name = 'BatchNotFoundError';
	constructor(readonly batchId: string) {
		super('This batch no longer exists');
	}
}

/** A batch with live log entries is finished, never deleted. Nothing was written. */
export class BatchLoggedError extends Error {
	override readonly name = 'BatchLoggedError';
	constructor(readonly batchId: string) {
		super('Logged batches can be finished, not deleted');
	}
}

/** A save names a container id that does not exist. Nothing was written. */
export class ContainerNotFoundError extends Error {
	override readonly name = 'ContainerNotFoundError';
	constructor(readonly containerId: string) {
		super('This container no longer exists');
	}
}

/**
 * D1 binds at most 100 values per statement and a batch ingredient row binds 13 (one per column), so a batch's
 * ingredients are inserted 7 rows per statement.
 */
const INGREDIENT_ROWS_PER_INSERT = Math.floor(100 / 13);

type EntryRow = {
	batchId: string;
	amount: number | null;
	unit: string | null;
	grams: number | null;
	loggedAt: string;
};

function shapeOf(batch: Batch): BatchShape {
	return {
		totals: {
			kcal: batch.kcal,
			protein: batch.protein,
			carbs: batch.carbs,
			fat: batch.fat,
			fiber: batch.fiber
		},
		portions: batch.portions,
		cookedWeightG: batch.cookedWeightG
	};
}

/** Live entries of the batches matching `where`, for portions left and last activity. */
async function liveEntries(db: Db, where: SQL | undefined): Promise<Map<string, EntryRow[]>> {
	const rows = await db
		.select({
			batchId: batches.id,
			amount: logEntries.amount,
			unit: logEntries.unit,
			grams: logEntries.grams,
			loggedAt: logEntries.loggedAt
		})
		.from(logEntries)
		.innerJoin(batches, eq(batches.id, logEntries.batchId))
		.where(and(where, isNull(logEntries.deletedAt)));
	return Map.groupBy(rows, (row) => row.batchId);
}

function summarize(batch: Batch, entries: EntryRow[]): BatchSummary {
	const shape = shapeOf(batch);
	const lastActivity = [batch.createdAt, batch.updatedAt, ...entries.map((e) => e.loggedAt)].reduce(
		(latest, iso) => (iso > latest ? iso : latest)
	);
	return {
		...batch,
		portionsLeft: portionsLeft(
			shape,
			entries.flatMap((e) =>
				e.amount === null || e.unit === null
					? []
					: [{ amount: e.amount, unit: e.unit, grams: e.grams }]
			)
		),
		perPortion: perPortion(shape.totals, batch.portions),
		per100g: batch.cookedWeightG === null ? null : per100g(shape.totals, batch.cookedWeightG),
		lastActivity
	};
}

async function summaries(db: Db, list: Batch[]): Promise<BatchSummary[]> {
	if (list.length === 0) return [];
	const byBatch = await liveEntries(
		db,
		inArray(
			batches.id,
			list.map((batch) => batch.id)
		)
	);
	return list.map((batch) => summarize(batch, byBatch.get(batch.id) ?? []));
}

/**
 * Batches that are not finished, newest cooked first. First finishes, in the same request, every active batch
 * without activity (created, updated or a live entry logged) for more than `BATCH_AUTO_FINISH_DAYS` before `now`.
 */
export async function activeBatches(db: Db, now: Date): Promise<BatchSummary[]> {
	const list = await db
		.select()
		.from(batches)
		.where(isNull(batches.finishedAt))
		.orderBy(desc(batches.cookedOn), desc(batches.createdAt), desc(batches.id));
	const all = await summaries(db, list);
	const stale = all.filter((batch) => isStale(batch.lastActivity, now));
	if (stale.length > 0) {
		await db
			.update(batches)
			.set({ finishedAt: now.toISOString() })
			.where(
				and(
					inArray(
						batches.id,
						stale.map((batch) => batch.id)
					),
					isNull(batches.finishedAt)
				)
			);
	}
	return all.filter((batch) => !stale.includes(batch));
}

/** The latest finished batches, last finished first. */
export async function finishedBatches(db: Db, limit = 20): Promise<BatchSummary[]> {
	const list = await db
		.select()
		.from(batches)
		.where(isNotNull(batches.finishedAt))
		.orderBy(desc(batches.finishedAt), desc(batches.id))
		.limit(limit);
	return summaries(db, list);
}

/** The serving weight of a line: saved with a serving line (`grams / amount`), else the food's current one. */
function lineServingG(
	line: Pick<BatchIngredient, 'unit' | 'grams' | 'amount'>,
	food: Pick<Food, 'servingG'> | undefined | null
): number | null {
	if (line.unit === 'serving') return line.grams / line.amount;
	return food?.servingG ?? null;
}

/** A batch with its lines in order and its count of live entries, finished or not. Null when it does not exist. */
export async function getBatch(db: Db, id: string): Promise<BatchDetail | null> {
	const [batch] = await db.select().from(batches).where(eq(batches.id, id)).limit(1);
	if (!batch) return null;
	const [summary] = await summaries(db, [batch]);
	const rows = await db
		.select({ ingredient: batchIngredients, food: foods })
		.from(batchIngredients)
		.leftJoin(foods, eq(foods.id, batchIngredients.foodId))
		.where(eq(batchIngredients.batchId, id))
		.orderBy(asc(batchIngredients.position));
	const liveEntryCount = await db.$count(
		logEntries,
		and(eq(logEntries.batchId, id), isNull(logEntries.deletedAt))
	);
	return {
		...summary,
		ingredients: rows.map(({ ingredient, food }) => ({
			...ingredient,
			food,
			servingG: lineServingG(ingredient, food)
		})),
		liveEntryCount
	};
}

/**
 * A new batch prefilled from a recipe: its name, default portions and ingredients as entered, cooked today, not
 * weighed yet. Null when the recipe does not exist. Archived recipes are allowed.
 */
export async function draftFromRecipe(
	db: Db,
	recipeId: string,
	today: string
): Promise<BatchInput | null> {
	const recipe = await getRecipe(db, recipeId);
	if (!recipe) return null;
	return {
		recipeId: recipe.id,
		name: recipe.name,
		cookedOn: today,
		portions: recipe.defaultPortions,
		cookedWeightG: null,
		ingredients: recipe.ingredients.map(({ foodId, amount, unit }) => ({ foodId, amount, unit }))
	};
}

/**
 * Grams of a line in `unit`: g and ml must match the food's basis, a serving needs a serving weight. Throws
 * `UnitNotAvailableError` with the line's index.
 */
function gramsFor(
	line: BatchIngredientInput,
	food: Food,
	servingG: number | null,
	index: number
): number {
	const fits = line.unit === 'serving' ? servingG !== null : line.unit === food.nutritionBasis;
	if (!fits) throw new UnitNotAvailableError(food, line.unit, index);
	return toGrams(line.amount, line.unit, servingG);
}

/**
 * Creates (no id) or replaces a whole batch. Everything is checked before the first write: the input against
 * `BatchInput`, the batch and recipe ids, every line id, food and unit.
 *
 * A line with an id must be a line of this batch with the same food. It keeps its name and values per 100 and gets
 * the new amount, unit and grams; a serving keeps the serving weight it was saved with, so editing the food never
 * reaches it. A unit change is checked against the food. A line without an id is snapshotted from its food now.
 * Lines left out are removed. Totals are recomputed from the snapshots. The batch row and its lines are written in
 * one D1 batch, so a failure leaves the stored batch as it was. Logged entries are never touched.
 */
export async function saveBatch(db: Db, input: BatchInput): Promise<Batch> {
	const parsed = v.parse(BatchInput, input);
	let stored = new Map<string, BatchIngredient>();
	if (parsed.id !== undefined) {
		const [existing] = await db
			.select({ id: batches.id })
			.from(batches)
			.where(eq(batches.id, parsed.id))
			.limit(1);
		if (!existing) throw new BatchNotFoundError(parsed.id);
		const lines = await db
			.select()
			.from(batchIngredients)
			.where(eq(batchIngredients.batchId, parsed.id));
		stored = new Map(lines.map((line) => [line.id, line]));
	}
	if (parsed.recipeId !== null) {
		const [recipe] = await db
			.select({ id: recipes.id })
			.from(recipes)
			.where(eq(recipes.id, parsed.recipeId))
			.limit(1);
		if (!recipe) throw new RecipeNotFoundError(parsed.recipeId);
	}
	const foodIds = [...new Set(parsed.ingredients.map((line) => line.foodId))];
	const foodById = new Map(
		(await db.select().from(foods).where(inArray(foods.id, foodIds))).map((food) => [food.id, food])
	);
	const batchId = parsed.id ?? newId();
	const seen = new Set<string>();
	const lines = parsed.ingredients.map((line, position): BatchIngredient => {
		if (line.id === undefined) {
			const food = foodById.get(line.foodId);
			if (!food) throw new UnknownFoodError(line.foodId, position);
			return {
				id: newId(),
				batchId,
				foodId: food.id,
				name: food.name,
				amount: line.amount,
				unit: line.unit,
				grams: gramsFor(line, food, food.servingG, position),
				kcal: food.kcal,
				protein: food.protein,
				carbs: food.carbs,
				fat: food.fat,
				fiber: food.fiber,
				position
			};
		}
		const previous = stored.get(line.id);
		if (
			!previous ||
			seen.has(line.id) ||
			(previous.foodId !== null && previous.foodId !== line.foodId)
		) {
			throw new UnknownIngredientError(line.id, position);
		}
		seen.add(line.id);
		const food = previous.foodId === null ? undefined : foodById.get(previous.foodId);
		const servingG = lineServingG(previous, food);
		let grams: number;
		if (line.unit === previous.unit) grams = toGrams(line.amount, line.unit, servingG);
		else if (!food) throw new UnknownFoodError(line.foodId, position);
		else grams = gramsFor(line, food, servingG, position);
		return { ...previous, amount: line.amount, unit: line.unit, grams, position };
	});
	const sum = totals(lines.map((line) => ({ per100: line, grams: line.grams })));
	const fields = {
		recipeId: parsed.recipeId,
		name: parsed.name,
		cookedOn: parsed.cookedOn,
		portions: parsed.portions,
		cookedWeightG: parsed.cookedWeightG,
		...sum
	};
	const writeBatch =
		parsed.id === undefined
			? db
					.insert(batches)
					.values({ id: batchId, ...fields })
					.returning()
			: db.update(batches).set(fields).where(eq(batches.id, batchId)).returning();
	const [[batch]] = await db.batch([
		writeBatch,
		db.delete(batchIngredients).where(eq(batchIngredients.batchId, batchId)),
		...chunk(lines, INGREDIENT_ROWS_PER_INSERT).map((rows) =>
			db.insert(batchIngredients).values(rows)
		)
	]);
	// The id was checked above; a row that is gone by now must not pass as saved.
	if (!batch) throw new BatchNotFoundError(batchId);
	return batch;
}

function chunk<T>(items: T[], size: number): T[][] {
	return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
		items.slice(i * size, (i + 1) * size)
	);
}

/** Marks a batch finished. Finishing a finished or unknown batch does nothing. */
export async function finishBatch(db: Db, id: string): Promise<void> {
	await db
		.update(batches)
		.set({ finishedAt: new Date().toISOString() })
		.where(and(eq(batches.id, id), isNull(batches.finishedAt)));
}

/**
 * Makes a finished batch active again. Reopening sets `updated_at`, which counts as activity, so auto finish does
 * not finish it again at once. Reopening an active or unknown batch does nothing.
 */
export async function reopenBatch(db: Db, id: string): Promise<void> {
	await db
		.update(batches)
		.set({ finishedAt: null })
		.where(and(eq(batches.id, id), isNotNull(batches.finishedAt)));
}

/**
 * Deletes a batch nobody logged (live entries), with its lines and its deleted entries, in one D1 batch. Throws
 * `BatchLoggedError` when a live entry references it. A live entry logged in between makes the batch delete fail on
 * the reference, which rolls back the whole D1 batch. Deleting an unknown batch does nothing.
 */
export async function deleteBatch(db: Db, id: string): Promise<void> {
	const live = await db.$count(
		logEntries,
		and(eq(logEntries.batchId, id), isNull(logEntries.deletedAt))
	);
	if (live > 0) throw new BatchLoggedError(id);
	await db.batch([
		db.delete(logEntries).where(and(eq(logEntries.batchId, id), isNotNull(logEntries.deletedAt))),
		db.delete(batches).where(eq(batches.id, id))
	]);
}

/** Containers by name ignoring case. */
export async function listContainers(db: Db): Promise<Container[]> {
	return db
		.select()
		.from(containers)
		.orderBy(sql`${containers.name} collate nocase`, asc(containers.id));
}

/** Creates (no id) or renames and re-tares a container. Throws `ContainerNotFoundError` for an unknown id. */
export async function saveContainer(db: Db, input: ContainerInput): Promise<Container> {
	const parsed = v.parse(ContainerInput, input);
	const fields = { name: parsed.name, tareG: parsed.tareG };
	if (parsed.id === undefined) {
		const [created] = await db
			.insert(containers)
			.values({ id: newId(), ...fields })
			.returning();
		return created;
	}
	const [updated] = await db
		.update(containers)
		.set(fields)
		.where(eq(containers.id, parsed.id))
		.returning();
	if (!updated) throw new ContainerNotFoundError(parsed.id);
	return updated;
}

/** Hard deletes a container; batches keep their net weight. Deleting an unknown container does nothing. */
export async function deleteContainer(db: Db, id: string): Promise<void> {
	await db.delete(containers).where(eq(containers.id, id));
}
