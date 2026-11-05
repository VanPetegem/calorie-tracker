import { fail, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import { env } from 'cloudflare:workers';
import { hasAnyUser } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

const MIN_PASSWORD_LENGTH = 12;

/** First run only: once the account exists, setup is closed and this page sends you to login. */
export const load: PageServerLoad = async () => {
	if (await hasAnyUser(env.DB)) redirect(303, '/login');
};

type FieldErrors = Partial<Record<'name' | 'email' | 'password', string>>;

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const email = String(data.get('email') ?? '').trim();
		const password = String(data.get('password') ?? '');

		const errors: FieldErrors = {};
		if (!name) errors.name = 'Enter your name.';
		if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
			errors.email = 'Enter an email address like you@example.com.';
		}
		if (password.length < MIN_PASSWORD_LENGTH) {
			errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
		}
		if (Object.keys(errors).length > 0)
			return fail(400, { name, email, errors, message: undefined as string | undefined });

		try {
			// The sveltekitCookies plugin puts the new session cookie on this response.
			await locals.auth.api.signUpEmail({
				body: { name, email, password },
				headers: request.headers
			});
		} catch (error) {
			if (!isAPIError(error)) throw error;
			// Someone finished setup first: sign up is closed (403 from the user create hook).
			if (error.statusCode === 403) redirect(303, '/login');
			return fail(400, {
				name,
				email,
				errors,
				message: error.message || 'Could not create the account. Try again.'
			});
		}

		redirect(303, '/setup/passkey');
	}
};
