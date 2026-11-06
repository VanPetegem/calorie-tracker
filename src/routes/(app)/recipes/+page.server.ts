import { activeBatches, finishedBatches } from '#lib/server/batches/repo.ts';
import { appContext } from '#lib/server/context.ts';
import { listRecipes } from '#lib/server/recipes/repo.ts';
import type { PageServerLoad } from './$types';

/** Active batches (this is where auto finish runs), recipes, and the latest finished batches. */
export const load: PageServerLoad = async () => {
	const { db, now } = await appContext();
	const batches = await activeBatches(db, now);
	return {
		batches,
		recipes: await listRecipes(db),
		finished: await finishedBatches(db)
	};
};
