/** The error part of a Better Auth client result. */
export type AuthClientError = { code?: string; message?: string; status: number };

const TOO_MANY = 'Too many attempts. Wait a minute, then try again.';

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
	return 'No passkey was used. Try again, or sign in with your email and password.';
}
