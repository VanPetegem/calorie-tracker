import { error } from '@sveltejs/kit';
import { getBatch, listContainers } from '#lib/server/batches/repo.ts';
import { appContext } from '#lib/server/context.ts';
import type { PageServerLoad } from './$types';

/** The batch with its lines, finished or not, and the containers for the weight field. */
export const load: PageServerLoad = async ({ params }) => {
	const { db } = await appContext();
	const batch = await getBatch(db, params.id);
	if (!batch) error(404, 'Batch not found');
	return { batch, containers: await listContainers(db) };
};
