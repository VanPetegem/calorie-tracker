import { describe, expect, it } from 'vitest';
import { isRateLimitedPath, rateLimitKey } from './rate-limit.ts';

describe('isRateLimitedPath', () => {
	it.each([
		'/login',
		'/setup',
		'/api/auth/sign-in/email',
		'/api/auth/sign-in/passkey',
		'/api/auth/sign-up/email',
		'/api/auth/passkey/verify-authentication'
	])('limits POST %s', (pathname) => {
		expect(isRateLimitedPath('POST', pathname)).toBe(true);
	});

	it.each(['/login', '/api/auth/sign-in/email', '/api/auth/passkey/verify-authentication'])(
		'does not limit GET %s',
		(pathname) => {
			expect(isRateLimitedPath('GET', pathname)).toBe(false);
		}
	);

	it.each([
		'/',
		'/weight',
		'/loginx',
		'/login/other',
		'/api/auth/sign-out',
		'/api/auth/get-session',
		'/api/auth/sign-inx',
		'/api/auth/passkey/generate-authenticate-options',
		'/api/auth/passkey/verify-registration'
	])('does not limit POST %s', (pathname) => {
		expect(isRateLimitedPath('POST', pathname)).toBe(false);
	});
});

describe('rateLimitKey', () => {
	it('uses the client IP Cloudflare reports', () => {
		expect(rateLimitKey(new Headers({ 'cf-connecting-ip': '203.0.113.7' }))).toBe('203.0.113.7');
	});

	it('falls back to one shared key without it, so requests are still counted', () => {
		expect(rateLimitKey(new Headers())).toBe('unknown');
	});
});
