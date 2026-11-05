import { beforeEach, describe, expect, it, vi } from 'vitest';

const $fetch = vi.fn();
const startAuthentication = vi.fn();

vi.mock('#lib/auth-client.ts', () => ({ authClient: { $fetch } }));
vi.mock('@simplewebauthn/browser', () => ({
	startAuthentication,
	WebAuthnError: class extends Error {
		code = 'ERROR_CEREMONY_ABORTED';
	}
}));

const { createPasskeySignIn } = await import('./passkey-sign-in.ts');

const OPTIONS = { challenge: 'c1', rpId: 'kcal.test' };
const ASSERTION = { id: 'cred', clientExtensionResults: {}, response: {} };

function serverAnswers() {
	$fetch.mockImplementation(async (path: string) =>
		path === '/passkey/generate-authenticate-options'
			? { data: OPTIONS, error: null }
			: { data: { session: {} }, error: null }
	);
}

const optionFetches = () =>
	$fetch.mock.calls.filter(([path]) => path === '/passkey/generate-authenticate-options').length;

beforeEach(() => {
	$fetch.mockReset();
	startAuthentication.mockReset();
	serverAnswers();
});

describe('createPasskeySignIn', () => {
	it('starts the ceremony with prefetched options, without a fetch in between', async () => {
		const passkey = createPasskeySignIn();
		await passkey.prefetch();
		startAuthentication.mockImplementation(async () => {
			// Only the prefetch ran before the ceremony: the tap's user activation is still there.
			expect(optionFetches()).toBe(1);
			return ASSERTION;
		});

		expect(await passkey.signIn()).toEqual({ ok: true });
		expect(startAuthentication).toHaveBeenCalledWith({
			optionsJSON: OPTIONS,
			useBrowserAutofill: false
		});
		expect($fetch).toHaveBeenCalledWith('/passkey/verify-authentication', {
			method: 'POST',
			body: { response: { id: 'cred', response: {} } },
			throw: false
		});
	});

	it('fetches new options after an attempt, since the server spends the challenge', async () => {
		const passkey = createPasskeySignIn();
		startAuthentication.mockResolvedValue(ASSERTION);
		await passkey.signIn();
		await passkey.signIn();
		expect(optionFetches()).toBe(2);
	});

	it('fetches new options once the cached ones are close to expiring', async () => {
		let now = 0;
		const passkey = createPasskeySignIn(() => now);
		await passkey.prefetch();
		await passkey.prefetch();
		expect(optionFetches()).toBe(1);
		now = 4 * 60 * 1000 + 1;
		await passkey.prefetch();
		expect(optionFetches()).toBe(2);
	});

	it('reports a cancelled ceremony', async () => {
		const passkey = createPasskeySignIn();
		startAuthentication.mockRejectedValue(new Error('NotAllowedError'));
		const result = await passkey.signIn();
		expect(result).toMatchObject({ ok: false, cancelled: true, error: { status: 400 } });
	});

	it('passes a failed verification through', async () => {
		const passkey = createPasskeySignIn();
		startAuthentication.mockResolvedValue(ASSERTION);
		$fetch.mockImplementation(async (path: string) =>
			path === '/passkey/generate-authenticate-options'
				? { data: OPTIONS, error: null }
				: { data: null, error: { status: 429, message: 'slow down' } }
		);
		expect(await passkey.signIn()).toEqual({
			ok: false,
			cancelled: false,
			error: { status: 429, message: 'slow down' }
		});
	});

	it('uses browser autofill when asked', async () => {
		const passkey = createPasskeySignIn();
		startAuthentication.mockResolvedValue(ASSERTION);
		await passkey.signIn({ autofill: true });
		expect(startAuthentication).toHaveBeenCalledWith({
			optionsJSON: OPTIONS,
			useBrowserAutofill: true
		});
	});
});
