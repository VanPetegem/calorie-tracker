import * as v from 'valibot';
import { MAX_QUICK_KCAL, MAX_QUICK_MACRO_G, MIN_QUICK_KCAL } from '../domain/constants.ts';
import {
	amount,
	batchLogUnit,
	decimalIn,
	fitsUnit,
	foodLogUnit,
	id,
	isoDate,
	logUnit,
	orNull,
	text
} from './fields.ts';

const TOO_MUCH = 'Too much for this unit';

/**
 * Logs an amount of a library food. The date must also pass `isAllowedLogDate`, which needs today in the
 * settings timezone. Nutrition is never accepted from the client: the server snapshots it from the food.
 */
export const LogFoodInput = v.pipe(
	v.strictObject({ date: isoDate, foodId: id, amount, unit: foodLogUnit }),
	v.forward(
		v.check((input) => fitsUnit(input), TOO_MUCH),
		['amount']
	)
);

export type LogFoodInput = v.InferOutput<typeof LogFoodInput>;

/**
 * Logs an amount of a batch, in portions or (for a weighed batch) grams. The server snapshots the nutrition from the
 * batch; finished batches can be logged too.
 */
export const LogBatchInput = v.pipe(
	v.strictObject({ date: isoDate, batchId: id, amount, unit: batchLogUnit }),
	v.forward(
		v.check((input) => fitsUnit(input), TOO_MUCH),
		['amount']
	)
);

export type LogBatchInput = v.InferOutput<typeof LogBatchInput>;

/**
 * Changes the amount of a logged food or batch entry; the server rescales its snapshot. Any log unit passes here;
 * the server takes only a food's units for a food entry and only portions or grams for a batch entry.
 */
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

/** Changes a quick entry's label and nutrition. The entry stays on its day. */
export const EditQuickInput = v.strictObject({ id, ...v.omit(QuickInput, ['date']).entries });

export type EditQuickInput = v.InferOutput<typeof EditQuickInput>;

/** Undo of a delete: only the id. The server brings back the stored row, so no values come from the client. */
export const RestoreEntryInput = v.strictObject({ id });

export type RestoreEntryInput = v.InferOutput<typeof RestoreEntryInput>;
