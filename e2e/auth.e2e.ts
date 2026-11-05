import { expect, test } from './fixtures.ts';
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

	test('sign in attempts are throttled per client: the API answers 429, the form says so', async ({
		page,
		request
	}) => {
		// AUTH_LIMITER allows 10 attempts a minute for this test's client IP (see fixtures.ts).
		const attempt = () =>
			request.post('/api/auth/sign-in/email', {
				data: { email: TEST_USER.email, password: 'not-the-right-password' }
			});
		for (let i = 0; i < 10; i++) expect((await attempt()).status()).not.toBe(429);
		const limited = await attempt();
		expect(limited.status()).toBe(429);
		expect((await limited.json()).code).toBe('TOO_MANY_REQUESTS');

		// Even the right password is refused now, through the form action as well.
		await page.goto('/login');
		await signInWithPassword(page);
		await expect(page.getByRole('alert')).toHaveText(
			'Too many attempts. Wait a minute, then try again.'
		);
		await expect(page).toHaveURL(/\/login/);
	});

	test('login pads its content for the status bar and home indicator', async ({ page }) => {
		await page.goto('/login');
		const padding = await page
			.getByRole('main')
			.evaluate((el) => getComputedStyle(el.parentElement!).paddingTop);
		// 48 px plus the inset, which is 0 outside a real notched device.
		expect(padding).toBe('48px');
	});
});

test.describe('adding a passkey with an old session', () => {
	// "Sign in again" signs out, so this test uses its own session. The mocked response below must not be
	// bypassed by the service worker (WebKit routes a controlled page's fetches through it).
	test.use({ storageState: loggedOut, serviceWorkers: 'block' });

	test('explains the fresh sign in it needs and comes back after it', async ({ page }) => {
		await page.goto('/settings/security');
		await signInWithPassword(page);
		await expect(page).toHaveURL('/settings/security');
		await page.waitForLoadState('networkidle');

		// What Better Auth answers when the session was created more than a day ago.
		await page.route('**/api/auth/passkey/generate-register-options*', (route) =>
			route.fulfill({
				status: 403,
				contentType: 'application/json',
				body: JSON.stringify({ code: 'SESSION_NOT_FRESH', message: 'Session is not fresh' })
			})
		);
		await page.getByRole('button', { name: 'Add a passkey' }).click();
		await expect(page.getByRole('alert')).toContainText('To add a passkey, sign in again first.');
		await expect(page.getByText('Session is not fresh')).toHaveCount(0);

		await page.getByRole('button', { name: 'Sign in again' }).click();
		await expect(page).toHaveURL('/login?redirectTo=%2Fsettings%2Fsecurity');
		await signInWithPassword(page);
		await expect(page).toHaveURL('/settings/security');
		await expect(page.getByRole('heading', { level: 1, name: 'Security' })).toBeVisible();
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
