import { expect, test, type Page } from '@playwright/test';

const bodyBackground = (page: Page) =>
	page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('follows the system color scheme', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	expect(await bodyBackground(page)).toBe('rgb(9, 9, 11)');

	await page.emulateMedia({ colorScheme: 'light' });
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	expect(await bodyBackground(page)).toBe('rgb(250, 250, 250)');
});

test('a stored preference beats the system scheme', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/');
	await page.evaluate(() => localStorage.setItem('kcal-theme', 'light'));
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	expect(await bodyBackground(page)).toBe('rgb(250, 250, 250)');
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#FAFAFA');
});

test('data-theme is set before first paint', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await page.addInitScript(() => {
		document.addEventListener('DOMContentLoaded', () => {
			(window as unknown as { __themeAtDcl: string | undefined }).__themeAtDcl =
				document.documentElement.dataset.theme;
		});
	});
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	const themeAtDcl = await page.evaluate(
		() => (window as unknown as { __themeAtDcl: string | undefined }).__themeAtDcl
	);
	expect(themeAtDcl).toBe('light');
});
