import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { env } from 'cloudflare:workers';
import { getSessionCookie } from 'better-auth/cookies';
import { createAuth } from '#lib/server/auth.ts';
import { svelteKitHandler } from 'better-auth/svelte-kit';

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	event.locals.auth = createAuth(env.DB);

	const { auth } = event.locals;

	// Anonymous requests carry no session cookie, so skip the session lookup (and its database access).
	if (getSessionCookie(event.request.headers)) {
		const session = await auth.api.getSession({ headers: event.request.headers });

		if (session) {
			event.locals.session = session.session;
			event.locals.user = session.user;
		}
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;
