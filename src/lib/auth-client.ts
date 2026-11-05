import { createAuthClient } from 'better-auth/client';
import { passkeyClient } from '@better-auth/passkey/client';

/** Browser side Better Auth client. Talks to `/api/auth` on the page's own origin. */
export const authClient = createAuthClient({ plugins: [passkeyClient()] });

/** A readable default name for a new passkey, so the list tells devices apart. */
export function deviceName(userAgent = navigator.userAgent): string {
	if (/iPhone/.test(userAgent)) return 'iPhone';
	if (/iPad/.test(userAgent)) return 'iPad';
	if (/Macintosh/.test(userAgent)) return 'Mac';
	if (/Android/.test(userAgent)) return 'Android';
	if (/Windows/.test(userAgent)) return 'Windows';
	return 'Passkey';
}

/**
 * Ends the session, then deletes the service worker caches so pages rendered for the signed in user cannot be
 * opened from the cache afterwards, then loads `to` (a /login URL) fresh. Returns false, without navigating,
 * only when the sign out request itself failed; a failed cache purge never keeps the user signed in.
 */
export async function signOut(to = '/login'): Promise<boolean> {
	try {
		const { error } = await authClient.signOut();
		if (error) return false;
	} catch {
		return false;
	}
	try {
		const keys = await caches.keys();
		await Promise.all(
			keys.filter((key) => key.startsWith('kcal-')).map((key) => caches.delete(key))
		);
	} catch {
		// No Cache Storage (an insecure context) or the purge failed: the session is gone either way.
	}
	window.location.assign(to);
	return true;
}
