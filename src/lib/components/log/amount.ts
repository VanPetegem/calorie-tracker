import type { LogUnit } from '#lib/schemas/fields.ts';

/** The part of a food the amount step needs to pick units and defaults. */
export type AmountFood = { nutritionBasis: 'g' | 'ml'; servingG: number | null };

export type AmountValue = { amount: number; unit: LogUnit };

/** Units offered for a food: its base unit (g or ml), plus serving when the food has a serving weight. */
export function unitOptions(food: AmountFood): LogUnit[] {
	return food.servingG === null ? [food.nutritionBasis] : [food.nutritionBasis, 'serving'];
}

/**
 * What the amount field starts with: the last used amount if it still fits the food, otherwise one serving,
 * otherwise 100 g (or 100 ml).
 */
export function defaultAmount(
	food: AmountFood,
	last?: { amount: number; unit: string } | null
): AmountValue {
	if (last && last.amount > 0) {
		const unit = unitOptions(food).find((option) => option === last.unit);
		if (unit) return { amount: last.amount, unit };
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
	from: LogUnit,
	to: LogUnit,
	servingG: number | null
): number {
	if (servingG === null || (from === 'serving') === (to === 'serving')) return amount;
	const value = from === 'serving' ? amount * servingG : amount / servingG;
	return Math.round(value * 100) / 100;
}
