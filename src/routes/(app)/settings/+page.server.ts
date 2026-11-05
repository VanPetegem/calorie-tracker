import { appContext } from '#lib/server/context.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { settings } = await appContext();
	return {
		target: { kcal: settings.manualTargetKcal, weightKg: settings.manualWeightKg }
	};
};
