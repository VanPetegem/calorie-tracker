import {
	startAuthentication,
	WebAuthnError,
	type AuthenticationResponseJSON,
	type PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/browser';
import { authClient } from '#lib/auth-client.ts';
import type { AuthClientError } from '#lib/auth-errors.ts';

/** The server keeps an authentication challenge for 5 minutes; fetch a new one a minute early. */
const OPTIONS_TTL_MS = 4 * 60 * 1000;

type FetchResult<T> = { data: T | null; error: AuthClientError | null };
type Options = FetchResult<PublicKeyCredentialRequestOptionsJSON>;

export type PasskeySignInResult =
	| { ok: true }
	/** `cancelled`: the ceremony ended without a passkey (dismissed, or aborted by another ceremony). */
	| { ok: false; cancelled: boolean; error: AuthClientError };

/**
 * Passkey sign in with the challenge fetched ahead of the tap. Better Auth's `signIn.passkey` fetches the
 * options first and only then calls WebAuthn; iOS Safari can drop the tap's user activation across that fetch
 * and refuse the ceremony. Here the tap goes straight to `navigator.credentials.get`.
 *
 * The server holds one challenge per browser (a cookie), so the autofill and the button share the cached
 * options: starting one ceremony aborts the other, and only one ever verifies. Any attempt spends the cache.
 */
export function createPasskeySignIn(now = () => Date.now()) {
	let cached: { at: number; options: Promise<Options> } | undefined;

	function options(): Promise<Options> {
		if (!cached || now() - cached.at > OPTIONS_TTL_MS) {
			cached = {
				at: now(),
				options: authClient.$fetch('/passkey/generate-authenticate-options', {
					method: 'GET',
					throw: false
				}) as Promise<Options>
			};
		}
		return cached.options;
	}

	async function signIn({ autofill = false } = {}): Promise<PasskeySignInResult> {
		const { data, error } = await options();
		if (!data) {
			cached = undefined;
			return { ok: false, cancelled: false, error: error ?? { status: 500 } };
		}

		let assertion: AuthenticationResponseJSON;
		try {
			assertion = await startAuthentication({ optionsJSON: data, useBrowserAutofill: autofill });
		} catch (cause) {
			// Leave the options for the ceremony that aborted this one (the button aborts the autofill).
			const code = cause instanceof WebAuthnError ? cause.code : 'AUTH_CANCELLED';
			return { ok: false, cancelled: true, error: { code, status: 400 } };
		}

		cached = undefined;
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- not part of the verify body
		const { clientExtensionResults, ...response } = assertion;
		const verified = (await authClient.$fetch('/passkey/verify-authentication', {
			method: 'POST',
			body: { response },
			throw: false
		})) as FetchResult<unknown>;
		if (verified.error) return { ok: false, cancelled: false, error: verified.error };
		return { ok: true };
	}

	return {
		/** Fetches the options now, so a later tap does not wait on the network. */
		prefetch: () => options().then(() => undefined),
		signIn
	};
}
