import type { Handle } from '@sveltejs/kit/hooks';
import { redirect } from '@sveltejs/kit';
import { building } from '$app/env';
import { env } from 'cloudflare:workers';
import { getSessionCookie } from 'better-auth/cookies';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { createAuth, type Auth } from '#lib/server/auth.ts';
import { decideAccess } from '#lib/server/guard.ts';

let instance: Auth | undefined;

/**
 * One Better Auth instance per isolate. Its config is static, the D1 binding from `cloudflare:workers` is the
 * same object for every request, and per request state (cookies) goes through `getRequestEvent`. Creating it
 * lazily keeps the binding out of module evaluation.
 */
function getAuth() {
	instance ??= createAuth(env.DB);
	return instance;
}

export const handle: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	const auth = getAuth();
	event.locals.auth = auth;

	// Fail closed: the cookie check only decides whether to look the session up. A missing cookie means no
	// session; a present but invalid, expired or revoked one is rejected by getSession; a lookup error throws.
	// `getSessionCookie` accepts both the plain and the `__Secure-` name of the default `better-auth` prefix.
	if (getSessionCookie(event.request.headers)) {
		const session = await auth.api.getSession({ headers: event.request.headers });
		if (session) {
			event.locals.session = session.session;
			event.locals.user = session.user;
		}
	}

	const { request, url } = event;
	const decision = decideAccess({
		pathname: url.pathname,
		search: url.search,
		method: request.method,
		accept: request.headers.get('accept'),
		secFetchMode: request.headers.get('sec-fetch-mode'),
		hasSession: event.locals.session !== undefined,
		isDataRequest: event.isDataRequest
	});

	// Thrown so SvelteKit answers a `__data.json` request with a redirect the client router follows.
	if (decision.kind === 'redirect') redirect(303, decision.location);
	if (decision.kind === 'deny') {
		return new Response('Unauthorized', {
			status: decision.status,
			headers: { 'cache-control': 'no-store' }
		});
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
