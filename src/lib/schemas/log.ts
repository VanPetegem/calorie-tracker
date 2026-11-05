import * as v from 'valibot';
import { MAX_QUICK_KCAL, MAX_QUICK_MACRO_G, MIN_QUICK_KCAL } from '../domain/constants.ts';
import { amount, decimalIn, fitsUnit, id, isoDate, logUnit, orNull, text } from './fields.ts';

const TOO_MUCH = 'Too much for this unit';

/**
 * Logs an amount of a library food. The date must also pass `isAllowedLogDate`, which needs today in the
 * settings timezone. Nutrition is never accepted from the client: the server snapshots it from the food.
 */
export const LogFoodInput = v.pipe(
	v.strictObject({ date: isoDate, foodId: id, amount, unit: logUnit }),
	v.forward(
		v.check((input) => fitsUnit(input), TOO_MUCH),
		['amount']
	)
);

export type LogFoodInput = v.InferOutput<typeof LogFoodInput>;

/** Changes the amount of a logged food entry; the server rescales its snapshot. */
export const EditAmountInput = v.pipe(
	v.strictObject({ id, amount, unit: logUnit }),
	v.forward(
		v.check((input) => fitsUnit(input), TOO_MUCH),
		['amount']
	)
);

export type EditAmountInput = v.InferOutput<typeof EditAmountInput>;

const quickMacro = orNull(decimalIn(0, MAX_QUICK_MACRO_G));

/** Manual kcal and macros without a food, such as a restaurant estimate. */
export const QuickInput = v.strictObject({
	date: isoDate,
	label: orNull(text(200)),
	kcal: decimalIn(MIN_QUICK_KCAL, MAX_QUICK_KCAL),
	protein: quickMacro,
	carbs: quickMacro,
	fat: quickMacro
});

export type QuickInput = v.InferOutput<typeof QuickInput>;
