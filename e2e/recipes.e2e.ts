import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { gotoHydrated } from './helpers.ts';

/** The open sheet. The dialog is renamed by each step, so a test holds the element. */
const openSheet = (page: Page) => page.locator('[data-sheet][data-open]');

const nav = (page: Page) => page.getByRole('navigation', { name: 'Primary' });

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

/** Creates a custom food with a serving (380 kcal per 100 g, 50 g serving) and adds `servings` of it. */
async function addCustomFood(page: Page, name: string, servings: number) {
	await page.getByRole('button', { name: 'Add ingredient' }).click();
	const sheet = openSheet(page);
	await sheet.getByRole('button', { name: 'New food' }).click();
	await sheet.getByLabel('Name', { exact: true }).fill(name);
	await sheet.getByLabel('Calories', { exact: true }).fill('380');
	await sheet.getByLabel('Protein', { exact: true }).fill('20');
	await sheet.getByLabel('Carbs', { exact: true }).fill('40');
	await sheet.getByLabel('Fat', { exact: true }).fill('12');
	await sheet.getByLabel('Serving size (optional)').fill('50');
	await sheet.getByRole('button', { name: 'Save food' }).click();
	await expect(sheet.getByLabel('Amount')).toHaveValue('1');
	await sheet.getByLabel('Amount').fill(String(servings));
	await sheet.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(sheet).toBeHidden();
}

const unique = (label: string, projectName: string, retry: number) =>
	`${label} ${projectName} ${retry} ${Date.now()}`;

/** A recipe with 200 g of chicken, saved. Leaves the page on the saved recipe. */
async function createSimpleRecipe(page: Page, name: string) {
	await gotoHydrated(page, '/recipes/new');
	await page.getByLabel('Name', { exact: true }).fill(name);
	await addChicken(page, 200);
	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
	await expect(page.getByText('Recipe saved')).toBeVisible();
}

test('creates a recipe from a BLV food and a custom serving food, shows kcal per portion, and edits it', async ({
	page
}, testInfo) => {
	const name = unique('Chicken rice', testInfo.project.name, testInfo.retry);
	const food = unique('Bar', testInfo.project.name, testInfo.retry);

	await gotoHydrated(page, '/recipes');
	await page.getByRole('link', { name: 'New recipe' }).click();
	await expect(page).toHaveURL(/\/recipes\/new$/);
	await expect(page.getByRole('heading', { level: 1, name: 'New recipe' })).toBeVisible();

	// Save is off, and says why, until there is a name and an ingredient.
	const save = page.getByRole('button', { name: 'Save recipe' });
	await expect(save).toHaveAttribute('aria-disabled', 'true');
	await page.getByLabel('Name', { exact: true }).fill(name);
	await page.getByLabel('Portions', { exact: true }).fill('4');

	const chickenKcal = await addChicken(page, 200);
	expect(chickenKcal).toBeGreaterThan(0);
	await addCustomFood(page, food, 2);

	// 2 servings of 50 g at 380 kcal per 100 g is 380 kcal. The summary follows the list.
	const total = chickenKcal + 380;
	await expect(page.getByTestId('total-kcal')).toHaveText(`${total} kcal`);
	const perPortion = Math.round(total / 4);
	await expect(page.getByTestId('per-portion-kcal')).toHaveText(`${perPortion} kcal`);

	await save.click();
	await expect(page.getByText('Recipe saved')).toBeVisible();
	await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);

	// A reload shows the stored recipe with the same numbers: the editor and the list agree.
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue(name);
	await expect(page.getByTestId('total-kcal')).toHaveText(`${total} kcal`);

	await nav(page).getByRole('link', { name: 'Recipes' }).click();
	const row = page.getByRole('link', { name: new RegExp(name) });
	await expect(row).toContainText(`${perPortion} kcal`);
	await expect(row).toContainText('4 portions');
	await expect(row).toContainText('2 ingredients');

	// Five portions instead of four.
	await row.click();
	await page.getByLabel('Portions', { exact: true }).fill('5');
	await expect(page.getByTestId('per-portion-kcal')).toHaveText(`${Math.round(total / 5)} kcal`);
	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page.getByText('Recipe saved')).toBeVisible();
	await nav(page).getByRole('link', { name: 'Recipes' }).click();
	await expect(page.getByRole('link', { name: new RegExp(name) })).toContainText(
		`${Math.round(total / 5)} kcal`
	);
	await expect(page.getByRole('link', { name: new RegExp(name) })).toContainText('5 portions');
});

test('navigating away with an unsaved change asks first', async ({ page }, testInfo) => {
	await createSimpleRecipe(page, unique('Guarded', testInfo.project.name, testInfo.retry));

	// Nothing changed: leaving is free.
	await nav(page).getByRole('link', { name: 'Weight' }).click();
	await expect(page).toHaveURL(/\/weight$/);
	await page.goBack();
	await page.waitForLoadState('networkidle');
	await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);

	await page.getByLabel('Portions', { exact: true }).fill('9');
	await nav(page).getByRole('link', { name: 'Weight' }).click();
	const ask = page.getByRole('dialog', { name: 'Discard changes?' });
	await expect(ask).toBeVisible();
	await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);

	await ask.getByRole('button', { name: 'Keep editing' }).click();
	await expect(ask).toBeHidden();
	await expect(page.getByLabel('Portions', { exact: true })).toHaveValue('9');

	await nav(page).getByRole('link', { name: 'Weight' }).click();
	await page
		.getByRole('dialog', { name: 'Discard changes?' })
		.getByRole('button', { name: 'Discard', exact: true })
		.click();
	await expect(page).toHaveURL(/\/weight$/);
});

test('browser back with an unsaved change asks first', async ({ page }, testInfo) => {
	const name = unique('Back guard', testInfo.project.name, testInfo.retry);
	await createSimpleRecipe(page, name);

	// List, then the recipe: back has somewhere to go.
	await nav(page).getByRole('link', { name: 'Recipes' }).click();
	await page.getByRole('link', { name: new RegExp(name) }).click();
	await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
	await page.waitForLoadState('networkidle');

	await page.getByLabel('Portions', { exact: true }).fill('7');
	await page.goBack();
	const ask = page.getByRole('dialog', { name: 'Discard changes?' });
	await expect(ask).toBeVisible();
	await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
	await expect(page.getByLabel('Portions', { exact: true })).toHaveValue('7');

	await ask.getByRole('button', { name: 'Keep editing' }).click();
	await expect(ask).toBeHidden();

	await page.goBack();
	await page
		.getByRole('dialog', { name: 'Discard changes?' })
		.getByRole('button', { name: 'Discard', exact: true })
		.click();
	await expect(page).toHaveURL(/\/recipes$/);
});

test('archiving hides a recipe, and Undo brings it back', async ({ page }, testInfo) => {
	const name = unique('Archive me', testInfo.project.name, testInfo.retry);
	await createSimpleRecipe(page, name);

	await page.getByRole('button', { name: 'Archive recipe' }).click();
	await expect(page).toHaveURL(/\/recipes$/);
	await expect(page.getByText(`Archived ${name}`)).toBeVisible();
	await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);

	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();

	// Restored on the server: a reload keeps it.
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
});

test('an unknown recipe is a 404', async ({ page }) => {
	const response = await page.goto('/recipes/019a5b2e-8f3c-7d4a-9b1e-2c3d4e5f6a7b');
	expect(response?.status()).toBe(404);
});
