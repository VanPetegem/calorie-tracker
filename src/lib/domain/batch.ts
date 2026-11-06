import { BATCH_AUTO_FINISH_DAYS } from './constants';
import {
	round1,
	scaleSnapshot,
	snapshotFor,
	sumNutrients,
	toGrams,
	type Nutrients,
	type Per100,
	type Unit
} from './nutrition';

const DAY_MS = 24 * 60 * 60 * 1000;

/** One ingredient: its values per 100 g and the grams used. */
export type IngredientLine = { per100: Per100; grams: number };

/** What an ingredient's grams come from: the amount and unit as entered, the food's serving weight, saved grams. */
export type IngredientAmount = {
	amount: number;
	unit: Exclude<Unit, 'portion'>;
	/** The food's current serving weight. */
	servingG: number | null;
	/** Grams saved with the line. Only a serving of a food that no longer has a serving weight falls back on it. */
	storedGrams?: number;
};

/**
 * Grams of an ingredient with the food as it is now: a serving follows the food's current serving weight. When the
 * food has none (it lost it after the line was saved), the saved grams stand, or 0 g when there are none.
 */
export function ingredientGrams({ amount, unit, servingG, storedGrams }: IngredientAmount): number {
	if (unit === 'serving' && servingG === null) return storedGrams ?? 0;
	return toGrams(amount, unit, servingG);
}

/** Nutrition for one ingredient line. */
export function ingredientNutrients(line: IngredientLine): Nutrients {
	return snapshotFor(line.per100, line.grams);
}

/** Total nutrition for a list of ingredients. An empty list gives zeros with fiber 0. */
export function totals(lines: IngredientLine[]): Nutrients {
	return sumNutrients(lines.map(ingredientNutrients));
}

/** Nutrition for one portion, rounded to one decimal. Rejects zero, negative, NaN and infinite portions. */
export function perPortion(totals: Nutrients, portions: number): Nutrients {
	if (!Number.isFinite(portions) || portions <= 0)
		throw new RangeError('Portions must be greater than zero');
	const scale = (value: number) => round1(value / portions);
	return {
		kcal: scale(totals.kcal),
		protein: scale(totals.protein),
		carbs: scale(totals.carbs),
		fat: scale(totals.fat),
		fiber: totals.fiber === null ? null : scale(totals.fiber)
	};
}

/** A batch as the portion and gram math reads it: its totals, its portion count and its cooked weight when weighed. */
export type BatchShape = { totals: Nutrients; portions: number; cookedWeightG: number | null };

/** A logged entry of a batch. `grams` is the stored grams, null when there are none. */
export type BatchEntry = { amount: number; unit: string; grams: number | null };

function assertPositive(value: number, message: string): void {
	if (!Number.isFinite(value) || value <= 0) throw new RangeError(message);
}

/** Nutrition per 100 g of a weighed batch, rounded to one decimal. */
export function per100g(totals: Nutrients, cookedWeightG: number): Nutrients {
	assertPositive(cookedWeightG, 'The cooked weight must be greater than zero');
	return scaleSnapshot(totals, cookedWeightG, 100);
}

/**
 * Nutrition and grams for a log entry of a batch. A portion takes amount / portions of the totals, and its grams are
 * amount times the portion weight (cooked weight / portions) when the batch has a cooked weight. Grams take
 * amount / cooked weight of the totals and need a cooked weight.
 */
export function batchEntrySnapshot(
	batch: BatchShape,
	amount: number,
	unit: 'portion' | 'g'
): { nutrients: Nutrients; grams: number | null } {
	assertPositive(amount, 'The amount must be greater than zero');
	assertPositive(batch.portions, 'Portions must be greater than zero');
	const { cookedWeightG } = batch;
	if (unit === 'g') {
		if (cookedWeightG === null) throw new RangeError('Grams need a cooked weight');
		return { nutrients: scaleSnapshot(batch.totals, cookedWeightG, amount), grams: amount };
	}
	const grams =
		cookedWeightG === null ? null : toGrams(amount, unit, cookedWeightG / batch.portions);
	return { nutrients: scaleSnapshot(batch.totals, batch.portions, amount), grams };
}

/**
 * Portions left: the batch's portions minus the logged ones. A portion entry counts its amount. A gram entry counts its
 * grams over the portion weight as it is now (cooked weight / portions); without a cooked weight, gram entries count
 * for nothing. The raw value may be negative.
 */
export function portionsLeft(batch: BatchShape, entries: BatchEntry[]): number {
	let logged = 0;
	for (const entry of entries) {
		if (entry.unit === 'portion') logged += entry.amount;
		else if (entry.unit !== 'g') throw new RangeError(`Unit ${entry.unit} is not a batch unit`);
		else if (batch.cookedWeightG !== null && entry.grams !== null)
			logged += entry.grams / (batch.cookedWeightG / batch.portions);
	}
	return batch.portions - logged;
}

/** Net weight of a cooked batch: the gross weight on the scale minus the container's tare, to 0.1 g. Must be above zero. */
export function netWeight(gross: number, tareG: number): number {
	const net = round1(gross - tareG);
	if (!Number.isFinite(net) || net <= 0)
		throw new RangeError('The net weight must be greater than zero');
	return net;
}

/** The ISO instant `BATCH_AUTO_FINISH_DAYS` days of 24 hours before `now`; activity strictly before it is stale. */
export function staleCutoff(now: Date): string {
	return new Date(now.getTime() - BATCH_AUTO_FINISH_DAYS * DAY_MS).toISOString();
}

/** True once more than `BATCH_AUTO_FINISH_DAYS` days of 24 hours have passed since the last activity. */
export function isStale(lastActivityIso: string, now: Date): boolean {
	const last = Date.parse(lastActivityIso);
	if (Number.isNaN(last)) throw new RangeError('The last activity must be a date');
	return now.getTime() - last > BATCH_AUTO_FINISH_DAYS * DAY_MS;
}
