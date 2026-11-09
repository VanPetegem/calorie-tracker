import type { Handle } from '@sveltejs/kit/hooks';
import { redirect } from '@sveltejs/kit';
import { building } from '$app/env';
import { env } from 'cloudflare:workers';
import { getSessionCookie } from 'better-auth/cookies';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { createAuth, type Auth } from '#lib/server/auth.ts';
import { decideAccess } from '#lib/server/guard.ts';
import { isRateLimitedPath, rateLimitKey } from '#lib/server/rate-limit.ts';
import { TOO_MANY_ATTEMPTS } from '#lib/auth-rules.ts';

export { handleError } from '#lib/server/handle-error.ts';

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

/** Forbids embedding any page in a frame (clickjacking). Both headers: X-Frame-Options for older browsers. */
function withFrameProtection(response: Response) {
	const set = (headers: Headers) => {
		headers.set('x-frame-options', 'DENY');
		// Add to a policy another layer already set instead of replacing it.
		const csp = headers.get('content-security-policy');
		if (!csp?.includes('frame-ancestors')) {
			headers.set(
				'content-security-policy',
				[csp, "frame-ancestors 'none'"].filter(Boolean).join('; ')
			);
		}
	};
	try {
		set(response.headers);
		return response;
	} catch {
		// Responses from `fetch` have immutable headers: copy them.
		const copy = new Response(response.body, response);
		set(copy.headers);
		return copy;
	}
}

const handleRequest: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	const { request, url } = event;
	const auth = getAuth();
	event.locals.auth = auth;

	// Throttle credential attempts before any of them reaches Better Auth.
	if (isRateLimitedPath(request.method, url.pathname)) {
		const { success } = await env.AUTH_LIMITER.limit({ key: rateLimitKey(request.headers) });
		if (!success) {
			// Form actions answer with their own 429 message, so the page shows it like any other error.
			if (!url.pathname.startsWith('/api/')) {
				event.locals.rateLimited = true;
			} else {
				return Response.json(
					{ code: 'TOO_MANY_REQUESTS', message: TOO_MANY_ATTEMPTS },
					{ status: 429, headers: { 'retry-after': '60', 'cache-control': 'no-store' } }
				);
			}
		}
	}

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

export const handle: Handle = async (input) => withFrameProtection(await handleRequest(input));
