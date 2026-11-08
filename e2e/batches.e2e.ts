import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { gotoHydrated } from './helpers.ts';

/*
 * Batch pages, created through the UI (the SQL seed belongs to log-batches.e2e.ts and is not used here). Every test
 * makes its own batches under a name with the project, the retry and a timestamp, so it passes alone and on a retry.
 * Tests that log use a day of their own, 2020-07-10 to 2020-07-25, which no other e2e file uses; the batches stay
 * out of other files' add sheets because each test finishes the batches it logged on.
 */

const nav = (page: Page) => page.getByRole('navigation', { name: 'Primary' });

/** The open sheet. The dialog is renamed by each step, so a test holds the element. */
const openSheet = (page: Page) => page.locator('[data-sheet][data-open]');

const unique = (label: string, testInfo: TestInfo) =>
	`${label} ${testInfo.project.name} ${testInfo.retry} ${Date.now()}`;

/** `slot` picks the test, then one day per retry and per browser project. */
function logDate(testInfo: TestInfo, slot: number): string {
	const project = testInfo.project.name.startsWith('chromium') ? 0 : 1;
	return `2020-07-${String(10 + (slot * 2 + testInfo.retry) * 2 + project)}`;
}

/** The one input with this label (the batch form and the container form both have a Name). */
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

/** Adds `grams` of the first BLV chicken the library finds. Returns the kcal the amount step promised. */
async function addChicken(page: Page, grams: number): Promise<number> {
	await page.getByRole('button', { name: 'Add ingredient' }).click();
	const sheet = openSheet(page);
	await sheet.getByRole('searchbox', { name: 'Search foods' }).fill('poulet');
	await sheet.getByRole('region', { name: 'Your foods' }).getByRole('button').first().click();
	await sheet.getByRole('radio', { name: 'g', exact: true }).click();
	await sheet.getByLabel('Amount').fill(String(grams));
	const preview = await sheet.getByTestId('preview-kcal').innerText();
	await sheet.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(sheet).toBeHidden();
	return Number(/(\d+)/.exec(preview)![1]);
}

/** A recipe of 200 g chicken in `portions` portions, saved. Returns the kcal of the chicken. */
async function createRecipe(page: Page, name: string, portions: number): Promise<number> {
	await gotoHydrated(page, '/recipes/new');
	await field(page, 'Name').fill(name);
	await field(page, 'Portions').fill(String(portions));
	const kcal = await addChicken(page, 200);
	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
	await expect(page.getByText('Recipe saved')).toBeVisible();
	return kcal;
}

/** A one off batch of 200 g chicken, without a cooked weight, saved. Leaves the page on the batch. Returns its kcal. */
async function createOneOff(page: Page, name: string, portions: number): Promise<number> {
	await gotoHydrated(page, '/recipes/batches/new');
	await field(page, 'Name').fill(name);
	await field(page, 'Portions').fill(String(portions));
	const kcal = await addChicken(page, 200);
	await page.getByRole('button', { name: 'Save batch' }).click();
	await expect(page).toHaveURL(/\/recipes\/batches\/[0-9a-f-]{36}$/);
	await expect(page.getByText('Batch saved')).toBeVisible();
	return kcal;
}

async function openAddSheet(page: Page) {
	const phone = (page.viewportSize()?.width ?? 0) < 1024;
	await nav(page)
		.getByRole('button', { name: phone ? 'Add food' : /^Add food/ })
		.click();
	await expect(page.getByRole('dialog', { name: 'Add food' })).toBeVisible();
	return openSheet(page);
}

/** Finishes the batch at `url`, so it does not sit in other files' add sheets. */
async function finish(page: Page, url: string) {
	await gotoHydrated(page, url);
	await page.getByRole('button', { name: 'Finish' }).click();
	await expect(page.getByText('Batch finished')).toBeVisible();
}

/** The number in "123 kcal". */
const kcalOf = (text: string) => Number(/(\d+)/.exec(text)![1]);

/** Day pages show the day's total as "kcal remaining, 750 of ..." (or "kcal, 750 of ..." when over the target). */
const heroTotal = (page: Page, kcal: number) =>
	page.getByText(new RegExp(`kcal( remaining)?, ${kcal} of`));

test('cooks a batch from a recipe with a new container and gross weight, logs portions and grams, and the days match', async ({
	page
}, testInfo) => {
	const name = unique('Stew', testInfo);
	const container = unique('Pot', testInfo);
	const chicken = await createRecipe(page, name, 4);

	// Cook batch opens the new batch page, prefilled from the recipe.
	await page.getByRole('link', { name: 'Cook batch' }).click();
	await expect(page).toHaveURL(/\/recipes\/batches\/new\?recipe=[0-9a-f-]{36}$/);
	await expect(page.getByRole('heading', { level: 1, name: 'New batch' })).toBeVisible();
	await expect(field(page, 'Name')).toHaveValue(name);
	await expect(field(page, 'Portions')).toHaveValue('4');
	await expect(field(page, 'Cooked on')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
	await expect(page.getByTestId('total-kcal')).toHaveText(`${chicken} kcal`);

	// A container made inline, then the gross weight: 1850 g on the scale in a 650 g pot is 1200 g net.
	await page.getByRole('button', { name: 'New container' }).click();
	await field(page, 'Name').last().fill(container);
	await field(page, 'Weight of the empty container').fill('650');
	await page.getByRole('button', { name: 'Save container' }).click();
	await expect(field(page, 'Container')).toHaveText(new RegExp(container));
	await field(page, 'Weight on the scale').fill('1850');
	await expect(page.getByText('Net weight 1200 g')).toBeVisible();
	await page.getByRole('button', { name: 'Save batch' }).click();
	await expect(page).toHaveURL(/\/recipes\/batches\/[0-9a-f-]{36}$/);
	await expect(page.getByText('Batch saved')).toBeVisible();
	const batchUrl = new URL(page.url()).pathname;

	// The header of the stored batch: 4 portions, a portion is a quarter of the chicken, per 100 g of 1200 g.
	await expect(page.getByTestId('portions-left')).toHaveText('4 of 4 portions left');
	expect(
		Math.abs(kcalOf(await page.getByTestId('header-per-portion').innerText()) - chicken / 4)
	).toBeLessThanOrEqual(1);
	expect(
		Math.abs(kcalOf(await page.getByTestId('header-per-100g').innerText()) - chicken / 12)
	).toBeLessThanOrEqual(1);
	await expect(field(page, 'Cooked weight')).toHaveValue('1200');

	// Log opens the add sheet at this batch's amount step (nothing is logged from here).
	await page.getByRole('button', { name: 'Log', exact: true }).click();
	const logSheet = openSheet(page);
	await expect(logSheet.getByLabel('Amount')).toHaveValue('1');
	await expect(logSheet.getByRole('radio', { name: 'portion' })).toBeChecked();
	await page.keyboard.press('Escape');
	await expect(logSheet).toBeHidden();

	// 1.5 portions on a day of its own: the preview, the entry and the day total agree.
	await gotoHydrated(page, `/day/${logDate(testInfo, 0)}`);
	const sheet = await openAddSheet(page);
	const row = sheet.getByRole('button', { name: new RegExp(name) });
	await expect(row).toContainText('4 of 4 portions left');
	await row.click();
	await sheet.getByLabel('Amount').fill('1,5');
	const portionKcal = kcalOf(await sheet.getByTestId('preview-kcal').innerText());
	expect(Math.abs(portionKcal - (chicken * 1.5) / 4)).toBeLessThanOrEqual(1);
	await sheet.getByRole('button', { name: 'Log' }).click();
	await expect(sheet).toBeHidden();
	await page.reload();
	await page.waitForLoadState('networkidle');
	const entry = page.getByRole('button', { name: new RegExp(`^${name}`) });
	await expect(entry).toContainText('1.5 portions');
	await expect(entry).toContainText(`${portionKcal} kcal`);
	await expect(heroTotal(page, portionKcal)).toBeVisible();

	// 200 g of the weighed batch on another day: a sixth of 1200 g.
	await gotoHydrated(page, `/day/${logDate(testInfo, 1)}`);
	const gramSheet = await openAddSheet(page);
	await gramSheet.getByRole('button', { name: new RegExp(name) }).click();
	await gramSheet.getByRole('radio', { name: 'g', exact: true }).click();
	await gramSheet.getByLabel('Amount').fill('200');
	const gramKcal = kcalOf(await gramSheet.getByTestId('preview-kcal').innerText());
	expect(Math.abs(gramKcal - chicken / 6)).toBeLessThanOrEqual(1);
	await gramSheet.getByRole('button', { name: 'Log' }).click();
	await expect(gramSheet).toBeHidden();
	await page.reload();
	await page.waitForLoadState('networkidle');
	const gramEntry = page.getByRole('button', { name: new RegExp(`^${name}`) });
	await expect(gramEntry).toContainText('200 g');
	await expect(gramEntry).toContainText(`${gramKcal} kcal`);
	await expect(heroTotal(page, gramKcal)).toBeVisible();

	// A logged batch can be finished, not deleted.
	await gotoHydrated(page, batchUrl);
	await expect(page.getByTestId('portions-left')).toContainText('of 4 portions left');
	const remove = page.getByRole('button', { name: 'Delete', exact: true });
	await expect(remove).toHaveAttribute('aria-disabled', 'true');
	await expect(remove).toHaveAccessibleDescription('Logged batches can be finished, not deleted');

	await finish(page, batchUrl);
});

test('finishing hides a batch from the add sheet and lists it under Finished, and Reopen brings it back', async ({
	page
}, testInfo) => {
	const name = unique('Finish me', testInfo);
	const day = `/day/${logDate(testInfo, 2)}`;

	// New batch on the Recipes tab opens an empty one off batch.
	await gotoHydrated(page, '/recipes');
	await page
		.getByRole('region', { name: 'Active batches' })
		.getByRole('link', { name: 'New batch' })
		.click();
	await expect(page).toHaveURL(/\/recipes\/batches\/new$/);
	await field(page, 'Name').fill(name);
	await addChicken(page, 200);
	await page.getByRole('button', { name: 'Save batch' }).click();
	await expect(page).toHaveURL(/\/recipes\/batches\/[0-9a-f-]{36}$/);
	const batchUrl = new URL(page.url()).pathname;

	await gotoHydrated(page, day);
	const before = await openAddSheet(page);
	await expect(before.getByRole('button', { name: new RegExp(name) })).toBeVisible();
	await page.keyboard.press('Escape');

	await gotoHydrated(page, batchUrl);
	await page.getByRole('button', { name: 'Finish' }).click();
	await expect(page.getByText('Batch finished')).toBeVisible();
	await expect(page.getByText('Finished', { exact: true })).toBeVisible();

	await gotoHydrated(page, day);
	const after = await openAddSheet(page);
	await expect(after.getByRole('button', { name: /^Quick add/ })).toBeVisible();
	await expect(after.getByRole('button', { name: new RegExp(name) })).toHaveCount(0);
	await page.keyboard.press('Escape');

	// Under Finished on the Recipes tab, collapsed until opened; not under Active batches.
	await gotoHydrated(page, '/recipes');
	await expect(
		page
			.getByRole('region', { name: 'Active batches' })
			.getByRole('link', { name: new RegExp(name) })
	).toHaveCount(0);
	await page.getByText('Finished', { exact: true }).click();
	const finishedRow = page.getByRole('listitem').filter({ hasText: name });
	await expect(finishedRow).toBeVisible();
	await finishedRow.getByRole('button', { name: 'Reopen' }).click();
	await expect(page.getByText(`Reopened ${name}`)).toBeVisible();
	await expect(
		page
			.getByRole('region', { name: 'Active batches' })
			.getByRole('link', { name: new RegExp(name) })
	).toBeVisible();

	await gotoHydrated(page, day);
	const again = await openAddSheet(page);
	await expect(again.getByRole('button', { name: new RegExp(name) })).toBeVisible();
	await page.keyboard.press('Escape');

	await finish(page, batchUrl);
});

test('a one off batch without a cooked weight logs by portion only, and its portions can be edited', async ({
	page
}, testInfo) => {
	const name = unique('One off', testInfo);
	const chicken = await createOneOff(page, name, 2);

	// Changing the portions and saving again updates the header (one portion is now a quarter).
	await expect(page.getByTestId('portions-left')).toHaveText('2 of 2 portions left');
	await field(page, 'Portions').fill('4');
	await page.getByRole('button', { name: 'Save batch' }).click();
	await expect(page.getByTestId('portions-left')).toHaveText('4 of 4 portions left');
	expect(
		Math.abs(kcalOf(await page.getByTestId('header-per-portion').innerText()) - chicken / 4)
	).toBeLessThanOrEqual(1);
	// No cooked weight: no per 100 g.
	await expect(page.getByTestId('header-per-100g')).toHaveCount(0);
	const batchUrl = new URL(page.url()).pathname;

	await gotoHydrated(page, `/day/${logDate(testInfo, 3)}`);
	const sheet = await openAddSheet(page);
	await sheet.getByRole('button', { name: new RegExp(name) }).click();
	await expect(sheet.getByRole('radio', { name: 'g', exact: true })).toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(sheet.getByText('Add the cooked weight to log grams')).toBeVisible();
	await sheet.getByRole('button', { name: 'Log' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toContainText(
		'1 portion'
	);

	await finish(page, batchUrl);
});

test('a batch nobody logged can be deleted', async ({ page }, testInfo) => {
	const name = unique('Delete me', testInfo);
	await createOneOff(page, name, 2);
	const remove = page.getByRole('button', { name: 'Delete', exact: true });
	await expect(remove).not.toHaveAttribute('aria-disabled', 'true');
	await remove.click();
	const ask = page.getByRole('dialog', { name: 'Delete this batch?' });
	await ask.getByRole('button', { name: 'Keep it' }).click();
	await expect(ask).toBeHidden();
	await expect(page).toHaveURL(/\/recipes\/batches\/[0-9a-f-]{36}$/);

	// The page of the deleted batch must never reload into its 404 on the way out.
	await page.evaluate(() => {
		const seen = { notFound: false };
		Object.assign(window, { seen });
		new MutationObserver(() => {
			if (document.body.textContent?.includes('Batch not found')) seen.notFound = true;
		}).observe(document.body, { childList: true, subtree: true, characterData: true });
	});
	await remove.click();
	await ask.getByRole('button', { name: 'Delete' }).click();
	await expect(page).toHaveURL(/\/recipes$/);
	await expect(page.getByText(`Deleted ${name}`)).toBeVisible();
	await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);
	await expect(page.getByText('Batch not found')).toHaveCount(0);
	expect(
		await page.evaluate(() => (window as unknown as { seen: { notFound: boolean } }).seen.notFound)
	).toBe(false);
});

test('navigating away from a batch with an unsaved change asks first', async ({
	page
}, testInfo) => {
	await createOneOff(page, unique('Guarded batch', testInfo), 2);
	const batchUrl = new URL(page.url()).pathname;

	// Nothing changed since the save: leaving is free.
	await nav(page).getByRole('link', { name: 'Weight' }).click();
	await expect(page).toHaveURL(/\/weight$/);
	await gotoHydrated(page, batchUrl);

	await field(page, 'Portions').fill('9');
	await nav(page).getByRole('link', { name: 'Weight' }).click();
	const ask = page.getByRole('dialog', { name: 'Discard changes?' });
	await expect(ask).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`${batchUrl}$`));
	await ask.getByRole('button', { name: 'Keep editing' }).click();
	await expect(ask).toBeHidden();
	await expect(field(page, 'Portions')).toHaveValue('9');

	await nav(page).getByRole('link', { name: 'Weight' }).click();
	await page
		.getByRole('dialog', { name: 'Discard changes?' })
		.getByRole('button', { name: 'Discard', exact: true })
		.click();
	await expect(page).toHaveURL(/\/weight$/);

	await finish(page, batchUrl);
});

test('Settings renames and deletes a container', async ({ page }, testInfo) => {
	const name = unique('Casserole', testInfo);
	const renamed = unique('Dutch oven', testInfo);

	// A container made on the new batch page exists at once, without saving the batch.
	await gotoHydrated(page, '/recipes/batches/new');
	await page.getByRole('button', { name: 'New container' }).click();
	await field(page, 'Name').last().fill(name);
	await field(page, 'Weight of the empty container').fill('1200');
	await page.getByRole('button', { name: 'Save container' }).click();
	await expect(field(page, 'Container')).toHaveText(new RegExp(name));
	// The save refreshes the page's data; leaving while that runs can fail the next goto as interrupted.
	await page.waitForLoadState('networkidle');

	await gotoHydrated(page, '/settings');
	const section = page.getByRole('region', { name: 'Containers' });
	await expect(section.getByRole('listitem').filter({ hasText: name })).toContainText('1200 g');

	await section.getByRole('button', { name: `Edit ${name}` }).click();
	const sheet = openSheet(page);
	await sheet.getByLabel('Name', { exact: true }).fill(renamed);
	await sheet.getByLabel('Weight of the empty container').fill('4200');
	await sheet.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(sheet).toBeHidden();
	const row = section.getByRole('listitem').filter({ hasText: renamed });
	await expect(row).toContainText('4200 g');
	await expect(section.getByText(name, { exact: true })).toHaveCount(0);

	await section.getByRole('button', { name: `Delete ${renamed}` }).click();
	await openSheet(page).getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(section.getByText(renamed)).toHaveCount(0);

	// A reload keeps it deleted.
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('region', { name: 'Containers' }).getByText(renamed)).toHaveCount(0);
});

test('an unknown recipe or batch is a 404', async ({ page }) => {
	const unknown = '019a5b2e-8f3c-7d4a-9b1e-2c3d4e5f6a7b';
	const recipe = await page.goto(`/recipes/batches/new?recipe=${unknown}`);
	expect(recipe?.status()).toBe(404);
	const batch = await page.goto(`/recipes/batches/${unknown}`);
	expect(batch?.status()).toBe(404);
});
