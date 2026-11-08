import { redirect } from '@sveltejs/kit';
import { appContext } from '#lib/server/context.ts';
import { onboardingRedirect } from '#lib/server/guard.ts';
import { isProfileComplete } from '#lib/server/settings/repo.ts';
import { loadOnboarding } from '#lib/server/targets/commands.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const ctx = await appContext();
	const to = onboardingRedirect(url.pathname, isProfileComplete(ctx.settings));
	if (to) redirect(303, to);
	return loadOnboarding(ctx);
};
