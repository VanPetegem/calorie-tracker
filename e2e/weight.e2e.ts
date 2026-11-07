import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { gotoHydrated } from './helpers.ts';

/*
 * The Weight tab. Weigh-ins on past days use days of their own, 2020-08-10 to 2020-08-23, which no other e2e file
 * uses: `slot` picks the test, then one day per retry and per browser project. Today's weigh-in is shared by both
 * projects (there is only one today), so that test writes the same value in both. Exact trend and
 * rate numbers live in the domain tests.
 */

function pastDate(testInfo: TestInfo, slot: number): string {
	const project = testInfo.project.name.startsWith('chromium') ? 0 : 1;
	return `2020-08-${10 + (slot * 2 + testInfo.retry) * 2 + project}`;
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', {
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC'
});

/** "Sat 7 Nov 2026", as the page writes a date (built from parts, so no locale adds commas). */
function dayLabel(date: string): string {
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		DAY_FORMAT.formatToParts(new Date(`${date}T00:00:00Z`)).find((p) => p.type === type)?.value;
	return `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}`;
}

const openSheet = (page: Page) => page.locator('[data-sheet][data-open]');

const history = (page: Page) => page.getByRole('region', { name: 'History' });

/** The history row of a date. */
const rowOf = (page: Page, date: string) =>
	history(page)
		.getByRole('listitem')
		.filter({ hasText: dayLabel(date) });

/** Adds a weigh-in for a past day through the "Add weigh-in" sheet. */
async function addPast(page: Page, date: string, kg: string) {
	await page.getByRole('button', { name: 'Add weigh-in' }).click();
	const sheet = openSheet(page);
	await expect(sheet).toBeVisible();
	await sheet.getByLabel('Date').fill(date);
	await sheet.getByLabel('Weight', { exact: true }).fill(kg);
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet).toBeHidden();
	await expect(rowOf(page, date)).toContainText(`${kg} kg`);
}

test('logs today with the stepper and shows it first in the history', async ({ page }) => {
	// Both projects run in parallel and share today's weigh-in, so both write the same value.
	const start = 70.5;
	await gotoHydrated(page, '/weight');

	const entry = page.locator('form').first();
	const field = page.getByLabel('Weight', { exact: true }).first();
	await field.fill(String(start));
	await page.getByRole('button', { name: 'Increase weight by 0.1 kg' }).click();
	await page.getByRole('button', { name: 'Increase weight by 0.1 kg' }).click();
	await entry.getByRole('button', { name: 'Save' }).click();

	const kg = `${(start + 0.2).toFixed(1)} kg`;
	await expect(page.getByText(new RegExp(`^(Logged|Updated) ${kg}$`))).toBeVisible();
	await expect(page.getByText('Logged today')).toBeVisible();
	await expect(history(page).getByRole('listitem').first()).toContainText(kg);

	// Stored on the server: a reload shows it as today's value.
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.getByText('Logged today')).toBeVisible();
	await expect(history(page).getByRole('listitem').first()).toContainText(kg);
});

test('adds a missed past day and edits it', async ({ page }, testInfo) => {
	const date = pastDate(testInfo, 0);
	await gotoHydrated(page, '/weight');

	// A day after tomorrow is refused in the sheet.
	await page.getByRole('button', { name: 'Add weigh-in' }).click();
	const sheet = openSheet(page);
	await expect(sheet).toBeVisible();
	await sheet.getByLabel('Date').fill('2999-01-01');
	await sheet.getByLabel('Weight', { exact: true }).fill('70.0');
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(sheet.getByText('Choose a day up to tomorrow')).toBeVisible();
	await sheet.getByRole('button', { name: 'Cancel' }).click();
	await expect(sheet).toBeHidden();

	await addPast(page, date, '70.2');
	await expect(page.getByText('Logged 70.2 kg')).toBeVisible();

	await rowOf(page, date)
		.getByRole('button', { name: new RegExp(`^${dayLabel(date)}`) })
		.click();
	const edit = openSheet(page);
	await expect(edit.getByRole('heading', { name: 'Edit weigh-in' })).toBeVisible();
	await edit.getByLabel('Weight', { exact: true }).fill('70.8');
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(edit).toBeHidden();
	await expect(page.getByText('Updated 70.8 kg')).toBeVisible();
	await expect(rowOf(page, date)).toContainText('70.8 kg');

	// One row per day: editing did not leave a copy.
	await expect(rowOf(page, date)).toHaveCount(1);
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(rowOf(page, date)).toContainText('70.8 kg');
});

test('delete with Undo brings the weigh-in back', async ({ page }, testInfo) => {
	const date = pastDate(testInfo, 1);
	await gotoHydrated(page, '/weight');
	await addPast(page, date, '69.4');

	await page.getByRole('button', { name: `Delete weigh-in of ${dayLabel(date)}` }).click();
	await expect(page.getByText(`Deleted weigh-in of ${dayLabel(date)}`)).toBeVisible();
	await expect(rowOf(page, date)).toHaveCount(0);

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(rowOf(page, date)).toContainText('69.4 kg');
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(rowOf(page, date)).toContainText('69.4 kg');
});

test('the chart range control keeps working and shows older weigh-ins only in All', async ({
	page
}, testInfo) => {
	const date = pastDate(testInfo, 2);
	await gotoHydrated(page, '/weight');
	await addPast(page, date, '68.6');

	const table = page.getByRole('table', { name: /^Weigh-ins/ });
	const ranges = page.getByRole('radiogroup', { name: /range/i });
	const older = table.getByRole('row').filter({ hasText: dayLabel(date) });

	for (const label of ['30 days', '90 days', '1 year']) {
		await ranges.getByRole('radio', { name: label }).click();
		await expect(ranges.getByRole('radio', { name: label })).toBeChecked();
		await expect(older).toHaveCount(0);
	}
	await ranges.getByRole('radio', { name: 'All' }).click();
	await expect(older).toHaveCount(1);
	await expect(older).toContainText('68.6 kg');
	await ranges.getByRole('radio', { name: '30 days' }).click();
	await expect(older).toHaveCount(0);
});
