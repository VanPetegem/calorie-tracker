import { command } from '$app/server';
import { ArchiveRecipeInput, RecipeInput } from '#lib/schemas/recipe.ts';
import { appContext } from '#lib/server/context.ts';
import { archiveRecipe as archive, restoreRecipe as restore } from '#lib/server/recipes/repo.ts';
import { saveRecipeResult, type SaveRecipeResult } from '#lib/server/recipes/result.ts';

/*
 * Recipe writes. Each command validates its input with the shared schema; the server reads every food itself and
 * computes the grams, so no nutrition crosses the wire. The recipes pages read through `load`, so callers
 * `await invalidateAll()` after a command resolves.
 */

/**
 * Creates (no id) or replaces a whole recipe. A food that is gone or a unit that does not fit comes back as
 * `{ ok: false, ... index }` so the form can mark the line; an unknown recipe id is a 404.
 */
export const saveRecipe = command(RecipeInput, async (input): Promise<SaveRecipeResult> => {
	const { db } = await appContext();
	return saveRecipeResult(db, input);
});

/** Hides a recipe from the list. */
export const archiveRecipe = command(ArchiveRecipeInput, async ({ id }) => {
	const { db } = await appContext();
	await archive(db, id);
});

/** Undo of an archive. */
export const restoreRecipe = command(ArchiveRecipeInput, async ({ id }) => {
	const { db } = await appContext();
	await restore(db, id);
});
