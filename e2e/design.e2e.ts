import { expect, test } from '@playwright/test';
import { componentNames } from '../src/lib/components/ui/names';
import { gotoHydrated } from './helpers';

test('/design has a section heading for every component', async ({ page }) => {
	await gotoHydrated(page, '/design');
	for (const name of componentNames) {
		await expect(page.locator(`h2#${name}`), name).toBeVisible();
		await expect(page.locator(`h2#${name}`)).toHaveText(name);
	}
});

test('every visible button and radio is at least 44 px tall', async ({ page }) => {
	await gotoHydrated(page, '/design');
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
	await gotoHydrated(page, '/design');
	await page.getByRole('radio', { name: 'Light' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	expect(await page.evaluate(() => localStorage.getItem('kcal-theme'))).toBe('light');
	await page.getByRole('radio', { name: 'Dark' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the page does not scroll sideways', async ({ page }) => {
	await gotoHydrated(page, '/design');
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
});

test('NumberInput accepts a decimal comma on the page', async ({ page }) => {
	await gotoHydrated(page, '/design');
	const input = page.getByLabel('Body weight');
	await input.fill('72,5');
	await input.blur();
	await expect(page.getByText('Value: 72.5')).toBeVisible();
});

test('Sheet opens, closes on Escape and returns focus to its trigger', async ({ page }) => {
	await gotoHydrated(page, '/design');
	const trigger = page.getByRole('button', { name: 'Open confirmation' });
	// Open from the keyboard: Safari does not focus a button on click, so only a focused opener can get focus back.
	await trigger.focus();
	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog', { name: 'Delete this entry?' });
	await expect(dialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(trigger).toBeFocused();
});

test('Sheet closes when the backdrop is clicked', async ({ page }) => {
	await gotoHydrated(page, '/design');
	await page.getByRole('button', { name: 'Open confirmation' }).click();
	const dialog = page.getByRole('dialog', { name: 'Delete this entry?' });
	await expect(dialog).toBeVisible();
	await page.mouse.click(4, 4);
	await expect(dialog).toBeHidden();
});

test('Sheet is a bottom sheet on a phone and a centered dialog on a wide screen', async ({
	page
}) => {
	await gotoHydrated(page, '/design');
	await page.getByRole('button', { name: 'Open confirmation' }).click();
	const dialog = page.getByRole('dialog', { name: 'Delete this entry?' });
	await expect(dialog).toBeVisible();
	await expect(dialog).toHaveCSS('transform', 'none');
	await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');
	const box = (await dialog.boundingBox())!;
	const viewport = page.viewportSize()!;
	if (viewport.width < 640) {
		expect(box.width).toBeCloseTo(viewport.width, 0);
		expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
	} else {
		expect(box.width).toBeLessThanOrEqual(480);
		expect(box.x + box.width / 2).toBeCloseTo(viewport.width / 2, 0);
	}
});

test('deleting a meal offers Undo, which restores it', async ({ page }) => {
	await gotoHydrated(page, '/design');
	await page.getByRole('button', { name: 'Delete Protein shake' }).click();
	await expect(page.getByText('Deleted Protein shake')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Delete Protein shake' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByRole('button', { name: 'Delete Protein shake' })).toBeVisible();
	await expect(page.getByText('Deleted Protein shake')).toBeHidden();
});
