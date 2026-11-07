import { expect, test } from '@playwright/test';

const labels = ['Today', 'Recipes', 'Weight', 'Settings'];

test.describe('phone', () => {
	test.skip(({ viewport }) => (viewport?.width ?? 0) >= 1024, 'phone layout only');

	test('tab bar is a labelled navigation at the bottom of the screen', async ({ page }) => {
		await page.goto('/');
		const nav = page.getByRole('navigation', { name: 'Primary' });
		await expect(nav).toBeVisible();
		const box = await nav.boundingBox();
		const viewport = page.viewportSize();
		expect(box).not.toBeNull();
		expect(Math.round(box!.y + box!.height)).toBe(viewport!.height);
	});

	test('every tab is at least 44 px tall and labelled', async ({ page }) => {
		await page.goto('/');
		const links = page.getByRole('navigation', { name: 'Primary' }).getByRole('link');
		await expect(links).toHaveText(labels);
		const heights = await links.evaluateAll((els) =>
			els.map((el) => el.getBoundingClientRect().height)
		);
		expect(heights).toHaveLength(4);
		for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
	});

	test('the bar pads its bottom by the safe-area inset so it clears the home indicator', async ({
		page
	}) => {
		await page.goto('/');
		const rule = await page.getByRole('navigation', { name: 'Primary' }).evaluate((el) => {
			const found: string[] = [];
			const walk = (rules: CSSRuleList) => {
				for (const r of Array.from(rules)) {
					if (r instanceof CSSStyleRule && el.matches(r.selectorText)) {
						found.push(r.style.getPropertyValue('padding-bottom'));
					} else if ('cssRules' in r) {
						walk((r as CSSGroupingRule).cssRules);
					}
				}
			};
			for (const sheet of Array.from(document.styleSheets)) walk(sheet.cssRules);
			return found.concat(el.getAttribute('style') ?? '').join(' | ');
		});
		expect(rule).toContain('safe-area-inset-bottom');
	});

	test('the viewport covers the notch area so the safe-area insets apply', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
			'content',
			/viewport-fit=cover/
		);
	});

	test('tapping Weight navigates and marks it as the current page', async ({ page }) => {
		await page.goto('/');
		const nav = page.getByRole('navigation', { name: 'Primary' });
		await expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
		await nav.getByRole('link', { name: 'Weight' }).tap();
		await expect(page).toHaveURL(/\/weight$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Weight' })).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Weight' })).toHaveAttribute('aria-current', 'page');
		await expect(nav.getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current');
	});

	test('the page content is not hidden behind the tab bar', async ({ page }) => {
		await page.goto('/settings');
		// Below the content there must be room for the 64 px bar (the inset adds more on a real device).
		const padding = await page
			.getByRole('main')
			.evaluate((el) => parseFloat(getComputedStyle(el.parentElement!).paddingBottom));
		expect(padding).toBeGreaterThanOrEqual(64);
	});
});

test.describe('desktop', () => {
	test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, 'desktop layout only');

	test('a sidebar replaces the tab bar', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		const nav = page.getByRole('navigation', { name: 'Primary' });
		await expect(nav).toBeVisible();
		await expect(page.getByRole('navigation')).toHaveCount(1);
		const box = await nav.boundingBox();
		expect(box!.x).toBe(0);
		expect(box!.height).toBeGreaterThan(600);
		await expect(nav.getByRole('link')).toHaveText(labels);
	});

	test('content is centered with a 640 px maximum width', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		const width = await page.getByRole('main').evaluate((el) => el.getBoundingClientRect().width);
		expect(width).toBeLessThanOrEqual(640);
	});

	test('the sidebar marks the current page and navigates', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		const nav = page.getByRole('navigation', { name: 'Primary' });
		await nav.getByRole('link', { name: 'Recipes' }).click();
		await expect(page).toHaveURL(/\/recipes$/);
		await expect(nav.getByRole('link', { name: 'Recipes' })).toHaveAttribute(
			'aria-current',
			'page'
		);
	});
});

test('the sidebar replaces the tab bar exactly at 1024 px', async ({ page }) => {
	await page.setViewportSize({ width: 1023, height: 800 });
	await page.goto('/');
	const nav = page.getByRole('navigation', { name: 'Primary' });
	expect((await nav.boundingBox())!.width).toBe(1023);
	await page.setViewportSize({ width: 1024, height: 800 });
	expect((await nav.boundingBox())!.width).toBeLessThan(300);
});

const pages = [
	{ path: '/', h1: 'Today', empty: 'Nothing logged yet' },
	// The recipes and weight e2e tests save into the shared database, so no empty state is expected on those pages. Their
	// empty states are covered by the page specs.
	{ path: '/recipes', h1: 'Recipes', empty: undefined },
	{ path: '/weight', h1: 'Weight', empty: undefined },
	{ path: '/settings', h1: 'Settings', empty: undefined }
];

for (const { path, h1, empty } of pages) {
	test(`${path} has an h1 "${h1}"${empty ? ' and an empty state' : ''}`, async ({ page }) => {
		await page.goto(path);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
		if (empty) await expect(page.getByRole('heading', { name: empty })).toBeVisible();
	});
}

test('settings links to the design system', async ({ page }) => {
	await page.goto('/settings');
	await page.getByRole('link', { name: /design system/i }).click();
	await expect(page).toHaveURL(/\/design$/);
});

test('the design page shows the shell components without a second Primary landmark', async ({
	page
}) => {
	await page.goto('/design');
	await expect(page.locator('h2#TabBar')).toBeVisible();
	await expect(page.locator('h2#Sidebar')).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(1);
	await expect(page.getByRole('navigation', { name: /^TabBar preview/ })).toHaveCount(2);
	await expect(page.getByRole('navigation', { name: /^Sidebar preview/ })).toHaveCount(1);
	await expect(
		page.getByRole('navigation', { name: 'TabBar preview, Weight active' }).getByRole('link', {
			name: 'Weight'
		})
	).toHaveAttribute('aria-current', 'page');
});

test('pages forbid being framed', async ({ page }) => {
	const response = await page.goto('/');
	expect(response?.headers()['x-frame-options']).toBe('DENY');
	expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
});
