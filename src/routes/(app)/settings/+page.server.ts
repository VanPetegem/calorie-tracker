import { listContainers } from '#lib/server/batches/repo.ts';
import { appContext } from '#lib/server/context.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const ctx = await appContext();
	const { settings } = ctx;
	return {
		containers: await listContainers(ctx.db),
		today: ctx.today,
		profile: {
			sex: settings.sex,
			birthDate: settings.birthDate,
			heightCm: settings.heightCm,
			activityLevel: settings.activityLevel
		}
	};
};
