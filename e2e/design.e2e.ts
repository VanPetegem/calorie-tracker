import { expect, test } from '@playwright/test';
import { componentNames } from '../src/lib/components/ui/names';

test('/design has a section heading for every component', async ({ page }) => {
	await page.goto('/design');
	for (const name of componentNames) {
		await expect(page.locator(`h2#${name}`), name).toBeVisible();
		await expect(page.locator(`h2#${name}`)).toHaveText(name);
	}
});

test('every visible button and radio is at least 44 px tall', async ({ page }) => {
	await page.goto('/design');
	const targets = page.locator('button:visible, [role="radio"]:visible');
	expect(await targets.count()).toBeGreaterThan(10);
	const heights = await targets.evaluateAll((els) =>
		els.map((el) => ({
			label: (el.textContent?.trim() || el.getAttribute('aria-label') || el.tagName).slice(0, 40),
			height: el.getBoundingClientRect().height
		}))
	);
	const tooSmall = heights.filter((h) => h.height < 44);
	expect(tooSmall).toEqual([]);
});

test('the theme control switches the theme and stores the preference', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/design');
	await page.getByRole('radio', { name: 'Light' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	expect(await page.evaluate(() => localStorage.getItem('kcal-theme'))).toBe('light');
	await page.getByRole('radio', { name: 'Dark' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the page does not scroll sideways', async ({ page }) => {
	await page.goto('/design');
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
});

test('NumberInput accepts a decimal comma on the page', async ({ page }) => {
	await page.goto('/design');
	const input = page.getByLabel('Body weight');
	await input.fill('72,5');
	await input.blur();
	await expect(page.getByText('Value: 72.5')).toBeVisible();
});
