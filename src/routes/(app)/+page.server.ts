import { appContext } from '#lib/server/context.ts';
import { loadDay } from '#lib/server/log/day.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const ctx = await appContext();
	return loadDay(ctx, ctx.today);
};
