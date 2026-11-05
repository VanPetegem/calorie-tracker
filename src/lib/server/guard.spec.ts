import { describe, expect, it } from 'vitest';
import { decideAccess, safeRedirect } from './guard.ts';

type Input = Parameters<typeof decideAccess>[0];

/** A browser page navigation without a session. */
const navigation = (pathname: string, search = ''): Input => ({
	pathname,
	search,
	method: 'GET',
	accept: 'text/html,application/xhtml+xml',
	secFetchMode: 'navigate',
	hasSession: false
});

/** A `fetch` from page code without a session. */
const fetchRequest = (pathname: string, method = 'GET'): Input => ({
	pathname,
	search: '',
	method,
	accept: 'application/json',
	secFetchMode: 'cors',
	hasSession: false
});

describe('decideAccess', () => {
	it.each([
		'/login',
		'/setup',
		'/setup/passkey',
		'/api/auth/sign-in/email',
		'/api/auth/passkey/generate-authenticate-options',
		'/_app/immutable/entry/start.js',
		'/_app/version.json',
		'/manifest.webmanifest',
		'/service-worker.js',
		'/favicon.ico',
		'/favicon.svg',
		'/robots.txt',
		'/pwa-192x192.png',
		'/apple-touch-icon-180x180.png',
		'/maskable-icon-512x512.png',
		'/icon.svg'
	])('allows the public path %s without a session', (pathname) => {
		expect(decideAccess(navigation(pathname))).toEqual({ kind: 'allow' });
		expect(decideAccess(fetchRequest(pathname))).toEqual({ kind: 'allow' });
	});

	it.each(['/setupx', '/loginx', '/api/authx', '/api/authx/sign-up/email', '/api/auth'])(
		'does not treat %s as public: prefixes only match whole path segments',
		(pathname) => {
			expect(decideAccess(fetchRequest(pathname))).toEqual({ kind: 'deny', status: 401 });
		}
	);

	it('does not treat SvelteKit remote function calls under /_app/remote/ as public', () => {
		expect(decideAccess(fetchRequest('/_app/remote/abc123/getEntries'))).toEqual({
			kind: 'deny',
			status: 401
		});
	});

	it('redirects a navigation without a session to /login with the path to return to', () => {
		expect(decideAccess(navigation('/weight'))).toEqual({
			kind: 'redirect',
			location: '/login?redirectTo=%2Fweight'
		});
	});

	it('keeps the query string in redirectTo', () => {
		expect(decideAccess(navigation('/weight', '?x=1'))).toEqual({
			kind: 'redirect',
			location: '/login?redirectTo=%2Fweight%3Fx%3D1'
		});
	});

	it('treats a GET that accepts text/html as a navigation even without Sec-Fetch-Mode', () => {
		const input = { ...navigation('/'), secFetchMode: null, accept: 'text/html' };
		expect(decideAccess(input)).toEqual({ kind: 'redirect', location: '/login?redirectTo=%2F' });
	});

	it('treats a navigate mode GET as a navigation even without an Accept header', () => {
		const input = { ...navigation('/recipes'), accept: null };
		expect(decideAccess(input)).toEqual({
			kind: 'redirect',
			location: '/login?redirectTo=%2Frecipes'
		});
	});

	it('denies a POST without a session with 401, even from a form', () => {
		expect(decideAccess({ ...navigation('/weight'), method: 'POST' })).toEqual({
			kind: 'deny',
			status: 401
		});
	});

	it('denies a fetch without a session with 401', () => {
		expect(decideAccess(fetchRequest('/weight'))).toEqual({ kind: 'deny', status: 401 });
		expect(decideAccess(fetchRequest('/api/entries', 'DELETE'))).toEqual({
			kind: 'deny',
			status: 401
		});
	});

	it('denies a request without Accept or Sec-Fetch-Mode with 401', () => {
		const input = { ...fetchRequest('/settings'), accept: null, secFetchMode: null };
		expect(decideAccess(input)).toEqual({ kind: 'deny', status: 401 });
	});

	it('treats a SvelteKit data request (__data.json) as a navigation so the client follows it', () => {
		expect(decideAccess({ ...fetchRequest('/weight'), isDataRequest: true })).toEqual({
			kind: 'redirect',
			location: '/login?redirectTo=%2Fweight'
		});
	});

	it.each([navigation('/weight'), fetchRequest('/weight', 'POST'), fetchRequest('/_app/remote/x')])(
		'allows any request with a session',
		(input) => {
			expect(decideAccess({ ...input, hasSession: true })).toEqual({ kind: 'allow' });
		}
	);
});

describe('safeRedirect', () => {
	it('returns a same-origin relative path unchanged', () => {
		expect(safeRedirect('/weight')).toBe('/weight');
		expect(safeRedirect('/weight?x=1#top')).toBe('/weight?x=1#top');
	});

	it.each([
		'//evil.com',
		'/\\evil.com',
		'https://evil.com',
		'javascript:alert(1)',
		'evil.com',
		'',
		null
	])('returns / for %j', (target) => {
		expect(safeRedirect(target)).toBe('/');
	});

	it.each(['/\t/evil.com', '/\n/evil.com', '/%09/evil.com'])(
		'returns / when the URL parser would turn %j into another origin',
		(target) => {
			expect(new URL(safeRedirect(target), 'https://kcal.example').origin).toBe(
				'https://kcal.example'
			);
		}
	);
});
