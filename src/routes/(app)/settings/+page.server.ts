import { listContainers } from '#lib/server/batches/repo.ts';
import { appContext } from '#lib/server/context.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { db, settings } = await appContext();
	return {
		target: { kcal: settings.manualTargetKcal, weightKg: settings.manualWeightKg },
		containers: await listContainers(db)
	};
};
