import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { gotoHydrated } from './helpers.ts';

/*
 * Logging batches from the add sheet. The batches come from e2e/seed.sql: one weighed stew per browser project
 * (4 portions, 2000 kcal, 1600 g: 500 kcal and 400 g a portion) and a one off without a cooked weight (2 portions,
 * 800 kcal). Each test logs on a past day of its own, so entries never meet.
 */

const isChromium = (projectName: string) => projectName.startsWith('chromium');

/** `slot` picks the day: two days per slot, one for each browser project. */
function logDate(projectName: string, slot: number): string {
	return `2020-05-${String(10 + slot * 2 + (isChromium(projectName) ? 0 : 1))}`;
}

const stewName = (projectName: string) =>
	isChromium(projectName) ? 'E2E stew chromium-desktop' : 'E2E stew webkit-iphone';

async function openAddSheet(page: Page) {
	const phone = (page.viewportSize()?.width ?? 0) < 1024;
	const nav = page.getByRole('navigation', { name: 'Primary' });
	await nav.getByRole('button', { name: phone ? 'Add food' : /^Add food/ }).click();
	await expect(page.getByRole('dialog', { name: 'Add food' })).toBeVisible();
	// The dialog is named after the chosen batch on the amount step, so the rest of a test holds the element.
	return page.locator('dialog[data-sheet][open]');
}

test('logs 1.5 portions of a batch, the day total matches, and the entry edits to 2 portions', async ({
	page
}, testInfo) => {
	const name = stewName(testInfo.project.name);
	await gotoHydrated(page, `/day/${logDate(testInfo.project.name, 0)}`);

	const sheet = await openAddSheet(page);
	// Batches sit above the quick actions and the search results while the field is empty.
	const row = sheet.getByRole('button', { name: new RegExp(name) });
	await expect(row).toContainText('4 of 4 portions left');
	await expect(row).toContainText('500 kcal');
	const quickAdd = sheet.getByRole('button', { name: 'Quick add' });
	expect((await row.boundingBox())!.y).toBeLessThan((await quickAdd.boundingBox())!.y);

	await row.click();
	await expect(sheet.getByLabel('Amount')).toHaveValue('1');
	await expect(sheet.getByRole('radio', { name: 'portion' })).toBeChecked();
	await sheet.getByLabel('Amount').fill('1,5');
	await expect(sheet.getByTestId('preview-kcal')).toHaveText('750 kcal');
	await sheet.getByRole('button', { name: 'Log' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText(`Logged ${name}`)).toBeVisible();

	// The entry row and the hero show what the preview promised, and a reload keeps it.
	await page.reload();
	await page.waitForLoadState('networkidle');
	const entry = page.getByRole('button', { name: new RegExp(`^${name}`) });
	await expect(entry).toContainText('1.5 portions');
	await expect(entry).toContainText('750 kcal');
	// With a target the hero reads "kcal remaining, 750 of ... eaten", without one it shows 750 and "kcal eaten".
	await expect(page.getByText(/^750$|kcal( remaining)?, 750 of/)).toBeVisible();

	// Tapping the entry opens the batch amount step in edit mode.
	await entry.click();
	const edit = page.locator('dialog[data-sheet][open]');
	await expect(edit.getByLabel('Amount')).toHaveValue('1.5');
	await expect(edit.getByTestId('preview-kcal')).toHaveText('750 kcal');
	await edit.getByLabel('Amount').fill('2');
	await expect(edit.getByTestId('preview-kcal')).toHaveText('1000 kcal');
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(edit).toBeHidden();
	await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toContainText(
		'2 portions'
	);
	await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toContainText(
		'1000 kcal'
	);

	// The batch lost 2 portions: 2 of 4 left, shown in the add sheet the next time.
	const again = await openAddSheet(page);
	await expect(again.getByRole('button', { name: new RegExp(name) })).toContainText(
		'2 of 4 portions left'
	);
});

test('logs 200 g of a weighed batch and keeps the quantity when switching units', async ({
	page
}, testInfo) => {
	const name = stewName(testInfo.project.name);
	await gotoHydrated(page, `/day/${logDate(testInfo.project.name, 1)}`);

	const sheet = await openAddSheet(page);
	await sheet.getByRole('button', { name: new RegExp(name) }).click();
	await sheet.getByLabel('Amount').fill('1,5');
	await sheet.getByRole('radio', { name: 'g', exact: true }).click();
	await expect(sheet.getByLabel('Amount')).toHaveValue('600');
	await sheet.getByLabel('Amount').fill('200');
	await expect(sheet.getByTestId('preview-kcal')).toHaveText('250 kcal');
	await sheet.getByRole('button', { name: 'Log' }).click();
	await expect(sheet).toBeHidden();

	const entry = page.getByRole('button', { name: new RegExp(`^${name}`) });
	await expect(entry).toContainText('200 g');
	await expect(entry).toContainText('250 kcal');

	// Editing converts grams to portions through the batch: 200 g is 0.5 portions of 400 g.
	await entry.click();
	const edit = page.locator('dialog[data-sheet][open]');
	await edit.getByRole('radio', { name: 'portion' }).click();
	await expect(edit.getByLabel('Amount')).toHaveValue('0.5');
	await edit.getByLabel('Amount').fill('1');
	await expect(edit.getByTestId('preview-kcal')).toHaveText('500 kcal');
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(edit).toBeHidden();
	await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toContainText(
		'1 portion'
	);
	await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toContainText(
		'500 kcal'
	);
});

test('a batch without a cooked weight logs by portion only, and so does its entry', async ({
	page
}, testInfo) => {
	await gotoHydrated(page, `/day/${logDate(testInfo.project.name, 2)}`);

	const sheet = await openAddSheet(page);
	await sheet.getByRole('button', { name: /E2E one off/ }).click();
	await expect(sheet.getByRole('radio', { name: 'g', exact: true })).toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(sheet.getByText('Add the cooked weight to log grams')).toBeVisible();
	await expect(sheet.getByTestId('preview-kcal')).toHaveText('400 kcal');
	await sheet.getByRole('button', { name: 'Log' }).click();
	await expect(sheet).toBeHidden();

	const entry = page.getByRole('button', { name: /^E2E one off/ });
	await expect(entry).toContainText('1 portion');
	await entry.click();
	const edit = page.locator('dialog[data-sheet][open]');
	await expect(edit.getByRole('radio', { name: 'g', exact: true })).toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(
		edit.getByText('This entry has no weight, so it changes in portions only')
	).toBeVisible();
	await edit.getByLabel('Amount').fill('2');
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(edit).toBeHidden();
	await expect(page.getByRole('button', { name: /^E2E one off/ })).toContainText('800 kcal');
});

test('typing in the search hides the batches', async ({ page }, testInfo) => {
	await gotoHydrated(page, `/day/${logDate(testInfo.project.name, 3)}`);
	const sheet = await openAddSheet(page);
	const batch = sheet.getByRole('button', { name: /E2E one off/ });
	await expect(batch).toBeVisible();
	await sheet.getByRole('searchbox', { name: 'Search foods' }).fill('poulet');
	await expect(batch).toBeHidden();
});
