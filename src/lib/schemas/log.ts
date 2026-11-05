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

/** Changes a quick entry's label and nutrition. The entry stays on its day. */
export const EditQuickInput = v.strictObject({ id, ...v.omit(QuickInput, ['date']).entries });

export type EditQuickInput = v.InferOutput<typeof EditQuickInput>;

const nutrient = v.pipe(v.number(), v.finite(), v.minValue(0));
const isoTime = v.pipe(v.string(), v.isoTimestamp('Enter a time as an ISO timestamp'));

/**
 * A deleted entry sent back by Undo, exactly as `removeEntry` returned it, so it is re-inserted with the same id.
 * Food entries carry their food, amount, unit and grams; quick entries carry none of them.
 */
export const RestoreEntryInput = v.pipe(
	v.strictObject({
		id,
		date: isoDate,
		loggedAt: isoTime,
		kind: v.picklist(['food', 'quick']),
		foodId: v.nullable(id),
		batchId: v.null(),
		amount: v.nullable(v.pipe(v.number(), v.finite(), v.gtValue(0))),
		unit: v.nullable(logUnit),
		grams: v.nullable(v.pipe(v.number(), v.finite(), v.gtValue(0))),
		label: v.nullable(text(200)),
		kcal: nutrient,
		protein: nutrient,
		carbs: nutrient,
		fat: nutrient,
		fiber: v.nullable(nutrient)
	}),
	v.check((entry) => {
		const foodFields = [entry.foodId, entry.amount, entry.unit, entry.grams];
		return entry.kind === 'food'
			? foodFields.every((field) => field !== null)
			: foodFields.every((field) => field === null);
	}, 'Food entries need a food, amount, unit and grams; quick entries have none')
);

export type RestoreEntryInput = v.InferOutput<typeof RestoreEntryInput>;
