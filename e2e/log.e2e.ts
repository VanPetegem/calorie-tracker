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
