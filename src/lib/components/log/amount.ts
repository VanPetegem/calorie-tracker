import { batchEntrySnapshot, type BatchShape } from '#lib/domain/batch.ts';
import type { Nutrients } from '#lib/domain/nutrition.ts';
import { BATCH_LOG_UNITS, type BatchLogUnit, type FoodLogUnit } from '#lib/schemas/fields.ts';

/** The part of a food the amount step needs to pick units and defaults. */
export type AmountFood = { nutritionBasis: 'g' | 'ml'; servingG: number | null };

export type AmountValue = { amount: number; unit: FoodLogUnit };

/** Units offered for a food: its base unit (g or ml), plus serving when the food has a serving weight. */
export function unitOptions(food: AmountFood): FoodLogUnit[] {
	return food.servingG === null ? [food.nutritionBasis] : [food.nutritionBasis, 'serving'];
}

/**
 * What the amount field starts with: the last used amount if it still fits the food, otherwise one serving,
 * otherwise 100 g (or 100 ml).
 */
export function defaultAmount(
	food: AmountFood,
	last?: { amount: number; unit: string; grams?: number | null } | null
): AmountValue {
	if (last && last.amount > 0) {
		const unit = unitOptions(food).find((option) => option === last.unit);
		if (unit) return { amount: last.amount, unit };
		// A serving amount on a food that lost its serving weight: keep the same quantity in the base unit.
		if (last.unit === 'serving' && last.grams != null && last.grams > 0) {
			return { amount: last.grams, unit: food.nutritionBasis };
		}
		// g and ml are the same number for a food whose basis changed.
		if ((last.unit === 'g' || last.unit === 'ml') && last.unit !== food.nutritionBasis) {
			return { amount: last.amount, unit: food.nutritionBasis };
		}
	}
	if (food.servingG !== null) return { amount: 1, unit: 'serving' };
	return { amount: 100, unit: food.nutritionBasis };
}

/** The same quantity in another unit, rounded to two decimals. g and ml are interchangeable here. */
export function convertAmount(
	amount: number,
	from: FoodLogUnit,
	to: FoodLogUnit,
	servingG: number | null
): number {
	if (servingG === null || (from === 'serving') === (to === 'serving')) return amount;
	const value = from === 'serving' ? amount * servingG : amount / servingG;
	return Math.round(value * 100) / 100;
}

export type BatchAmountValue = { amount: number; unit: BatchLogUnit };

export const NO_COOKED_WEIGHT_HINT = 'Add the cooked weight to log grams';
export const NO_ENTRY_WEIGHT_HINT = 'This entry has no weight, so it changes in portions only';
export const NO_PORTION_WEIGHT_HINT =
	'Add the cooked weight to the batch to change this entry to portions';

/**
 * What the batch amount step prices an amount with. `shape` is what `batchEntrySnapshot` reads; `unavailable` holds the
 * reason a unit cannot be chosen. Logging a batch builds it from the batch (`batchSource`); editing an entry builds it
 * from the entry's own snapshot (`entryBatchSource`), so the preview rescales what is stored, as the server does.
 */
export type BatchAmountSource = {
	name: string;
	shape: BatchShape;
	unavailable: Partial<Record<BatchLogUnit, string>>;
};

function nutrientsOf({ kcal, protein, carbs, fat, fiber }: Nutrients): Nutrients {
	return { kcal, protein, carbs, fat, fiber };
}

/** A batch to log: its totals, portions and cooked weight. Grams need the cooked weight. */
export function batchSource(
	batch: Nutrients & Omit<BatchShape, 'totals'> & { name: string }
): BatchAmountSource {
	const { name, portions, cookedWeightG } = batch;
	const totals = nutrientsOf(batch);
	return {
		name,
		shape: { totals, portions, cookedWeightG },
		unavailable: cookedWeightG === null ? { g: NO_COOKED_WEIGHT_HINT } : {}
	};
}

/**
 * A logged batch entry to edit, priced from its own snapshot: the entry becomes a "batch" whose totals are its
 * nutrition and whose weight is its grams. A portion entry rescales by amount over its amount (portions) and by grams
 * over its grams; a gram entry reaches portions through `portionG`, the batch's portion weight as it is now, which is
 * what the server converts with. Without grams only portions are offered; without `portionG` a gram entry stays in
 * grams. Null when the entry has no batch amount.
 */
export function entryBatchSource(
	entry: Nutrients & {
		amount: number | null;
		unit: string | null;
		grams: number | null;
		label?: string | null;
	},
	portionG: number | null
): BatchAmountSource | null {
	const { amount, unit, grams, label } = entry;
	const totals = nutrientsOf(entry);
	if (amount === null || amount <= 0) return null;
	const name = label ?? 'Batch';
	if (unit === 'portion') {
		return {
			name,
			shape: { totals, portions: amount, cookedWeightG: grams },
			unavailable: grams === null ? { g: NO_ENTRY_WEIGHT_HINT } : {}
		};
	}
	if (unit === 'g') {
		return {
			name,
			shape: {
				totals,
				portions: portionG === null ? 1 : amount / portionG,
				cookedWeightG: amount
			},
			unavailable: portionG === null ? { portion: NO_PORTION_WEIGHT_HINT } : {}
		};
	}
	return null;
}

/** The units of the batch amount step, each with the reason it is off when it is. */
export function batchUnitOptions(
	source: BatchAmountSource
): { value: BatchLogUnit; disabled?: string }[] {
	return BATCH_LOG_UNITS.map((value) => {
		const disabled = source.unavailable[value];
		return disabled === undefined ? { value } : { value, disabled };
	});
}

/** One portion for a new entry, or the entry's own amount when editing (one portion when its unit is off). */
export function defaultBatchAmount(
	source: BatchAmountSource,
	last?: { amount: number; unit: string } | null
): BatchAmountValue {
	if (last && last.amount > 0) {
		const unit = BATCH_LOG_UNITS.find((value) => value === last.unit);
		if (unit && source.unavailable[unit] === undefined) return { amount: last.amount, unit };
	}
	return { amount: 1, unit: 'portion' };
}

/**
 * Nutrition and grams of an amount, from `batchEntrySnapshot`. Null for an amount that cannot be priced (zero, not a
 * number, grams without a weight), so the preview never throws while someone is typing.
 */
export function previewBatchAmount(
	source: BatchAmountSource,
	amount: number,
	unit: BatchLogUnit
): { nutrients: Nutrients; grams: number | null } | null {
	try {
		return batchEntrySnapshot(source.shape, amount, unit);
	} catch (error) {
		if (error instanceof RangeError) return null;
		throw error;
	}
}

/** The same quantity in another unit, rounded to two decimals. Unchanged when there is no weight to convert with. */
export function convertBatchAmount(
	source: BatchAmountSource,
	amount: number,
	from: BatchLogUnit,
	to: BatchLogUnit
): number {
	const { cookedWeightG, portions } = source.shape;
	if (from === to || cookedWeightG === null) return amount;
	const portionG = cookedWeightG / portions;
	return Math.round((from === 'portion' ? amount * portionG : amount / portionG) * 100) / 100;
}
