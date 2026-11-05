import * as v from 'valibot';
import { MAX_MANUAL_TARGET_KCAL, MAX_WEIGHT_KG } from '../domain/constants.ts';
import { orNull, positiveUpTo } from './fields.ts';

type ManualTarget = { kcal: number; weightKg: number } | { kcal: null; weightKg: null };

/** The temporary daily target: kcal and body weight, saved together or cleared together. */
export const ManualTargetInput = v.pipe(
	v.strictObject({
		kcal: orNull(positiveUpTo(MAX_MANUAL_TARGET_KCAL)),
		weightKg: orNull(positiveUpTo(MAX_WEIGHT_KG))
	}),
	v.check(
		(input) => (input.kcal === null) === (input.weightKg === null),
		'Enter both kcal and weight, or neither'
	),
	v.transform((input) => input as ManualTarget)
);

export type ManualTargetInput = v.InferOutput<typeof ManualTargetInput>;
