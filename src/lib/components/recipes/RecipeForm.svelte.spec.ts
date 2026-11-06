import { error } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { toasts } from '#lib/stores/toasts.svelte.ts';
import type { RecipeDraft } from './draft.ts';
import RecipeFormTestHarness from './RecipeFormTestHarness.svelte';

type Navigation = {
	cancel: () => void;
	to: { url: URL } | null;
	type: string;
	willUnload: boolean;
};

const mocks = vi.hoisted(() => ({
	saveRecipe: vi.fn(),
	archiveRecipe: vi.fn(),
	restoreRecipe: vi.fn(),
	invalidateAll: vi.fn(),
	goto: vi.fn(),
	beforeNavigate: [] as ((navigation: Navigation) => void)[],
	loadSuggestions: vi.fn(),
	searchFoods: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	invalidateAll: mocks.invalidateAll,
	goto: mocks.goto,
	beforeNavigate: (callback: (navigation: Navigation) => void) => {
		mocks.beforeNavigate.push(callback);
	}
}));
vi.mock('$app/paths', () => ({
	resolve: (route: string, params?: Record<string, string>) =>
		route.replace('/(app)', '').replace('[id]', params?.id ?? '')
}));
vi.mock('../../../routes/(app)/recipes/recipes.remote.ts', () => ({
	saveRecipe: mocks.saveRecipe,
	archiveRecipe: mocks.archiveRecipe,
	restoreRecipe: mocks.restoreRecipe
}));
vi.mock('../../../routes/(app)/foods.remote.ts', () => ({
	loadSuggestions: mocks.loadSuggestions,
	searchFoods: mocks.searchFoods,
	searchOff: vi.fn(),
	pickOff: vi.fn(),
	lookupBarcode: vi.fn(),
	createFood: vi.fn(),
	updateFood: vi.fn()
}));

const chicken = {
	id: '0198a000-0000-7000-8000-000000000001',
	name: 'Chicken',
	nutritionBasis: 'g',
	kcal: 165,
	protein: 31,
	carbs: 0,
	fat: 3.6,
	fiber: null,
	servingG: null
} as const;
const egg = {
	...chicken,
	id: '0198a000-0000-7000-8000-000000000002',
	name: 'Egg',
	servingG: 50
} as const;

const saved: RecipeDraft = {
	id: '0198a000-0000-7000-8000-0000000000aa',
	name: 'Chicken rice',
	defaultPortions: 4,
	notes: null,
	ingredients: [
		{ key: 'a', food: chicken, amount: 200, unit: 'g' },
		{ key: 'b', food: egg, amount: 2, unit: 'serving' }
	]
};

beforeEach(() => {
	for (const mock of Object.values(mocks)) {
		if (typeof mock === 'function') mock.mockReset();
	}
	mocks.beforeNavigate.length = 0;
	mocks.invalidateAll.mockResolvedValue(undefined);
	mocks.goto.mockResolvedValue(undefined);
	mocks.loadSuggestions.mockResolvedValue({ today: '2026-11-06', recents: [], frequents: [] });
	mocks.saveRecipe.mockResolvedValue({ ok: true, id: saved.id });
	mocks.archiveRecipe.mockResolvedValue(undefined);
	mocks.restoreRecipe.mockResolvedValue(undefined);
});

afterEach(async () => {
	if (document.querySelector('dialog[open]')) await userEvent.keyboard('{Escape}');
	for (const item of [...toasts.items]) toasts.dismiss(item.id);
	await vi.waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
});

const field = (label: string) => page.getByLabelText(label, { exact: true });

/** Runs the `beforeNavigate` callbacks the form registered for a navigation to /weight. */
function navigate(type = 'link') {
	const cancel = vi.fn();
	for (const callback of mocks.beforeNavigate) {
		callback({ cancel, to: { url: new URL('http://localhost/weight') }, type, willUnload: false });
	}
	return cancel;
}

/** Waits for a sheet to finish sliding in: a click on the moving sheet can miss its buttons. */
async function sheetSettled() {
	await vi.waitFor(() =>
		expect(document.querySelector('dialog[open]')?.getAnimations({ subtree: true })).toHaveLength(0)
	);
}

function unload() {
	const event = new Event('beforeunload', { cancelable: true });
	window.dispatchEvent(event);
	return event.defaultPrevented;
}

describe('RecipeForm validation', () => {
	it('shows "Enter a value" when the name loses focus blank', async () => {
		render(RecipeFormTestHarness, {});
		await field('Name').click();
		await expect.element(page.getByText('Enter a value')).not.toBeInTheDocument();
		await field('Portions').click();
		await expect.element(page.getByText('Enter a value')).toBeVisible();
	});

	it('rejects 0 and 101 portions on blur', async () => {
		render(RecipeFormTestHarness, {});
		await field('Portions').fill('0');
		await field('Name').click();
		await expect.element(page.getByText('Enter more than 0')).toBeVisible();
		await field('Portions').fill('101');
		await field('Name').click();
		await expect.element(page.getByText('Enter at most 100')).toBeVisible();
	});

	it('keeps Save disabled and says why while the recipe has no ingredient', async () => {
		render(RecipeFormTestHarness, {});
		await field('Name').fill('Soup');
		const save = page.getByRole('button', { name: 'Save recipe' });
		await expect.element(save).toHaveAttribute('aria-disabled', 'true');
		await expect.element(save).toHaveAccessibleDescription('Add at least one ingredient');
		await save.click({ force: true });
		expect(mocks.saveRecipe).not.toHaveBeenCalled();
	});
});

describe('RecipeForm saving', () => {
	it('sends only food, amount and unit for each ingredient, and the id when editing', async () => {
		render(RecipeFormTestHarness, { recipe: saved });
		await field('Portions').fill('5');
		await page.getByRole('button', { name: 'Save recipe' }).click();
		await vi.waitFor(() => expect(mocks.saveRecipe).toHaveBeenCalledTimes(1));
		expect(mocks.saveRecipe).toHaveBeenCalledWith({
			id: saved.id,
			name: 'Chicken rice',
			defaultPortions: 5,
			notes: null,
			ingredients: [
				{ foodId: chicken.id, amount: 200, unit: 'g' },
				{ foodId: egg.id, amount: 2, unit: 'serving' }
			]
		});
		await vi.waitFor(() => expect(mocks.invalidateAll).toHaveBeenCalled());
		await expect.element(page.getByText('Recipe saved')).toBeVisible();
	});

	it('opens the saved recipe in place of /recipes/new', async () => {
		render(RecipeFormTestHarness, { recipe: { ...saved, id: undefined } });
		await field('Portions').fill('5');
		await page.getByRole('button', { name: 'Save recipe' }).click();
		await vi.waitFor(() =>
			expect(mocks.goto).toHaveBeenCalledWith(`/recipes/${saved.id}`, { replaceState: true })
		);
	});

	it('marks the failing ingredient and keeps the form when a unit is not available', async () => {
		mocks.saveRecipe.mockResolvedValue({
			ok: false,
			reason: 'unit_not_available',
			message: 'Egg has no serving size',
			index: 1
		});
		render(RecipeFormTestHarness, { recipe: saved });
		await field('Portions').fill('5');
		await page.getByRole('button', { name: 'Save recipe' }).click();
		await expect
			.element(page.getByRole('button', { name: /^Egg/ }))
			.toHaveAccessibleDescription('Egg has no serving size');
		await expect.element(field('Portions')).toHaveValue('5');
		expect(mocks.goto).not.toHaveBeenCalled();
	});

	it('clears the mark once that ingredient is removed', async () => {
		mocks.saveRecipe.mockResolvedValue({
			ok: false,
			reason: 'unknown_food',
			message: 'This food is no longer in your library',
			index: 1
		});
		render(RecipeFormTestHarness, { recipe: saved });
		await field('Portions').fill('5');
		await page.getByRole('button', { name: 'Save recipe' }).click();
		await expect.element(page.getByText('This food is no longer in your library')).toBeVisible();
		await page.getByRole('button', { name: 'More actions for Egg' }).click();
		await page.getByRole('dialog', { name: 'Egg' }).getByRole('button', { name: 'Remove' }).click();
		await vi.waitFor(() =>
			expect(document.body.textContent).not.toContain('This food is no longer in your library')
		);
	});

	it('shows Retry with the form intact when the save fails, and retries', async () => {
		mocks.saveRecipe.mockRejectedValueOnce(new Error('offline'));
		render(RecipeFormTestHarness, { recipe: saved });
		await field('Portions').fill('5');
		await page.getByRole('button', { name: 'Save recipe' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Could not save');
		await expect.element(field('Portions')).toHaveValue('5');
		await page.getByRole('button', { name: 'Retry' }).click();
		await vi.waitFor(() => expect(mocks.saveRecipe).toHaveBeenCalledTimes(2));
		await expect.element(page.getByText('Recipe saved')).toBeVisible();
	});

	it('shows the message of a recipe that no longer exists', async () => {
		mocks.saveRecipe.mockImplementationOnce(() => error(404, 'This recipe no longer exists'));
		render(RecipeFormTestHarness, { recipe: saved });
		await field('Portions').fill('5');
		await page.getByRole('button', { name: 'Save recipe' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('This recipe no longer exists');
	});

	it('does not fail a save because the refresh afterwards failed', async () => {
		mocks.invalidateAll.mockRejectedValue(new Error('offline'));
		render(RecipeFormTestHarness, { recipe: saved });
		await field('Portions').fill('5');
		await page.getByRole('button', { name: 'Save recipe' }).click();
		await expect.element(page.getByText('Recipe saved')).toBeVisible();
		expect(document.body.textContent).not.toContain('Could not save');
	});
});

describe('RecipeForm unsaved changes', () => {
	it('lets a navigation through while nothing changed', async () => {
		render(RecipeFormTestHarness, { recipe: saved });
		expect(navigate()).not.toHaveBeenCalled();
		expect(unload()).toBe(false);
	});

	it('cancels a navigation after a change and asks before discarding', async () => {
		render(RecipeFormTestHarness, { recipe: saved });
		await field('Portions').fill('5');
		const cancel = navigate();
		expect(cancel).toHaveBeenCalledTimes(1);
		await expect.element(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
		expect(unload()).toBe(true);
	});

	it('Keep editing closes the question and stays', async () => {
		render(RecipeFormTestHarness, { recipe: saved });
		await field('Portions').fill('5');
		navigate();
		await expect.element(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
		await sheetSettled();
		await page.getByRole('button', { name: 'Keep editing' }).click();
		await vi.waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
		expect(mocks.goto).not.toHaveBeenCalled();
		expect(field('Portions').element()).toHaveValue('5');
	});

	it('Discard goes on to where the person was headed', async () => {
		render(RecipeFormTestHarness, { recipe: saved });
		await field('Portions').fill('5');
		navigate();
		await expect.element(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
		await sheetSettled();
		await page.getByRole('button', { name: 'Discard', exact: true }).click();
		await vi.waitFor(() => expect(mocks.goto).toHaveBeenCalled());
		expect(String(mocks.goto.mock.calls[0]![0])).toBe('http://localhost/weight');
		// Now allowed through.
		expect(navigate()).not.toHaveBeenCalled();
	});

	it('a change that is changed back is not a change', async () => {
		render(RecipeFormTestHarness, { recipe: saved });
		await field('Portions').fill('5');
		await field('Portions').fill('4');
		expect(navigate()).not.toHaveBeenCalled();
		expect(unload()).toBe(false);
	});

	it('does not block navigation after a successful save', async () => {
		render(RecipeFormTestHarness, { recipe: saved });
		await field('Portions').fill('5');
		await page.getByRole('button', { name: 'Save recipe' }).click();
		await expect.element(page.getByText('Recipe saved')).toBeVisible();
		expect(navigate()).not.toHaveBeenCalled();
		expect(unload()).toBe(false);
	});

	it('a new recipe with typed text counts as changed', async () => {
		render(RecipeFormTestHarness, {});
		expect(navigate()).not.toHaveBeenCalled();
		await field('Name').fill('Soup');
		expect(navigate()).toHaveBeenCalled();
	});
});

describe('RecipeForm archive', () => {
	it('archives, goes to the list and offers Undo that restores', async () => {
		render(RecipeFormTestHarness, { recipe: saved });
		await field('Portions').fill('5');
		await page.getByRole('button', { name: 'Archive recipe' }).click();
		await vi.waitFor(() => expect(mocks.archiveRecipe).toHaveBeenCalledWith({ id: saved.id }));
		// Archiving with unsaved edits does not ask to discard them.
		await vi.waitFor(() => expect(mocks.goto).toHaveBeenCalledWith('/recipes'));
		expect(navigate()).not.toHaveBeenCalled();
		await page.getByRole('button', { name: 'Undo', exact: true }).click();
		await vi.waitFor(() => expect(mocks.restoreRecipe).toHaveBeenCalledWith({ id: saved.id }));
	});

	it('shows a banner with Restore for an archived recipe, and no Archive button', async () => {
		render(RecipeFormTestHarness, { recipe: saved, archived: true });
		await expect.element(page.getByText('This recipe is archived')).toBeVisible();
		expect(page.getByRole('button', { name: 'Archive recipe' }).elements()).toHaveLength(0);
		await page.getByRole('button', { name: 'Restore', exact: true }).click();
		await vi.waitFor(() => expect(mocks.restoreRecipe).toHaveBeenCalledWith({ id: saved.id }));
		await vi.waitFor(() => expect(mocks.invalidateAll).toHaveBeenCalled());
	});

	it('has no Archive button on a new recipe', async () => {
		render(RecipeFormTestHarness, {});
		expect(page.getByRole('button', { name: 'Archive recipe' }).elements()).toHaveLength(0);
	});
});
