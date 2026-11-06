import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { MAX_INGREDIENTS } from '#lib/domain/constants.ts';
import { toasts } from '#lib/stores/toasts.svelte.ts';
import type { DraftIngredient } from './draft.ts';
import IngredientListTestHarness from './IngredientListTestHarness.svelte';

const mocks = vi.hoisted(() => ({ loadSuggestions: vi.fn(), searchFoods: vi.fn() }));

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));
vi.mock('../../../routes/(app)/foods.remote.ts', () => ({
	loadSuggestions: mocks.loadSuggestions,
	searchFoods: mocks.searchFoods,
	searchOff: vi.fn(),
	pickOff: vi.fn(),
	lookupBarcode: vi.fn(),
	createFood: vi.fn(),
	updateFood: vi.fn()
}));

const oats = {
	id: '0198a000-0000-7000-8000-000000000001',
	name: 'Oats',
	nutritionBasis: 'g',
	kcal: 400,
	protein: 13,
	carbs: 60,
	fat: 7,
	fiber: 10,
	servingG: null
} as const;
const milk = {
	id: '0198a000-0000-7000-8000-000000000002',
	name: 'Milk',
	nutritionBasis: 'ml',
	kcal: 50,
	protein: 3,
	carbs: 5,
	fat: 2,
	fiber: null,
	servingG: null
} as const;
const banana = {
	id: '0198a000-0000-7000-8000-000000000003',
	name: 'Banana',
	nutritionBasis: 'g',
	kcal: 90,
	protein: 1,
	carbs: 20,
	fat: 0,
	fiber: 2,
	servingG: 120
} as const;

const draft = (key: string, food: DraftIngredient['food'], amount: number): DraftIngredient => ({
	key,
	food,
	amount,
	unit: food.nutritionBasis
});
const three = () => [draft('a', oats, 100), draft('b', milk, 200), draft('c', banana, 100)];

beforeEach(() => {
	mocks.loadSuggestions.mockReset();
	mocks.loadSuggestions.mockResolvedValue({ today: '2026-11-05', recents: [], frequents: [] });
});

afterEach(async () => {
	// Menus stay open after a move: close what a test left open.
	if (document.querySelector('dialog[open]')) await userEvent.keyboard('{Escape}');
	for (const item of [...toasts.items]) toasts.dismiss(item.id);
	await vi.waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
});

/** Names of the rows, top to bottom. The name is the first line of each row's main button. */
function order(): string[] {
	return page
		.getByRole('listitem')
		.elements()
		.map((li) => li.querySelector('button')?.querySelector('span span')?.textContent ?? '');
}

/** Waits for a sheet to finish sliding in: a click on the moving sheet can land on the backdrop and close it. */
async function sheetSettled() {
	await vi.waitFor(() =>
		expect(document.querySelector('dialog[open]')?.getAnimations({ subtree: true })).toHaveLength(0)
	);
}

async function openMenu(name: string) {
	await page.getByRole('button', { name: `More actions for ${name}` }).click();
	await expect.element(page.getByRole('dialog', { name })).toBeVisible();
	await sheetSettled();
}

describe('IngredientList', () => {
	it('says what to add when the list is empty', async () => {
		render(IngredientListTestHarness, { initial: [] });
		await expect.element(page.getByText('Add the raw ingredients')).toBeVisible();
	});

	it('shows name, amount with unit and kcal per row, and the total', async () => {
		render(IngredientListTestHarness, { initial: three() });
		await expect.element(page.getByText('100 g').first()).toBeVisible();
		await expect.element(page.getByText('200 ml')).toBeVisible();
		await expect.element(page.getByText('400 kcal', { exact: true })).toBeVisible();
		await expect.element(page.getByText('100 kcal', { exact: true })).toBeVisible();
		await expect.element(page.getByText('90 kcal', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Total 590 kcal')).toBeVisible();
	});

	it('changes an amount from the row and updates the row and the total', async () => {
		render(IngredientListTestHarness, { initial: three() });
		await page.getByRole('button', { name: /Oats/ }).first().click();
		await expect.element(page.getByRole('dialog', { name: 'Oats' })).toBeVisible();
		await sheetSettled();
		await page.getByLabelText('Amount').fill('50');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect
			.element(page.getByRole('list').getByText('200 kcal', { exact: true }))
			.toBeVisible();
		await expect.element(page.getByText('Total 390 kcal')).toBeVisible();
		expect(order()).toEqual(['Oats', 'Milk', 'Banana']);
	});

	it('adds a picked food as the last row', async () => {
		mocks.loadSuggestions.mockResolvedValue({
			today: '2026-11-05',
			recents: [{ ...banana, lastAmount: 120, lastUnit: 'g' }],
			frequents: []
		});
		render(IngredientListTestHarness, { initial: [draft('a', oats, 100)] });
		await page.getByRole('button', { name: 'Add ingredient' }).click();
		await expect.element(page.getByRole('dialog', { name: 'Add ingredient' })).toBeVisible();
		await sheetSettled();
		expect(page.getByRole('button', { name: 'Quick add' }).elements()).toHaveLength(0);
		await page.getByRole('button', { name: /Banana/ }).click();
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect.poll(order).toEqual(['Oats', 'Banana']);
		await expect.element(page.getByText('Total 508 kcal')).toBeVisible();
		await expect.poll(() => document.querySelector('dialog[open]')).toBeNull();
	});

	it('moves a row down and up', async () => {
		render(IngredientListTestHarness, { initial: three() });
		await openMenu('Oats');
		await page.getByRole('button', { name: 'Move down' }).click();
		await expect.poll(order).toEqual(['Milk', 'Oats', 'Banana']);
		await page.getByRole('button', { name: 'Move up' }).click();
		await expect.poll(order).toEqual(['Oats', 'Milk', 'Banana']);
	});

	it('cannot move the first row up or the last row down', async () => {
		render(IngredientListTestHarness, { initial: three() });
		await openMenu('Oats');
		await expect
			.element(page.getByRole('button', { name: 'Move up' }))
			.toHaveAttribute('aria-disabled', 'true');
		await expect
			.element(page.getByRole('button', { name: 'Move down' }))
			.not.toHaveAttribute('aria-disabled');
	});

	it('removes a row, and Undo puts it back at the same index', async () => {
		render(IngredientListTestHarness, { initial: three() });
		await openMenu('Milk');
		await page.getByRole('button', { name: 'Remove' }).click();
		await expect.poll(order).toEqual(['Oats', 'Banana']);
		await expect.element(page.getByText('Removed Milk')).toBeVisible();
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(order).toEqual(['Oats', 'Milk', 'Banana']);
	});

	it('Undo of a removed last row restores it at the end', async () => {
		render(IngredientListTestHarness, { initial: three() });
		await openMenu('Banana');
		await page.getByRole('button', { name: 'Remove' }).click();
		await expect.poll(order).toEqual(['Oats', 'Milk']);
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(order).toEqual(['Oats', 'Milk', 'Banana']);
	});

	it('stops adding at the ingredient limit and says why', async () => {
		const many = Array.from({ length: MAX_INGREDIENTS }, (_, i) => draft(`k${i}`, oats, 10));
		render(IngredientListTestHarness, { initial: many });
		const add = page.getByRole('button', { name: 'Add ingredient' });
		await expect.element(add).toHaveAttribute('aria-disabled', 'true');
		// A disabled button still takes focus, which reveals the reason; Enter must not open the picker.
		add.element().focus();
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByText(`At most ${MAX_INGREDIENTS} ingredients`)).toBeVisible();
		expect(document.querySelector('dialog[open]')).toBeNull();
	});
});
