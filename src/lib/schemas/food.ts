import * as v from 'valibot';
import {
	MAX_AMOUNT_GRAMS_OR_ML,
	MAX_KCAL_PER_100,
	MAX_MACRO_PER_100,
	MIN_KCAL_PER_100,
	MIN_MACRO_PER_100
} from '../domain/constants.ts';
import { decimalIn, orNull, positiveUpTo, text } from './fields.ts';

const macro = decimalIn(MIN_MACRO_PER_100, MAX_MACRO_PER_100);

/** A food the user creates or edits. Nutrition is per 100 g, or per 100 ml when the basis is `ml`. */
export const FoodInput = v.strictObject({
	name: text(200),
	brand: orNull(text(200)),
	barcode: orNull(v.pipe(v.string(), v.trim(), v.regex(/^\d{8,14}$/, 'Enter 8 to 14 digits'))),
	nutritionBasis: v.picklist(['g', 'ml'], 'Choose g or ml'),
	kcal: decimalIn(MIN_KCAL_PER_100, MAX_KCAL_PER_100),
	protein: macro,
	carbs: macro,
	fat: macro,
	fiber: orNull(macro),
	servingG: orNull(positiveUpTo(MAX_AMOUNT_GRAMS_OR_ML))
});

export type FoodInput = v.InferOutput<typeof FoodInput>;
