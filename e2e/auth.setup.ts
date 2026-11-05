import { expect, test as setup } from './fixtures.ts';
import { AUTH_FILE, TEST_USER } from './helpers.ts';

setup('create the account through first run setup', async ({ page }) => {
	// On an empty database every way in leads to setup: / goes to /login, which goes to /setup.
	await page.goto('/');
	await expect(page).toHaveURL(/\/setup$/);
	await page.waitForLoadState('networkidle');

	await page.getByLabel('Name').fill(TEST_USER.name);
	await page.getByLabel('Email').fill(TEST_USER.email);
	await page.getByLabel('Password').fill(TEST_USER.password);
	await page.getByRole('button', { name: 'Create account' }).click();

	await expect(page).toHaveURL(/\/setup\/passkey$/);
	await expect(page.getByRole('button', { name: 'Add Face ID / Touch ID' })).toBeVisible();
	await page.getByRole('link', { name: 'Skip' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

	await page.context().storageState({ path: AUTH_FILE });
});
