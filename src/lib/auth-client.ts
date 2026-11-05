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
 * opened from the cache afterwards, then loads /login fresh. Returns false when the sign out request failed.
 */
export async function signOut(): Promise<boolean> {
	const { error } = await authClient.signOut();
	if (error) return false;
	if ('caches' in window) {
		const keys = await caches.keys();
		await Promise.all(
			keys.filter((key) => key.startsWith('kcal-')).map((key) => caches.delete(key))
		);
	}
	window.location.assign('/login');
	return true;
}
