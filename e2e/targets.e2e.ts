import { expect, test } from './fixtures.ts';
import { gotoHydrated } from './helpers.ts';

/*
 * Weekly targets. The setup project completes onboarding, so every page has a target. Both browser projects set the
 * same goal rate and never set it back: the rate is shared, and a reset from one project could land between the other
 * project's save and its read. Exact target numbers live in the domain and server tests.
 */

/** "2,450" from the text of a number with thousands separators. */
const kcalIn = (text: string) => Number(text.replace(/,/g, ''));

test('changing the goal rate in Settings changes Today to the same target', async ({ page }) => {
	await gotoHydrated(page, '/settings');
	await page.getByRole('radio', { name: /^0\.5 %/ }).check();
	await page.getByRole('button', { name: 'Save goal' }).click();
	await expect(page.getByText('Goal saved')).toBeVisible();

	// The history row of this week shows the target Settings uses: its first kcal figure.
	const thisWeek = page
		.getByRole('list', { name: 'Weekly targets' })
		.getByRole('listitem')
		.filter({ hasText: 'This week' });
	await expect(thisWeek).toBeVisible();
	const settingsTarget = kcalIn(/([\d,]+) kcal/.exec(await thisWeek.innerText())![1]);

	// Today's hero reads "... of 2,450 eaten" (or "kcal, ... of 2,450 eaten" when over), whatever is eaten today.
	await gotoHydrated(page, '/');
	const hero = page.getByText(/of [\d,]+ eaten/);
	await expect(hero).toBeVisible();
	const todayTarget = kcalIn(/of ([\d,]+) eaten/.exec(await hero.innerText())![1]);

	expect(todayTarget).toBe(settingsTarget);
});
