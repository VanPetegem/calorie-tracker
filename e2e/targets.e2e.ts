import { expect, test } from './fixtures.ts';
import { gotoHydrated } from './helpers.ts';

/*
 * Weekly targets. The setup project completes onboarding, so every page has a target. The goal rate is shared by both
 * browser projects and a save from one lands between the other's save and its read, so this file runs in one project
 * only. Exact target numbers live in the domain and server tests.
 */

test.skip(
	({ browserName }) => browserName !== 'chromium',
	'chromium only: the goal rate is shared'
);

/** "2,450" from the text of a number with thousands separators. */
const kcalIn = (text: string) => Number(text.replace(/,/g, ''));

test('changing the goal rate in Settings changes Today to the same target', async ({ page }) => {
	await gotoHydrated(page, '/settings');
	// Another rate than the stored one: Save goal stays off until the rate changes, and any rate may be stored.
	await page
		.getByRole('radio', { name: /^0\.\d+ %/, checked: false })
		.first()
		.check();
	// The toast comes before the page reloads its data (SvelteKit's data request). Wait for that reload: leaving the
	// page while it runs makes the next navigation fail with "interrupted by another navigation".
	const reloaded = page.waitForResponse((response) =>
		response.url().includes('/settings/__data.json')
	);
	await page.getByRole('button', { name: 'Save goal' }).click();
	await expect(page.getByText('Goal saved')).toBeVisible();
	await reloaded;
	await page.waitForLoadState('networkidle');

	// Read both targets from fresh page loads, not from this page's reloaded data. Comparing with the target before the save would not do either: the new rate can land on
	// the same kcal as the old one when the trend moved in between.
	// Today's hero reads "... of 2,450 eaten" (or "kcal, ... of 2,450 eaten" when over), whatever is eaten today.
	await gotoHydrated(page, '/');
	const hero = page.getByText(/of [\d,]+ eaten/);
	await expect(hero).toBeVisible();
	const todayTarget = kcalIn(/of ([\d,]+) eaten/.exec(await hero.innerText())![1]);

	// The history row of this week shows the target Settings uses: its first kcal figure.
	await gotoHydrated(page, '/settings');
	const thisWeek = page
		.getByRole('list', { name: 'Weekly targets' })
		.getByRole('listitem')
		.filter({ hasText: 'This week' });
	await expect(thisWeek).toBeVisible();
	const settingsTarget = kcalIn(/([\d,]+) kcal/.exec(await thisWeek.innerText())![1]);

	expect(todayTarget).toBe(settingsTarget);
});
