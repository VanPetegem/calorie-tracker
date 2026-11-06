import { error } from '@sveltejs/kit';
import type { BatchInput } from '#lib/schemas/batch.ts';
import { draftFromRecipe, listContainers } from '#lib/server/batches/repo.ts';
import { appContext } from '#lib/server/context.ts';
import { getRecipe } from '#lib/server/recipes/repo.ts';
import type { PageServerLoad } from './$types';

/**
 * `?recipe=<id>` prefills the batch from that recipe (404 when it does not exist); without it the batch is one off
 * and empty. `draftFromRecipe` names the foods by id only, so the recipe is loaded too, for the foods of its lines.
 */
export const load: PageServerLoad = async ({ url }) => {
	const { db, today } = await appContext();
	const containers = await listContainers(db);
	const recipeId = url.searchParams.get('recipe');
	if (recipeId === null) {
		const draft: BatchInput = {
			recipeId: null,
			name: '',
			cookedOn: today,
			portions: 1,
			cookedWeightG: null,
			ingredients: []
		};
		return { draft, recipe: null, containers };
	}
	const [draft, recipe] = await Promise.all([
		draftFromRecipe(db, recipeId, today),
		getRecipe(db, recipeId)
	]);
	if (!draft || !recipe) error(404, 'Recipe not found');
	return { draft, recipe, containers };
};
