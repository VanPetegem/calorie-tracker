import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Adding a passkey needs the session that setup just created. */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
};
