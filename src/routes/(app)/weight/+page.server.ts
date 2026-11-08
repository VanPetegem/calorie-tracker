import { appContext } from '#lib/server/context.ts';
import { isProfileComplete } from '#lib/server/settings/repo.ts';
import { targetFor } from '#lib/server/targets/repo.ts';
import { loadWeight } from '#lib/server/weights/commands.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const ctx = await appContext();
	const [weight, week] = await Promise.all([
		loadWeight(ctx),
		isProfileComplete(ctx.settings) ? targetFor(ctx, ctx.today) : null
	]);
	return { ...weight, week, goalRatePct: ctx.settings.goalRatePct };
};
