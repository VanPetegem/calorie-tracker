import * as v from 'valibot';
import { FoodInput } from '../../schemas/food.ts';
import type { LabelValues } from '../../schemas/label.ts';

const nullableNumber = v.nullable(v.number());

/** What the model answers (the same shape as `LABEL_JSON_SCHEMA` in read.ts). */
export const ModelLabel = v.object({
	found: v.boolean(),
	basis: v.picklist(['g', 'ml']),
	kcal: nullableNumber,
	protein: nullableNumber,
	carbs: nullableNumber,
	fat: nullableNumber,
	fiber: nullableNumber,
	servingG: nullableNumber
});

export type ModelLabel = v.InferOutput<typeof ModelLabel>;

/** The value when `FoodInput` accepts it for `field`, else null. Never clamps: an odd number is a misread. */
function accepted(
	field: 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'servingG',
	value: number | null
): number | null {
	if (value === null) return null;
	const result = v.safeParse(FoodInput.entries[field], value);
	return result.success ? result.output : null;
}

/**
 * Turns the model's answer into form values, or null when there is nothing usable: no per 100 column, or no kcal
 * inside the range `FoodInput` accepts. Any other value outside its range becomes null.
 */
export function normalizeLabel(raw: ModelLabel): LabelValues | null {
	if (!raw.found) return null;
	const kcal = accepted('kcal', raw.kcal);
	if (kcal === null) return null;
	return {
		nutritionBasis: raw.basis,
		kcal,
		protein: accepted('protein', raw.protein),
		carbs: accepted('carbs', raw.carbs),
		fat: accepted('fat', raw.fat),
		fiber: accepted('fiber', raw.fiber),
		servingG: accepted('servingG', raw.servingG)
	};
}
