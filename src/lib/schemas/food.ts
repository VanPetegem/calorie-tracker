import * as v from 'valibot';
import {
	MAX_AMOUNT_GRAMS_OR_ML,
	MAX_KCAL_PER_100,
	MAX_MACRO_PER_100,
	MIN_KCAL_PER_100,
	MIN_MACRO_PER_100
} from '../domain/constants.ts';
import { normalizeBarcode } from '../domain/barcode.ts';
import { decimalIn, id, orNull, positiveUpTo, text } from './fields.ts';

const macro = decimalIn(MIN_MACRO_PER_100, MAX_MACRO_PER_100);

/** A food the user creates or edits. Nutrition is per 100 g, or per 100 ml when the basis is `ml`. */
export const FoodInput = v.strictObject({
	name: text(200),
	brand: orNull(text(200)),
	// A code that normalizes (a UPC-A, say) is stored as EAN-13 so a scan of it finds the food; any other is kept as typed.
	barcode: orNull(
		v.pipe(
			v.string(),
			v.trim(),
			v.regex(/^\d{8,14}$/, 'Enter 8 to 14 digits'),
			v.transform((code) => normalizeBarcode(code) ?? code)
		)
	),
	nutritionBasis: v.picklist(['g', 'ml'], 'Choose g or ml'),
	kcal: decimalIn(MIN_KCAL_PER_100, MAX_KCAL_PER_100),
	protein: macro,
	carbs: macro,
	fat: macro,
	fiber: orNull(macro),
	servingG: orNull(positiveUpTo(MAX_AMOUNT_GRAMS_OR_ML))
});

export type FoodInput = v.InferOutput<typeof FoodInput>;

/** Changes the food with `id` to these values. */
export const UpdateFoodInput = v.strictObject({ id, ...FoodInput.entries });

export type UpdateFoodInput = v.InferOutput<typeof UpdateFoodInput>;

/** A scanned or typed barcode, with the format the scanner reported when it did. */
export const BarcodeLookupInput = v.strictObject({
	raw: v.pipe(v.string(), v.trim(), v.maxLength(32)),
	format: v.optional(v.picklist(['ean_13', 'ean_8', 'upc_a', 'upc_e']))
});

export type BarcodeLookupInput = v.InferOutput<typeof BarcodeLookupInput>;
