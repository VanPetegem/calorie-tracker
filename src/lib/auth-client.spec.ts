import { describe, expect, it, vi } from 'vitest';

vi.mock('better-auth/client', () => ({ createAuthClient: () => ({}) }));
vi.mock('@better-auth/passkey/client', () => ({ passkeyClient: () => ({}) }));

const { deviceName } = await import('./auth-client.ts');

const MAC_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

describe('deviceName', () => {
	it('names a Mac without a touch screen "Mac"', () => {
		expect(deviceName(MAC_UA, 0)).toBe('Mac');
	});

	it('names an iPad that sends the desktop user agent "iPad"', () => {
		expect(deviceName(MAC_UA, 5)).toBe('iPad');
	});

	it('names an iPhone "iPhone"', () => {
		const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
		expect(deviceName(ua, 5)).toBe('iPhone');
	});
});
