import * as v from 'valibot';
import { MAX_WEIGHT_KG, MIN_WEIGHT_KG } from '../domain/constants.ts';
import { decimalIn, isoDate } from './fields.ts';

/**
 * A weigh-in for a local calendar date; saving a date again replaces its kg. The date must also pass
 * `isAllowedLogDate`, which needs today in the settings timezone, so the command checks it.
 */
export const WeightInput = v.strictObject({
	date: isoDate,
	kg: decimalIn(MIN_WEIGHT_KG, MAX_WEIGHT_KG)
});

export type WeightInput = v.InferOutput<typeof WeightInput>;

/** Deleting a weigh-in takes only its date. */
export const DeleteWeightInput = v.strictObject({ date: isoDate });

export type DeleteWeightInput = v.InferOutput<typeof DeleteWeightInput>;
