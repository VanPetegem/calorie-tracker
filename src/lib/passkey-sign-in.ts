import {
	browserSupportsWebAuthn,
	startAuthentication,
	WebAuthnAbortService,
	WebAuthnError,
	type AuthenticationResponseJSON,
	type PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/browser';
import { authClient } from '#lib/auth-client.ts';
import type { AuthClientError } from '#lib/auth-errors.ts';

/** The server keeps an authentication challenge for 5 minutes; fetch a new one a minute early. */
export const OPTIONS_TTL_MS = 4 * 60 * 1000;

type FetchResult<T> = { data: T | null; error: AuthClientError | null };
type Options = FetchResult<PublicKeyCredentialRequestOptionsJSON>;

/** A request that never got an answer (offline, dropped connection). */
const NETWORK_ERROR: AuthClientError = { code: 'NETWORK_ERROR', status: 0 };

export type PasskeySignInResult =
	| { ok: true }
	/**
	 * `options`: no challenge could be fetched. `cancelled`: the ceremony ended without a passkey (dismissed, or
	 * aborted by another ceremony). `verify`: a passkey was used and the server refused it.
	 */
	| { ok: false; reason: 'options' | 'cancelled' | 'verify'; error: AuthClientError };

/** `throw: false` still rejects on a network failure; turn that into an error result too. */
async function request<T>(path: string, init: Record<string, unknown>): Promise<FetchResult<T>> {
	try {
		return (await authClient.$fetch(path, { ...init, throw: false })) as FetchResult<T>;
	} catch {
		return { data: null, error: NETWORK_ERROR };
	}
}

/**
 * Passkey sign in with the challenge fetched ahead of the tap. Better Auth's `signIn.passkey` fetches the
 * options first and only then calls WebAuthn; iOS Safari can drop the tap's user activation across that fetch
 * and refuse the ceremony. Here the tap goes straight to `navigator.credentials.get`, as long as the page keeps
 * the options fresh (`isStale`, then `prefetch`).
 *
 * The server holds one challenge per browser (a cookie), so the autofill and the button share the cached
 * options: starting one ceremony aborts the other, and only one ever verifies. Any attempt spends the cache.
 */
export function createPasskeySignIn(now = () => Date.now()) {
	let cached: { at: number; options: Promise<Options> } | undefined;

	const isStale = () => !cached || now() - cached.at > OPTIONS_TTL_MS;

	function options(): Promise<Options> {
		if (!cached || isStale()) {
			const fetched: Promise<Options> = request<PublicKeyCredentialRequestOptionsJSON>(
				'/passkey/generate-authenticate-options',
				{ method: 'GET' }
			).then((result) => {
				// Forget a failed fetch so the next refresh or attempt retries it.
				if (!result.data && cached?.options === fetched) cached = undefined;
				return result;
			});
			cached = { at: now(), options: fetched };
		}
		return cached.options;
	}

	async function signIn({ autofill = false } = {}): Promise<PasskeySignInResult> {
		// Some iOS browsers (Firefox) may not offer WebAuthn at all: say so instead of a generic failure.
		if (!browserSupportsWebAuthn()) {
			return { ok: false, reason: 'cancelled', error: { code: 'NOT_SUPPORTED', status: 400 } };
		}
		const { data, error } = await options();
		if (!data) return { ok: false, reason: 'options', error: error ?? { status: 500 } };

		let assertion: AuthenticationResponseJSON;
		try {
			assertion = await startAuthentication({ optionsJSON: data, useBrowserAutofill: autofill });
		} catch (cause) {
			// Leave the options for the ceremony that aborted this one (the button aborts the autofill).
			// A browser error keeps its name (NotAllowedError, SecurityError), so the message can show it. The library
			// passes NotAllowedError through under a generic code, with the browser's name on the error itself.
			const code =
				cause instanceof WebAuthnError && cause.code !== 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY'
					? cause.code
					: cause instanceof Error && cause.name !== 'Error'
						? cause.name
						: 'AUTH_CANCELLED';
			return { ok: false, reason: 'cancelled', error: { code, status: 400 } };
		}

		cached = undefined;
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- not part of the verify body
		const { clientExtensionResults, ...response } = assertion;
		const verified = await request<unknown>('/passkey/verify-authentication', {
			method: 'POST',
			body: { response }
		});
		if (verified.error) return { ok: false, reason: 'verify', error: verified.error };
		return { ok: true };
	}

	return {
		/** True when a tap would have to fetch new options first. */
		isStale,
		/** Fetches the options now, so a later tap does not wait on the network. Never rejects. */
		prefetch: () => options().then(() => undefined),
		signIn,
		/** Aborts a pending ceremony, such as the autofill when the page goes away. */
		cancel: () => WebAuthnAbortService.cancelCeremony()
	};
}
