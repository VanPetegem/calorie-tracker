import { fail, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import { env } from 'cloudflare:workers';
import { hasAnyUser } from '#lib/server/auth.ts';
import { MIN_PASSWORD_LENGTH, TOO_MANY_ATTEMPTS } from '#lib/auth-rules.ts';
import type { Actions, PageServerLoad } from './$types';

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
		// AUTH_LIMITER refused this attempt in the hook.
		if (locals.rateLimited) {
			return fail(429, {
				name,
				email,
				errors: {} as FieldErrors,
				message: TOO_MANY_ATTEMPTS
			});
		}

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
			// Someone finished setup first: sign up is closed. The user create hook answers 403; when two sign ups
			// race past it, the D1 trigger aborts the second insert and Better Auth reports a 422 instead.
			if (error.statusCode === 403 || (await hasAnyUser(env.DB))) redirect(303, '/login');
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
