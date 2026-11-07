import * as v from 'valibot';
import {
	MAX_COOKED_WEIGHT_G,
	MAX_INGREDIENTS,
	MAX_PORTIONS,
	MAX_TARE_G
} from '../domain/constants.ts';
import {
	amount,
	fitsUnit,
	id,
	ingredientUnit,
	isoDate,
	orNull,
	positiveUpTo,
	text
} from './fields.ts';

/**
 * One batch line. With an id it is a line the batch already has: it keeps its values per 100 and takes the new
 * amount and unit. Without one it is new and the server snapshots the food. Nutrition is never accepted from the
 * client.
 */
export const BatchIngredientInput = v.pipe(
	v.strictObject({ id: v.optional(id), foodId: id, amount, unit: ingredientUnit }),
	v.forward(
		v.check((input) => fitsUnit(input), 'Too much for this unit'),
		['amount']
	)
);

export type BatchIngredientInput = v.InferOutput<typeof BatchIngredientInput>;

/** A whole batch, saved at once. Without an id it is a new batch; `recipeId` is null for a one off batch. */
export const BatchInput = v.strictObject({
	id: v.optional(id),
	recipeId: orNull(id),
	name: text(200),
	cookedOn: isoDate,
	portions: positiveUpTo(MAX_PORTIONS),
	/** Net weight of the whole batch, after the container's tare. */
	cookedWeightG: orNull(positiveUpTo(MAX_COOKED_WEIGHT_G)),
	ingredients: v.pipe(
		v.array(BatchIngredientInput),
		v.minLength(1, 'Add at least one ingredient'),
		v.maxLength(MAX_INGREDIENTS, `Use at most ${MAX_INGREDIENTS} ingredients`)
	)
});

export type BatchInput = v.InferOutput<typeof BatchInput>;

/** Finish, reopen and delete take only the batch id. */
export const BatchIdInput = v.strictObject({ id });

export type BatchIdInput = v.InferOutput<typeof BatchIdInput>;

/** A container to weigh batches in. Without an id it is a new container. */
export const ContainerInput = v.strictObject({
	id: v.optional(id),
	name: text(100),
	tareG: positiveUpTo(MAX_TARE_G)
});

export type ContainerInput = v.InferOutput<typeof ContainerInput>;

/** Deleting a container takes only its id. */
export const ContainerIdInput = v.strictObject({ id });

export type ContainerIdInput = v.InferOutput<typeof ContainerIdInput>;
