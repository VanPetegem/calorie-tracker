import { expect, type Page } from '@playwright/test';

/** Session of the test account, written by auth.setup.ts and loaded by every browser project. */
export const AUTH_FILE = 'playwright/.auth/user.json';

/** The one account, created by auth.setup.ts on an empty database. */
export const TEST_USER = {
	name: 'Test',
	email: 'test@example.com',
	password: 'correct-horse-battery'
} as const;

/** `test.use({ storageState: loggedOut })` for tests that start without a session. */
export const loggedOut = { cookies: [], origins: [] };

/**
 * Opens a page and waits until its scripts have loaded and run. `goto` resolves on the load event, which can
 * fire before SvelteKit has hydrated, and a click before hydration does nothing.
 */
export async function gotoHydrated(page: Page, path: string) {
	await page.goto(path);
	await page.waitForLoadState('networkidle');
}

/** Signs in through the email and password fallback on the current /login page. */
export async function signInWithPassword(page: Page) {
	await expect(page).toHaveURL(/\/login/);
	await page.waitForLoadState('networkidle');
	await page.getByText('Use email and password instead').click();
	await page.getByLabel('Email').fill(TEST_USER.email);
	await page.getByLabel('Password').fill(TEST_USER.password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
