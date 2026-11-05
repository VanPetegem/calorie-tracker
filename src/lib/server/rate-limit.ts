/**
 * Which requests the AUTH_LIMITER binding throttles: every way to try a credential or create the account.
 * Better Auth's own limiter is off on Workers (it keys on NODE_ENV) and never sees the form actions, which
 * call `auth.api` directly, so the hook checks these before anything else runs.
 */

/** Form actions that sign in or sign up. */
const FORM_PATHS = new Set(['/login', '/setup']);

/** Better Auth endpoints that check a credential or create a user. */
const AUTH_PREFIXES = ['/api/auth/sign-in/', '/api/auth/sign-up/'];
// change-password checks the current password: without a limit, a stolen session cookie could guess it.
const AUTH_PATHS = new Set([
	'/api/auth/passkey/verify-authentication',
	'/api/auth/change-password'
]);

export function isRateLimitedPath(method: string, pathname: string): boolean {
	if (method !== 'POST') return false;
	return (
		FORM_PATHS.has(pathname) ||
		AUTH_PATHS.has(pathname) ||
		AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
	);
}

/**
 * Counted per client IP. Cloudflare sets `cf-connecting-ip` on every request it forwards (a client cannot
 * override it in production); without it all requests share one key, so they are still limited.
 */
export function rateLimitKey(headers: Headers): string {
	return headers.get('cf-connecting-ip') ?? 'unknown';
}
