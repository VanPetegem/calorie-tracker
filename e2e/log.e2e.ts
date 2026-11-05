import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { gotoHydrated } from './helpers.ts';
import { seedQuickEntry } from './seed.ts';

/** A past day per browser project, so the two projects never see each other's entries. */
function seedDate(projectName: string): string {
	return projectName.startsWith('chromium') ? '2020-03-10' : '2020-03-11';
}

/** A day nobody logs on. */
const EMPTY_DATE = '2019-06-15';

/** A touch swipe: pointer events with `pointerType: 'touch'`, which Playwright cannot send on desktop Chromium. */
async function swipe(target: Locator, dx: number) {
	await target.evaluate((el, distance) => {
		const box = el.getBoundingClientRect();
		const y = box.top + box.height / 2;
		const x = box.left + box.width / 2;
		const fire = (type: string, clientX: number) =>
			el.dispatchEvent(
				new PointerEvent(type, {
					pointerType: 'touch',
					pointerId: 7,
					isPrimary: true,
					bubbles: true,
					cancelable: true,
					clientX,
					clientY: y
				})
			);
		fire('pointerdown', x);
		for (let step = 1; step <= 4; step++) fire('pointermove', x + (distance * step) / 4);
		fire('pointerup', x + distance);
	}, dx);
}

function dayAfter(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

test('a day without entries shows the empty state and the no target hero', async ({ page }) => {
	await gotoHydrated(page, `/day/${EMPTY_DATE}`);
	await expect(page.getByRole('heading', { name: 'Nothing logged yet' })).toBeVisible();
	await expect(page.getByText('kcal eaten', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: /^More actions/ })).toHaveCount(0);
});

test('invalid and too late dates are 404', async ({ page }) => {
	for (const date of ['2020-13-45', 'not-a-date', '2999-01-01']) {
		const response = await page.goto(`/day/${date}`);
		expect(response?.status(), date).toBe(404);
	}
});

test('deleting from the row menu removes the row on the server at once', async ({
	page
}, testInfo) => {
	const date = seedDate(testInfo.project.name);
	const label = `Porridge menu ${testInfo.retry} ${Date.now()}`;
	await seedQuickEntry(page, { date, label, kcal: 640, protein: 30, carbs: 70, fat: 20 });
	await gotoHydrated(page, `/day/${date}`);

	const row = page.getByRole('button', { name: new RegExp(`^${label}`) });
	await expect(row).toBeVisible();
	await page.getByRole('button', { name: `More actions for ${label}` }).click();
	await page.getByRole('dialog', { name: label }).getByRole('button', { name: 'Delete' }).click();

	await expect(page.getByText(`Deleted ${label}`)).toBeVisible();
	await expect(row).toHaveCount(0);

	// Deleted on the server at once: a reload does not bring it back.
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(row).toHaveCount(0);
});

test('Undo brings a deleted row back, and it stays after a reload', async ({ page }, testInfo) => {
	const date = seedDate(testInfo.project.name);
	const label = `Porridge undo ${testInfo.retry} ${Date.now()}`;
	await seedQuickEntry(page, { date, label, kcal: 410 });
	await gotoHydrated(page, `/day/${date}`);

	const row = page.getByRole('button', { name: new RegExp(`^${label}`) });
	await expect(row).toBeVisible();
	await page.getByRole('button', { name: `More actions for ${label}` }).click();
	await page.getByRole('dialog', { name: label }).getByRole('button', { name: 'Delete' }).click();
	await expect(row).toHaveCount(0);

	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(row).toBeVisible();
	await expect(page.getByText(`Deleted ${label}`)).toBeHidden();

	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(row).toBeVisible();
});

test('swiping a row left deletes it with Undo', async ({ page }, testInfo) => {
	const date = seedDate(testInfo.project.name);
	const label = `Porridge swipe ${testInfo.retry} ${Date.now()}`;
	await seedQuickEntry(page, { date, label, kcal: 300 });
	await gotoHydrated(page, `/day/${date}`);

	const row = page.getByRole('button', { name: new RegExp(`^${label}`) });
	await swipe(row, -120);
	await expect(page.getByText(`Deleted ${label}`)).toBeVisible();
	await expect(row).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(row).toBeVisible();
});

test('the arrows switch between days and the URL follows', async ({ page }) => {
	await gotoHydrated(page, '/');
	await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

	await page.getByRole('button', { name: 'Previous day' }).click();
	await expect(page).toHaveURL(/\/day\/\d{4}-\d{2}-\d{2}$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Yesterday' })).toBeVisible();
	const yesterday = new URL(page.url()).pathname.split('/').pop()!;

	await page.getByRole('button', { name: 'Next day' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

	// Today also lives at /, never at /day/<today>.
	await page.goto(`/day/${dayAfter(yesterday)}`);
	await expect(page).toHaveURL(/\/$/);
});

test('next stops at tomorrow and says why', async ({ page }) => {
	await gotoHydrated(page, '/');
	await page.getByRole('button', { name: 'Next day' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Tomorrow' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled();
	await expect(page.getByText('You can log up to tomorrow.')).toBeVisible();
	await page.getByRole('button', { name: 'Previous day' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
});

test('swiping the page right goes to the previous day and left comes back', async ({ page }) => {
	await gotoHydrated(page, '/');
	await swipe(page.getByRole('heading', { level: 1 }), 120);
	await expect(page.getByRole('heading', { level: 1, name: 'Yesterday' })).toBeVisible();
	await swipe(page.getByRole('heading', { level: 1 }), -120);
	await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
});

// Add sheet. Foods come from the migrated BLV library; Open Food Facts answers from e2e/off-stub.mjs.
//
// The OFF search limiter (8 a minute, one shared key) is shared by the whole run and both browser projects, so
// only two tests search OFF: one success and one outage. That is 4 searches per run (8 with a CI retry), which
// stays within the limit. Do not add a third OFF search test without keying the limiter per client.

/** The day this project's add sheet tests log on, apart from the seeded days above. */
function foodDate(projectName: string): string {
	return projectName.startsWith('chromium') ? '2020-04-10' : '2020-04-11';
}

async function openAddSheet(page: import('@playwright/test').Page) {
	const phone = (page.viewportSize()?.width ?? 0) < 1024;
	const nav = page.getByRole('navigation', { name: 'Primary' });
	await nav.getByRole('button', { name: phone ? 'Add food' : /^Add food/ }).click();
	await expect(page.getByRole('dialog', { name: 'Add food' })).toBeVisible();
	// The dialog is named after the chosen food on the amount step, so the rest of a test holds the element.
	return page.locator('dialog[data-sheet][open]');
}

test('searching the library finds a BLV food, logs 200 g, and the entry can be edited', async ({
	page
}, testInfo) => {
	const date = foodDate(testInfo.project.name);
	await gotoHydrated(page, `/day/${date}`);
	await expect(page.getByRole('heading', { name: 'Nothing logged yet' })).toBeVisible();

	const sheet = await openAddSheet(page);
	await sheet.getByRole('searchbox', { name: 'Search foods' }).fill('poulet');
	// BLV names are English; "poulet" matches through the French alternate names in the search text.
	const first = sheet.getByRole('region', { name: 'Your foods' }).getByRole('button').first();
	await expect(first).toContainText(/chicken/i);
	await first.click();

	await expect(sheet.getByLabel('Amount')).toBeVisible();
	await sheet.getByRole('radio', { name: 'g', exact: true }).click();
	await sheet.getByLabel('Amount').fill('200');
	const preview = await sheet.getByTestId('preview-kcal').innerText();
	const kcal = Number(/(\d+)/.exec(preview)![1]);
	expect(kcal).toBeGreaterThan(0);

	await sheet.getByRole('button', { name: 'Log' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByText(/^Logged /)).toBeVisible();
	await expect(page.getByText('200 g', { exact: false }).first()).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Nothing logged yet' })).toHaveCount(0);

	// The row and the hero show the same kcal that the preview promised, and a reload keeps it.
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.getByText(`${kcal} kcal`).first()).toBeVisible();

	// Tapping the entry opens the amount step to edit it.
	await page.getByRole('button', { name: /200 g/ }).first().click();
	const edit = page.getByRole('dialog').filter({ has: page.getByLabel('Amount') });
	await expect(edit.getByLabel('Amount')).toHaveValue('200');
	await edit.getByLabel('Amount').fill('100');
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(edit).toBeHidden();
	await expect(page.getByRole('button', { name: /100 g/ }).first()).toBeVisible();
});

test('an Open Food Facts product can be found, picked and logged', async ({ page }, testInfo) => {
	const date = foodDate(testInfo.project.name);
	await gotoHydrated(page, `/day/${date}`);

	const sheet = await openAddSheet(page);
	const search = sheet.getByRole('searchbox', { name: 'Search foods' });
	await search.fill('nutella');
	// Typing never reaches OFF: it needs Enter or the row.
	await expect(sheet.getByRole('button', { name: /Search Open Food Facts/ })).toBeVisible();
	await search.press('Enter');

	const product = sheet.getByRole('button', { name: /^Nutella/ }).first();
	await expect(product).toBeVisible();
	await product.click();

	await expect(sheet.getByLabel('Amount')).toBeVisible();
	await sheet.getByLabel('Amount').fill('30');
	await sheet.getByRole('button', { name: 'Log' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('button', { name: /^Nutella/ }).first()).toBeVisible();
});

test('an Open Food Facts outage says so and keeps the library results', async ({ page }) => {
	await gotoHydrated(page, '/');
	const sheet = await openAddSheet(page);
	const search = sheet.getByRole('searchbox', { name: 'Search foods' });
	// "riz" matches BLV foods and also makes the stub answer 503.
	await search.fill('riz');
	const libraryRow = sheet.getByRole('region', { name: 'Your foods' }).getByRole('button').first();
	await expect(libraryRow).toBeVisible();
	await search.press('Enter');
	await expect(sheet.getByText('Product database unreachable')).toBeVisible();
	await expect(libraryRow).toBeVisible();
});

test('the add sheet also works on a page without a day', async ({ page }) => {
	await gotoHydrated(page, '/weight');
	const sheet = await openAddSheet(page);
	await sheet.getByRole('searchbox', { name: 'Search foods' }).fill('poulet');
	await sheet.getByRole('region', { name: 'Your foods' }).getByRole('button').first().click();
	await expect(sheet.getByLabel('Amount')).toBeVisible();
	await sheet.getByRole('button', { name: 'Back' }).click();
	await expect(sheet.getByRole('searchbox', { name: 'Search foods' })).toHaveValue('poulet');
});

test('Ctrl+K opens the add sheet on desktop', async ({ page }) => {
	test.skip((page.viewportSize()?.width ?? 0) < 1024, 'desktop shortcut');
	await gotoHydrated(page, '/');
	await page.keyboard.press('Control+k');
	await expect(page.getByRole('dialog', { name: 'Add food' })).toBeVisible();
	await expect(page.getByRole('searchbox', { name: 'Search foods' })).toBeFocused();
});
