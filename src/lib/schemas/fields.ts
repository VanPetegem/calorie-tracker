import * as v from 'valibot';
import { isCalendarDate } from '../domain/dates.ts';
import { MAX_AMOUNT_GRAMS_OR_ML, MAX_AMOUNT_SERVINGS } from '../domain/constants.ts';
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

/** An optional field: missing, null and blank become null; anything else must pass `schema`. */
export function orNull<TSchema extends v.GenericSchema>(schema: TSchema) {
	return v.optional(v.union([blank, schema]), null);
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

/** Units a log entry can be entered in. Portions arrive with batches in phase 3. */
export const LOG_UNITS = ['g', 'ml', 'serving'] as const satisfies readonly Unit[];
export type LogUnit = (typeof LOG_UNITS)[number];

export const logUnit = v.picklist(LOG_UNITS, 'Choose a unit');

/** Any amount greater than zero; `fitsUnit` then applies the limit of the chosen unit. */
export const amount = positiveUpTo(Math.max(MAX_AMOUNT_GRAMS_OR_ML, MAX_AMOUNT_SERVINGS));

export function fitsUnit(input: { amount: number; unit: LogUnit }): boolean {
	return input.amount <= (input.unit === 'serving' ? MAX_AMOUNT_SERVINGS : MAX_AMOUNT_GRAMS_OR_ML);
}
