import { fail, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import { env } from 'cloudflare:workers';
import { hasAnyUser } from '#lib/server/auth.ts';
import { safeRedirect } from '#lib/server/guard.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));
	if (locals.user) redirect(303, redirectTo);
	if (!(await hasAnyUser(env.DB))) redirect(303, '/setup');
	// Only the checked target reaches the page, which goes there after a passkey sign in.
	return { redirectTo };
};

export const actions: Actions = {
	/** Email and password fallback. Works without JavaScript. */
	default: async ({ request, url, locals }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim();
		const password = String(data.get('password') ?? '');
		if (!email || !password) {
			return fail(400, { email, message: 'Enter your email and password.' });
		}

		try {
			// The sveltekitCookies plugin puts the session cookie on this response.
			await locals.auth.api.signInEmail({ body: { email, password }, headers: request.headers });
		} catch (error) {
			if (!isAPIError(error)) throw error;
			if (error.statusCode === 429) {
				return fail(429, { email, message: 'Too many attempts. Wait a minute, then try again.' });
			}
			// Unspecific on purpose: it does not reveal whether the email exists.
			return fail(400, { email, message: 'Email or password doesn’t match.' });
		}

		redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
	}
};
