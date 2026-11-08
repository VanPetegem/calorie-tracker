import { redirect } from '@sveltejs/kit';
import { appContext } from '#lib/server/context.ts';
import { onboardingRedirect } from '#lib/server/guard.ts';
import { isProfileComplete } from '#lib/server/settings/repo.ts';
import type { LayoutServerLoad } from './$types';

// Every app page needs a complete profile, because its targets come from it. Remote functions are not under this
// layout, so they are not redirected (see `onboardingRedirect`).
export const load: LayoutServerLoad = async ({ url }) => {
	const { settings } = await appContext();
	const to = onboardingRedirect(url.pathname, isProfileComplete(settings));
	if (to) redirect(303, to);
	return {};
};
