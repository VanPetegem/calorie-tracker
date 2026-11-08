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

	// Without a profile every app page leads to onboarding, which sets the profile and the first target.
	await expect(page).toHaveURL(/\/onboarding$/);
	await page.getByRole('radio', { name: 'Male', exact: true }).click();
	await page.getByLabel('Birth date').fill('1990-11-04');
	await page.getByLabel('Height', { exact: true }).fill('180');
	await page.getByLabel('Weight', { exact: true }).fill('72');
	await page.getByRole('radio', { name: 'Moderate', exact: true }).click();
	await page.getByRole('button', { name: 'Calculate my target' }).click();
	await expect(page.getByRole('heading', { level: 2, name: 'Your target' })).toBeVisible();
	await page.getByRole('link', { name: 'Start' }).click();

	await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
	await expect(page.getByText('kcal remaining')).toBeVisible();

	await page.context().storageState({ path: AUTH_FILE });
});
