import type { Page } from '@playwright/test';

/**
 * Opens a page and waits until its scripts have loaded and run. `goto` resolves on the load event, which can
 * fire before SvelteKit has hydrated, and a click before hydration does nothing.
 */
export async function gotoHydrated(page: Page, path: string) {
	await page.goto(path);
	await page.waitForLoadState('networkidle');
}
