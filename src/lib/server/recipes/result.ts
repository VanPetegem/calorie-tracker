import { error } from '@sveltejs/kit';
import type { RecipeInput } from '../../schemas/recipe.ts';
import type { Db } from '../db/index.ts';
import {
	RecipeNotFoundError,
	UnitNotAvailableError,
	UnknownFoodError,
	saveRecipe
} from './repo.ts';

/**
 * What the `saveRecipe` command answers. A line the server cannot accept comes back as a result with the index of
 * that line, so the form can mark it (the same shape as `createFood`'s `barcode_taken`); nothing was written.
 */
export type SaveRecipeResult =
	| { ok: true; id: string }
	| {
			ok: false;
			reason: 'unknown_food' | 'unit_not_available';
			message: string;
			index: number;
	  };

/**
 * Saves a recipe and maps the repository's typed errors for the remote layer. A food that is gone or a unit that
 * does not fit becomes a result with the line's index. A recipe id that does not exist is a 404 with its message:
 * there is no line to mark, the recipe itself is gone. Anything else is not expected and propagates.
 */
export async function saveRecipeResult(db: Db, input: RecipeInput): Promise<SaveRecipeResult> {
	try {
		const recipe = await saveRecipe(db, input);
		return { ok: true, id: recipe.id };
	} catch (cause) {
		if (cause instanceof UnknownFoodError) {
			return { ok: false, reason: 'unknown_food', message: cause.message, index: cause.index };
		}
		if (cause instanceof UnitNotAvailableError) {
			return {
				ok: false,
				reason: 'unit_not_available',
				message: cause.message,
				index: cause.index
			};
		}
		if (cause instanceof RecipeNotFoundError) error(404, cause.message);
		throw cause;
	}
}
