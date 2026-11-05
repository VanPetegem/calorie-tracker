import { expect, test } from '@playwright/test';
import { TEST_USER, gotoHydrated, loggedOut, signInWithPassword } from './helpers.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Paths of every entry in the app's service worker caches. */
function cachedPaths(page: import('@playwright/test').Page) {
	return page.evaluate(async () => {
		const paths: string[] = [];
		for (const name of await caches.keys()) {
			if (!name.startsWith('kcal-')) continue;
			for (const request of await (await caches.open(name)).keys()) {
				paths.push(new URL(request.url).pathname);
			}
		}
		return paths;
	});
}

test.describe('logged out', () => {
	test.use({ storageState: loggedOut });

	test('a page navigation is sent to /login with the page to return to', async ({ page }) => {
		await page.goto('/weight');
		await expect(page).toHaveURL('/login?redirectTo=%2Fweight');
		await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Sign in with passkey' })).toBeVisible();
	});

	test('the query string survives the trip through /login', async ({ page }) => {
		await page.goto('/weight?x=1');
		await expect(page).toHaveURL('/login?redirectTo=%2Fweight%3Fx%3D1');
	});

	test('signing in with the password returns to the page that was asked for', async ({ page }) => {
		await page.goto('/weight');
		await signInWithPassword(page);
		await expect(page).toHaveURL('/weight');
		await expect(page.getByRole('heading', { level: 1, name: 'Weight' })).toBeVisible();
	});

	test('a wrong password shows an error and stays on /login', async ({ page }) => {
		await gotoHydrated(page, '/login');
		await page.getByText('Use email and password instead').click();
		await page.getByLabel('Email').fill(TEST_USER.email);
		await page.getByLabel('Password').fill('not-the-right-password');
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await expect(page.getByRole('alert')).toHaveText('Email or password doesn’t match.');
		await expect(page).toHaveURL(/\/login/);
	});

	for (const target of ['//evil.com', '/\\evil.com', 'https://evil.com/']) {
		test(`redirectTo ${target} is ignored after sign in`, async ({ page }) => {
			await page.goto(`/login?redirectTo=${encodeURIComponent(target)}`);
			await signInWithPassword(page);
			await expect(page).toHaveURL('http://localhost:4173/');
			await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
		});
	}

	test('/setup redirects to /login once the account exists', async ({ page }) => {
		await page.goto('/setup');
		await expect(page).toHaveURL('/login');
	});

	test('a direct sign up request is rejected with 403 and the account still signs in', async ({
		request
	}) => {
		const signUp = await request.post('/api/auth/sign-up/email', {
			data: { name: 'X', email: 'x@example.com', password: 'another-long-password' }
		});
		expect(signUp.status()).toBe(403);
		// The user create hook, not some other check, produced the 403.
		expect((await signUp.json()).message).toBe('Sign up is closed');

		const intruder = await request.post('/api/auth/sign-in/email', {
			data: { email: 'x@example.com', password: 'another-long-password' }
		});
		expect(intruder.status()).toBe(401);

		const owner = await request.post('/api/auth/sign-in/email', {
			data: { email: TEST_USER.email, password: TEST_USER.password }
		});
		expect(owner.status()).toBe(200);
	});

	test('a request that is not a page navigation gets 401, not a redirect', async ({ request }) => {
		const json = await request.get('/settings', {
			headers: { accept: 'application/json' },
			maxRedirects: 0
		});
		expect(json.status()).toBe(401);

		// Same origin, so SvelteKit's own CSRF check lets it through to the guard.
		const post = await request.post('/weight', {
			form: { kg: '72' },
			headers: { origin: 'http://localhost:4173' },
			maxRedirects: 0
		});
		expect(post.status()).toBe(401);
	});

	test('a client side data request is told to go to /login', async ({ request }) => {
		const response = await request.get('/settings/security/__data.json');
		expect(response.status()).toBe(200);
		expect(await response.json()).toMatchObject({
			type: 'redirect',
			location: '/login?redirectTo=%2Fsettings%2Fsecurity'
		});
	});

	test('the public pages and app files load without a session', async ({ request }) => {
		for (const path of ['/login', '/manifest.webmanifest', '/service-worker.js']) {
			const response = await request.get(path, { maxRedirects: 0 });
			expect(response.status(), path).toBe(200);
		}
	});
});

test.describe('logged in', () => {
	test('the session cookie lasts at least 360 days', async ({ page, context }) => {
		await page.goto('/');
		const cookie = (await context.cookies()).find((c) => c.name.includes('session_token'));
		expect(cookie).toBeDefined();
		expect(cookie!.httpOnly).toBe(true);
		expect(cookie!.sameSite).toBe('Lax');
		expect(cookie!.expires * 1000).toBeGreaterThan(Date.now() + 360 * DAY_MS);
	});

	test('/login sends a signed in visitor on to the app', async ({ page }) => {
		await page.goto('/login?redirectTo=%2Frecipes');
		await expect(page).toHaveURL('/recipes');
	});
});

test.describe('sign out', () => {
	// Signing out revokes the session, so this test signs in on its own instead of using the shared one.
	test.use({ storageState: loggedOut });

	test('signing out from Settings ends the session and lands on /login', async ({ page }) => {
		await page.goto('/settings');
		await signInWithPassword(page);
		await expect(page).toHaveURL('/settings');
		await page.waitForLoadState('networkidle');

		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page).toHaveURL('/login');
		await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();

		// The session is gone on the server, not only in this browser.
		await page.goto('/settings');
		await expect(page).toHaveURL('/login?redirectTo=%2Fsettings');
	});

	test('signing out deletes the pages the service worker cached for the session', async ({
		page,
		browserName
	}) => {
		test.skip(browserName !== 'chromium', 'the service worker is checked in chromium');

		await page.goto('/settings');
		await signInWithPassword(page);
		await expect(page).toHaveURL('/settings');
		await page.evaluate(() => navigator.serviceWorker.ready);
		await expect
			.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
			.toBe(true);
		// A controlled navigation caches the signed in page.
		await page.reload();
		await expect.poll(() => cachedPaths(page)).toContain('/settings');

		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page).toHaveURL('/login');
		await page.waitForLoadState('networkidle');

		// The worker may cache /login and build files again right away; nothing from the session remains.
		const paths = await cachedPaths(page);
		expect(paths).not.toContain('/settings');
		expect(paths).not.toContain('/');
	});
});
