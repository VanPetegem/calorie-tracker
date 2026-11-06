import * as v from 'valibot';
import { MAX_INGREDIENTS, MAX_NOTES, MAX_PORTIONS } from '../domain/constants.ts';
import { amount, fitsUnit, id, ingredientUnit, orNull, positiveUpTo, text } from './fields.ts';

/**
 * One recipe line: a library food and an amount. Nutrition is never accepted from the client; the server reads
 * the food and checks that it exists and that the unit fits it.
 */
export const IngredientInput = v.pipe(
	v.strictObject({ foodId: id, amount, unit: ingredientUnit }),
	v.forward(
		v.check((input) => fitsUnit(input), 'Too much for this unit'),
		['amount']
	)
);

export type IngredientInput = v.InferOutput<typeof IngredientInput>;

/** A whole recipe, saved at once. Without an id it is a new recipe. */
export const RecipeInput = v.strictObject({
	id: v.optional(id),
	name: text(200),
	defaultPortions: positiveUpTo(MAX_PORTIONS),
	notes: orNull(text(MAX_NOTES)),
	ingredients: v.pipe(
		v.array(IngredientInput),
		v.minLength(1, 'Add at least one ingredient'),
		v.maxLength(MAX_INGREDIENTS, `Use at most ${MAX_INGREDIENTS} ingredients`)
	)
});

export type RecipeInput = v.InferOutput<typeof RecipeInput>;

/** Archive and restore take only the id. */
export const ArchiveRecipeInput = v.strictObject({ id });

export type ArchiveRecipeInput = v.InferOutput<typeof ArchiveRecipeInput>;
