import { TOO_MANY_ATTEMPTS as TOO_MANY } from '#lib/auth-rules.ts';

/** The error part of a Better Auth client result. */
export type AuthClientError = { code?: string; message?: string; status: number };

/**
 * What to tell the user when adding a passkey failed. Adding one needs a fresh session (signed in within the
 * last day): a stolen long lived cookie must not be enough to plant a new credential. Sessions last a year, so
 * an older session is the normal case and the fix is to sign in again.
 */
export function addPasskeyError(error: AuthClientError): { message: string; signInAgain: boolean } {
	switch (error.code) {
		case 'SESSION_NOT_FRESH':
			return {
				message:
					'To add a passkey, sign in again first. This keeps a stolen session from adding one.',
				signInAgain: true
			};
		case 'ERROR_CEREMONY_ABORTED':
			return { message: 'No passkey was saved.', signInAgain: false };
		case 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED':
			return { message: 'This device already has a passkey for kcal.', signInAgain: false };
	}
	if (error.status === 429) return { message: TOO_MANY, signInAgain: false };
	return { message: 'The passkey was not saved. Try again.', signInAgain: false };
}

/** What to tell the user when signing in with a passkey failed. */
export function signInPasskeyError(error: AuthClientError): string {
	if (error.status === 429) return TOO_MANY;
	if (error.code === 'NOT_SUPPORTED') {
		return "This browser can't use passkeys. Sign in with your email and password.";
	}
	// A dismissed or aborted ceremony is ordinary; anything else is named so a failing browser can be diagnosed.
	const ordinary = [
		undefined,
		'AUTH_CANCELLED',
		'ERROR_CEREMONY_ABORTED',
		'NotAllowedError',
		'AbortError'
	];
	const detail = ordinary.includes(error.code) ? '' : ` (${error.code})`;
	return `No passkey was used${detail}. Try again, or sign in with your email and password.`;
}
