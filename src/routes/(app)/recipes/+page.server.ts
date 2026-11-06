import { appContext } from '#lib/server/context.ts';
import { listRecipes } from '#lib/server/recipes/repo.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { db } = await appContext();
	return { recipes: await listRecipes(db) };
};
