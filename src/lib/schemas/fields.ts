import * as v from 'valibot';
import { isCalendarDate } from '../domain/dates.ts';
import { MAX_AMOUNT_GRAMS_OR_ML, MAX_AMOUNT_SERVINGS, MAX_PORTIONS } from '../domain/constants.ts';
import type { Unit } from '../domain/nutrition.ts';
import { parseDecimal } from '../utils/decimal.ts';

/** Form fields arrive as text; remote calls may send numbers. Text accepts `72,5` as well as `72.5`. */
const decimal = v.pipe(
	v.union([v.number(), v.string()], 'Enter a number'),
	v.transform((value) => (typeof value === 'number' ? value : parseDecimal(value))),
	v.number('Enter a number'),
	v.finite('Enter a number')
);

/** A number from `min` to `max`, both inclusive. */
export function decimalIn(min: number, max: number) {
	return v.pipe(
		decimal,
		v.minValue(min, `Enter at least ${min}`),
		v.maxValue(max, `Enter at most ${max}`)
	);
}

/** A number equal to one of `values`, such as a preset. */
export function decimalOneOf(values: readonly number[], message: string) {
	return v.pipe(
		decimal,
		v.check((value) => values.includes(value), message)
	);
}

/** A number greater than zero and at most `max`. */
export function positiveUpTo(max: number) {
	return v.pipe(
		decimal,
		v.gtValue(0, 'Enter more than 0'),
		v.maxValue(max, `Enter at most ${max}`)
	);
}

/** Null and blank text mean "no value". */
const blank = v.pipe(
	v.union([v.null(), v.pipe(v.string(), v.trim(), v.length(0))]),
	v.transform(() => null)
);

function isBlank(input: unknown): boolean {
	return input === null || (typeof input === 'string' && input.trim() === '');
}

/**
 * An optional field: missing, null and blank become null; anything else must pass `schema`. The choice is made on
 * the input rather than with a union, so a bad value reports `schema`'s own message ("Enter a number") instead of
 * the union's raw type error.
 */
export function orNull<TSchema extends v.GenericSchema>(schema: TSchema) {
	return v.optional(
		v.lazy(
			(
				input
			): v.GenericSchema<v.InferInput<TSchema> | string | null, v.InferOutput<TSchema> | null> =>
				isBlank(input) ? blank : schema
		),
		null
	);
}

/** Trimmed, non empty text of at most `max` characters. */
export function text(max: number) {
	return v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty('Enter a value'),
		v.maxLength(max, `Use at most ${max} characters`)
	);
}

export const isoDate = v.pipe(v.string(), v.check(isCalendarDate, 'Enter a date as YYYY-MM-DD'));

export const id = v.pipe(v.string(), v.uuid('Unknown id'));

/** Units a food entry can be entered in. A food is never logged in portions; only batches are. */
export const FOOD_LOG_UNITS = ['g', 'ml', 'serving'] as const satisfies readonly Unit[];
export type FoodLogUnit = (typeof FOOD_LOG_UNITS)[number];

export const foodLogUnit = v.picklist(FOOD_LOG_UNITS, 'Choose a unit');

/** Units any log entry can be in: a food's, plus portions of a batch. */
export const LOG_UNITS = [...FOOD_LOG_UNITS, 'portion'] as const satisfies readonly Unit[];
export type LogUnit = (typeof LOG_UNITS)[number];

export const logUnit = v.picklist(LOG_UNITS, 'Choose a unit');

/** Units a batch entry can be in: portions, or grams of a weighed batch. */
export const BATCH_LOG_UNITS = ['portion', 'g'] as const satisfies readonly LogUnit[];
export type BatchLogUnit = (typeof BATCH_LOG_UNITS)[number];

export const batchLogUnit = v.picklist(BATCH_LOG_UNITS, 'Choose a unit');

/**
 * Units a recipe or batch ingredient can be entered in: an ingredient is raw food, never a portion. Its own list, so
 * adding `portion` to `LOG_UNITS` for batches cannot make it a valid ingredient unit.
 */
export const INGREDIENT_UNITS = ['g', 'ml', 'serving'] as const satisfies readonly Unit[];
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

export const ingredientUnit = v.picklist(INGREDIENT_UNITS, 'Choose a unit');

/** Any amount greater than zero; `fitsUnit` then applies the limit of the chosen unit. */
export const amount = positiveUpTo(Math.max(MAX_AMOUNT_GRAMS_OR_ML, MAX_AMOUNT_SERVINGS));

const UNIT_LIMITS: Record<LogUnit | IngredientUnit, number> = {
	g: MAX_AMOUNT_GRAMS_OR_ML,
	ml: MAX_AMOUNT_GRAMS_OR_ML,
	serving: MAX_AMOUNT_SERVINGS,
	portion: MAX_PORTIONS
};

export function fitsUnit(input: { amount: number; unit: LogUnit | IngredientUnit }): boolean {
	return input.amount <= UNIT_LIMITS[input.unit];
}
