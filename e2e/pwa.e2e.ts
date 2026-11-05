import { expect, test } from '@playwright/test';

test.describe('installable PWA', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'chromium only');

	test('the manifest declares a standalone app with 192 and 512 px icons', async ({ request }) => {
		const response = await request.get('/manifest.webmanifest');
		expect(response.ok()).toBe(true);
		const manifest = await response.json();
		expect(manifest.name).toBe('kcal');
		expect(manifest.display).toBe('standalone');
		expect(manifest.start_url).toBe('/');
		const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
		expect(sizes).toContain('192x192');
		expect(sizes).toContain('512x512');
		for (const icon of manifest.icons) {
			const png = await request.get(icon.src);
			expect(png.ok(), icon.src).toBe(true);
			expect(png.headers()['content-type']).toContain('image/png');
		}
	});

	test('the page links the manifest and an apple touch icon', async ({ page, request }) => {
		await page.goto('/');
		// SvelteKit writes asset links relative to the page, so compare the resolved URLs.
		const resolved = (selector: string) =>
			page.evaluate(
				(sel) => (document.querySelector(sel) as HTMLLinkElement | null)?.href,
				selector
			);
		expect(await resolved('link[rel=manifest]')).toMatch(/\/manifest\.webmanifest$/);
		const touch = await resolved('link[rel=apple-touch-icon]');
		expect(touch).toMatch(/apple-touch-icon-180x180\.png$/);
		expect((await request.get(touch!)).ok()).toBe(true);
		await expect(page.locator('meta[name=apple-mobile-web-app-capable]')).toHaveAttribute(
			'content',
			'yes'
		);
		await expect(page.locator('meta[name=apple-mobile-web-app-status-bar-style]')).toHaveAttribute(
			'content',
			'black-translucent'
		);
	});

	test('the app shell renders offline after one controlled visit', async ({ page, context }) => {
		await page.goto('/');
		await page.evaluate(() => navigator.serviceWorker.ready);
		// The first load is not controlled. Reload once so the worker sees, and caches, the navigation.
		await expect
			.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
			.toBe(true);
		await page.reload();
		await expect
			.poll(() =>
				page.evaluate(async () => {
					for (const name of await caches.keys()) {
						if (await (await caches.open(name)).match('/')) return true;
					}
					return false;
				})
			)
			.toBe(true);

		await context.setOffline(true);
		await page.reload();
		await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
		await context.setOffline(false);
	});

	test('a page visited online while controlled is available offline', async ({ page, context }) => {
		await page.goto('/');
		await page.evaluate(() => navigator.serviceWorker.ready);
		await expect
			.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
			.toBe(true);
		// `/weight` is not precached, so only the navigation handler can have stored it.
		await page.goto('/weight');
		await expect(page.getByRole('heading', { level: 1, name: 'Weight' })).toBeVisible();
		await expect
			.poll(() =>
				page.evaluate(async () => {
					for (const name of await caches.keys()) {
						if (await (await caches.open(name)).match('/weight')) return true;
					}
					return false;
				})
			)
			.toBe(true);

		await context.setOffline(true);
		await page.reload();
		await expect(page.getByRole('heading', { level: 1, name: 'Weight' })).toBeVisible();
		await context.setOffline(false);
	});

	test('a page never visited shows an offline notice, not the Today page', async ({
		page,
		context
	}) => {
		await page.goto('/');
		await page.evaluate(() => navigator.serviceWorker.ready);
		await expect
			.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
			.toBe(true);

		await context.setOffline(true);
		const response = await page.goto('/recipes');
		expect(response?.status()).toBe(503);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			'This page is unavailable offline'
		);
		await expect(page.getByRole('heading', { name: 'Today' })).toHaveCount(0);
		await context.setOffline(false);
	});

	test('the worker never caches api calls or non GET requests', async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => navigator.serviceWorker.ready);
		await expect
			.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
			.toBe(true);
		await page.evaluate(async () => {
			await fetch('/api/ping').catch(() => {});
			await fetch('/api/ping', { method: 'POST' }).catch(() => {});
		});
		const cached = await page.evaluate(async () => {
			const urls: string[] = [];
			for (const name of await caches.keys()) {
				for (const req of await (await caches.open(name)).keys()) {
					urls.push(new URL(req.url).pathname);
				}
			}
			return urls;
		});
		expect(cached.length).toBeGreaterThan(0);
		expect(cached.filter((path) => path.startsWith('/api/'))).toEqual([]);
	});
});

test.describe('installing while logged out', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'chromium only');
	test.use({ storageState: { cookies: [], origins: [] } });

	test('the worker still installs, and the redirect to /login is not cached as /', async ({
		page
	}) => {
		// At install the worker fetches `/`, which redirects a logged out visitor to /login.
		await page.goto('/login');
		await page.evaluate(() => navigator.serviceWorker.ready);
		await expect
			.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state))
			.toBe('activated');
		const homeCached = await page.evaluate(async () => {
			for (const name of await caches.keys()) {
				if (await (await caches.open(name)).match('/', { ignoreVary: true })) return true;
			}
			return false;
		});
		expect(homeCached).toBe(false);
	});
});
