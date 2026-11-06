import { error, redirect } from '@sveltejs/kit';
import { isAllowedLogDate } from '#lib/domain/dates.ts';
import { appContext } from '#lib/server/context.ts';
import { loadDay } from '#lib/server/log/day.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const ctx = await appContext();
	// Same limit as logging: any real date up to tomorrow. Today lives at `/`.
	if (!isAllowedLogDate(params.date, ctx.today)) error(404, 'Not found');
	if (params.date === ctx.today) redirect(307, '/');
	return loadDay(ctx, params.date);
};
