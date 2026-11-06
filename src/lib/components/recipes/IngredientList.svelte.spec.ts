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

async function closeSheet() {
	await userEvent.keyboard('{Escape}');
	await vi.waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
}

/** The name of the row whose main button has focus, or the label of another focused button. */
function focused(): string {
	const el = document.activeElement;
	return (el?.querySelector('span span')?.textContent ?? el?.textContent ?? '').trim();
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

	it('prices and opens a serving of a food without a serving weight from its stored grams', async () => {
		const tahini = {
			...oats,
			id: '0198a000-0000-7000-8000-000000000009',
			name: 'Tahini',
			kcal: 600
		};
		render(IngredientListTestHarness, {
			initial: [{ key: 't', food: tahini, amount: 2, unit: 'serving', grams: 30 }]
		});
		await expect.element(page.getByText('2 servings')).toBeVisible();
		await expect.element(page.getByText('Total 180 kcal')).toBeVisible();
		await page
			.getByRole('button', { name: /Tahini/ })
			.first()
			.click();
		await sheetSettled();
		await expect.element(page.getByLabelText('Amount')).toHaveValue('30');
		await expect.element(page.getByRole('radio', { name: 'g' })).toBeChecked();
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
		await closeSheet();
		await openMenu('Banana');
		await expect
			.element(page.getByRole('button', { name: 'Move down' }))
			.toHaveAttribute('aria-disabled', 'true');
		await expect
			.element(page.getByRole('button', { name: 'Move up' }))
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

	it('focuses the next row after a removal, the previous one after removing the last', async () => {
		render(IngredientListTestHarness, { initial: three() });
		await openMenu('Milk');
		await page.getByRole('button', { name: 'Remove' }).click();
		await expect.poll(focused).toBe('Banana');
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(order).toEqual(['Oats', 'Milk', 'Banana']);
		await openMenu('Banana');
		await page.getByRole('button', { name: 'Remove' }).click();
		await expect.poll(focused).toBe('Milk');
	});

	it('focuses Add ingredient after removing the only row', async () => {
		render(IngredientListTestHarness, { initial: [draft('a', oats, 100)] });
		await openMenu('Oats');
		await page.getByRole('button', { name: 'Remove' }).click();
		await expect.poll(focused).toBe('Add ingredient');
	});

	it('does not put a row back when the list is full again, and says why', async () => {
		const many = Array.from({ length: MAX_INGREDIENTS }, (_, i) =>
			draft(`k${i}`, { ...oats, name: `Item ${i}` }, 10)
		);
		render(IngredientListTestHarness, { initial: many });
		await openMenu('Item 0');
		await page.getByRole('button', { name: 'Remove' }).click();
		await expect.poll(() => order().length).toBe(MAX_INGREDIENTS - 1);
		await page.getByRole('button', { name: 'Add filler' }).click();
		await page.getByRole('button', { name: 'Undo' }).click();
		expect(order()).toHaveLength(MAX_INGREDIENTS);
		await expect
			.element(page.getByText(`Not restored: at most ${MAX_INGREDIENTS} ingredients`))
			.toBeVisible();
	});

	it('drops its Undo toast when the list goes away', async () => {
		const { unmount } = render(IngredientListTestHarness, { initial: three() });
		await openMenu('Milk');
		await page.getByRole('button', { name: 'Remove' }).click();
		await expect.element(page.getByText('Removed Milk')).toBeVisible();
		expect(toasts.items).toHaveLength(1);
		await unmount();
		expect(toasts.items).toHaveLength(0);
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

describe('IngredientList line errors', () => {
	it('marks the failing row with its message and leaves the others alone', async () => {
		render(IngredientListTestHarness, {
			initial: [draft('a', oats, 80), draft('b', milk, 250)],
			errors: { b: 'Milk has no serving size' }
		});
		await expect.element(page.getByRole('alert')).toHaveTextContent('Milk has no serving size');
		expect(page.getByRole('alert').elements()).toHaveLength(1);
		await expect
			.element(page.getByRole('button', { name: /^Milk/ }))
			.toHaveAccessibleDescription('Milk has no serving size');
		await expect
			.element(page.getByRole('button', { name: /^Oats/ }))
			.not.toHaveAccessibleDescription('Milk has no serving size');
	});
});
