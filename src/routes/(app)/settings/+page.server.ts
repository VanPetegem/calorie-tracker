import { listContainers } from '#lib/server/batches/repo.ts';
import { appContext } from '#lib/server/context.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { db } = await appContext();
	return { containers: await listContainers(db) };
};
