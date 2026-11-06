import { error } from '@sveltejs/kit';
import { appContext } from '#lib/server/context.ts';
import { getRecipe } from '#lib/server/recipes/repo.ts';
import type { PageServerLoad } from './$types';

/** The recipe with its ingredients, archived or not (an archived one shows a banner with Restore). */
export const load: PageServerLoad = async ({ params }) => {
	const { db } = await appContext();
	const recipe = await getRecipe(db, params.id);
	if (!recipe) error(404, 'Recipe not found');
	return { recipe };
};
