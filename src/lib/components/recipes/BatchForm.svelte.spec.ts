import { error } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { addSheet } from '#lib/stores/add-sheet.svelte.ts';
import { toasts } from '#lib/stores/toasts.svelte.ts';
import { sampleBatch } from './batch.fixture.ts';
import type { BatchDraft, DraftIngredient } from './draft.ts';
import BatchFormTestHarness from './BatchFormTestHarness.svelte';

type Navigation = {
	cancel: () => void;
	to: { url: URL } | null;
	type: string;
	willUnload: boolean;
};

const mocks = vi.hoisted(() => ({
	saveBatch: vi.fn(),
	finishBatch: vi.fn(),
	reopenBatch: vi.fn(),
	deleteBatch: vi.fn(),
	saveContainer: vi.fn(),
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
vi.mock('../../../routes/(app)/recipes/batches.remote.ts', () => ({
	saveBatch: mocks.saveBatch,
	finishBatch: mocks.finishBatch,
	reopenBatch: mocks.reopenBatch,
	deleteBatch: mocks.deleteBatch,
	saveContainer: mocks.saveContainer
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

const beef = {
	id: '0198a000-0000-7000-8000-000000000001',
	name: 'Beef',
	nutritionBasis: 'g',
	kcal: 200,
	protein: 20,
	carbs: 0,
	fat: 12,
	fiber: null,
	servingG: null
} as const;
// The line prices a serving at 30 g (what the batch was saved with); the food's own serving is 40 g now.
const pasta = {
	id: '0198a000-0000-7000-8000-000000000002',
	name: 'Pasta',
	nutritionBasis: 'g',
	kcal: 350,
	protein: 12,
	carbs: 70,
	fat: 2,
	fiber: 3,
	servingG: 30
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

const BATCH_ID = '0198a000-0000-7000-8000-0000000000bb';
const LINE_BEEF = '0198a000-0000-7000-8000-0000000001a1';
const LINE_PASTA = '0198a000-0000-7000-8000-0000000001a2';

const line = (
	key: string,
	id: string,
	food: DraftIngredient['food'],
	amount: number,
	unit: DraftIngredient['unit']
): DraftIngredient => ({
	key,
	id,
	food,
	amount,
	unit,
	snapshot: {
		kcal: food.kcal,
		protein: food.protein,
		carbs: food.carbs,
		fat: food.fat,
		fiber: food.fiber
	}
});

/** 300 g of beef (600 kcal) and 2 servings of 30 g pasta (210 kcal): 810 kcal in 4 portions. */
const saved: BatchDraft = {
	id: BATCH_ID,
	recipeId: null,
	name: 'Beef pasta',
	cookedOn: '2026-11-05',
	portions: 4,
	cookedWeightG: 1600,
	ingredients: [line('a', LINE_BEEF, beef, 300, 'g'), line('b', LINE_PASTA, pasta, 2, 'serving')]
};

const stored = {
	...sampleBatch({ id: BATCH_ID, name: 'Beef pasta', portionsLeft: 3 }),
	liveEntryCount: 0
};

const pot = {
	id: '0198a000-0000-7000-8000-0000000000c1',
	name: 'Pot',
	tareG: 650,
	createdAt: '2026-11-06T09:00:00.000Z'
};

const fresh: BatchDraft = {
	recipeId: null,
	name: '',
	cookedOn: '2026-11-06',
	portions: 1,
	cookedWeightG: null,
	ingredients: []
};

beforeEach(() => {
	for (const mock of Object.values(mocks)) {
		if (typeof mock === 'function') mock.mockReset();
	}
	mocks.beforeNavigate.length = 0;
	mocks.invalidateAll.mockResolvedValue(undefined);
	mocks.goto.mockResolvedValue(undefined);
	mocks.loadSuggestions.mockResolvedValue({
		today: '2026-11-06',
		recents: [{ ...banana, lastAmount: 120, lastUnit: 'g' }],
		frequents: [],
		batches: []
	});
	mocks.saveBatch.mockResolvedValue({ ok: true, id: BATCH_ID });
	mocks.finishBatch.mockResolvedValue(undefined);
	mocks.reopenBatch.mockResolvedValue(undefined);
	mocks.deleteBatch.mockResolvedValue({ ok: true });
	mocks.saveContainer.mockImplementation(async (input) => ({ ...pot, id: 'made', ...input }));
	addSheet.open = false;
	addSheet.batch = null;
});

afterEach(async () => {
	vi.restoreAllMocks();
	if (document.querySelector('dialog[open]')) await userEvent.keyboard('{Escape}');
	for (const item of [...toasts.items]) toasts.dismiss(item.id);
	await vi.waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
});

const field = (label: string) => page.getByLabelText(label, { exact: true });
const saveButton = () => page.getByRole('button', { name: /^(Save batch|Retry)$/ });

const closed = () => vi.waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());

/** Waits for a sheet to finish sliding in: a click on the moving sheet can miss its buttons. */
async function sheetSettled() {
	await vi.waitFor(() =>
		expect(document.querySelector('dialog[open]')?.getAnimations({ subtree: true })).toHaveLength(0)
	);
}

async function openMenu(row: string) {
	await page.getByRole('button', { name: `More actions for ${row}` }).click();
	await sheetSettled();
}

function navigate() {
	const cancel = vi.fn();
	for (const callback of mocks.beforeNavigate) {
		callback({
			cancel,
			to: { url: new URL('http://localhost/weight') },
			type: 'link',
			willUnload: false
		});
	}
	return cancel;
}

const show = (props: Partial<Parameters<typeof render<typeof BatchFormTestHarness>>[1]> = {}) =>
	render(BatchFormTestHarness, { draft: saved, batch: stored, containers: [pot], ...props });

describe('BatchForm validation', () => {
	it('keeps Save disabled and says why while the batch has no ingredient', async () => {
		show({ draft: fresh, batch: undefined });
		await field('Name').fill('Soup');
		await expect.element(saveButton()).toHaveAttribute('aria-disabled', 'true');
		await expect.element(saveButton()).toHaveAccessibleDescription('Add at least one ingredient');
		await saveButton().click({ force: true });
		expect(mocks.saveBatch).not.toHaveBeenCalled();
	});

	it('checks the fields against the schema when they lose focus', async () => {
		show({ draft: fresh, batch: undefined });
		await field('Name').click();
		await field('Portions').fill('101');
		await field('Name').click();
		await expect.element(page.getByText('Enter at most 100')).toBeVisible();
		await expect.element(page.getByText('Enter a value')).toBeVisible();
	});

	it('keeps Save off while the cooked weight is wrong, and says so', async () => {
		show();
		await field('Cooked weight').fill('abc');
		await expect.element(saveButton()).toHaveAttribute('aria-disabled', 'true');
		await expect.element(saveButton()).toHaveAccessibleDescription('Check the cooked weight');
	});
});

describe('BatchForm saving', () => {
	it('keeps the id of each existing line through reorder, an amount edit and remove with Undo, and sends none for a new line', async () => {
		show();
		// Reorder: pasta first.
		await openMenu('Beef');
		await page.getByRole('button', { name: 'Move down' }).click();
		await page.getByRole('dialog', { name: 'Beef' }).getByRole('button', { name: 'Close' }).click();
		await closed();
		// Edit the amount of beef: 300 g to 250 g.
		await page.getByRole('button', { name: /^Beef/ }).click();
		await sheetSettled();
		await page.getByLabelText('Amount').fill('250');
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await closed();
		// Remove pasta and bring it back with Undo: it returns at the same place, with its id.
		await openMenu('Pasta');
		await page
			.getByRole('dialog', { name: 'Pasta' })
			.getByRole('button', { name: 'Remove' })
			.click();
		await closed();
		await page.getByRole('button', { name: 'Undo', exact: true }).click();
		await expect.element(page.getByRole('button', { name: /^Pasta/ })).toBeVisible();
		// A new line.
		await page.getByRole('button', { name: 'Add ingredient' }).click();
		await sheetSettled();
		await page.getByRole('button', { name: /Banana/ }).click();
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await closed();

		await saveButton().click();
		await vi.waitFor(() => expect(mocks.saveBatch).toHaveBeenCalledTimes(1));
		expect(mocks.saveBatch).toHaveBeenCalledWith({
			id: BATCH_ID,
			recipeId: null,
			name: 'Beef pasta',
			cookedOn: '2026-11-05',
			portions: 4,
			cookedWeightG: 1600,
			ingredients: [
				{ id: LINE_PASTA, foodId: pasta.id, amount: 2, unit: 'serving' },
				{ id: LINE_BEEF, foodId: beef.id, amount: 250, unit: 'g' },
				{ foodId: banana.id, amount: 120, unit: 'g' }
			]
		});
		await expect.element(page.getByText('Batch saved')).toBeVisible();
	});

	it('prices a serving line from its own serving weight, not the food one', async () => {
		show();
		// 2 servings of 30 g at 350 kcal per 100 g is 210 kcal; the beef is 600. Total 810.
		await expect.element(page.getByTestId('total-kcal')).toHaveTextContent('810 kcal');
		await expect.element(page.getByText('210 kcal', { exact: true }).first()).toBeVisible();
	});

	it('shows per 100 g from the typed weight, and sends the net weight of a container', async () => {
		show();
		await page.getByLabelText('Container').selectOptions(pot.id);
		await field('Weight on the scale').fill('1850');
		await expect.element(page.getByText('Net weight 1200 g')).toBeVisible();
		await expect.element(page.getByTestId('per100g-kcal')).toHaveTextContent('68 kcal');
		await saveButton().click();
		await vi.waitFor(() => expect(mocks.saveBatch).toHaveBeenCalledTimes(1));
		expect(mocks.saveBatch.mock.calls[0]![0]).toMatchObject({ cookedWeightG: 1200 });
	});

	it('creates a container inline and offers it in the picker', async () => {
		show({ containers: [] });
		await page.getByRole('button', { name: 'New container' }).click();
		await field('Name').last().fill('Dutch oven');
		await page.getByLabelText('Weight of the empty container').fill('4200');
		await page.getByRole('button', { name: 'Save container' }).click();
		await vi.waitFor(() =>
			expect(mocks.saveContainer).toHaveBeenCalledWith({ name: 'Dutch oven', tareG: 4200 })
		);
		await expect.element(page.getByLabelText('Container')).toHaveDisplayValue('Dutch oven, 4200 g');
		await vi.waitFor(() => expect(mocks.invalidateAll).toHaveBeenCalled());
	});

	it('opens a new batch at its own address after the first save', async () => {
		show({
			draft: {
				...fresh,
				name: 'Chili',
				ingredients: [{ key: 'a', food: beef, amount: 100, unit: 'g' }]
			},
			batch: undefined
		});
		await saveButton().click();
		await vi.waitFor(() =>
			expect(mocks.goto).toHaveBeenCalledWith(`/recipes/batches/${BATCH_ID}`, {
				replaceState: true
			})
		);
		expect(mocks.saveBatch.mock.calls[0]![0]).not.toHaveProperty('id');
		expect(mocks.saveBatch.mock.calls[0]![0].ingredients[0]).not.toHaveProperty('id');
	});

	it('marks the refused line and keeps the form', async () => {
		mocks.saveBatch.mockResolvedValue({
			ok: false,
			reason: 'unit_not_available',
			message: 'Pasta has no serving size',
			index: 1
		});
		show();
		await field('Portions').fill('5');
		await saveButton().click();
		await expect
			.element(page.getByRole('button', { name: /^Pasta/ }))
			.toHaveAccessibleDescription('Pasta has no serving size');
		await expect.element(field('Portions')).toHaveValue('5');
		expect(mocks.goto).not.toHaveBeenCalled();
	});

	it('shows Retry when the save fails, and the message of a batch that is gone', async () => {
		mocks.saveBatch.mockRejectedValueOnce(new Error('offline'));
		show();
		await field('Portions').fill('5');
		await saveButton().click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Could not save');
		mocks.saveBatch.mockImplementationOnce(() => error(404, 'This batch no longer exists'));
		await page.getByRole('button', { name: 'Retry' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('This batch no longer exists');
	});

	it('drops the Undo toast of a removed line when a save starts, so Undo cannot be lost to the remount', async () => {
		let finish: (value: unknown) => void = () => {};
		mocks.saveBatch.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
		show();
		await openMenu('Pasta');
		await page
			.getByRole('dialog', { name: 'Pasta' })
			.getByRole('button', { name: 'Remove' })
			.click();
		await closed();
		await expect.element(page.getByText('Removed Pasta')).toBeVisible();
		await saveButton().click();
		await vi.waitFor(() => expect(mocks.saveBatch).toHaveBeenCalledTimes(1));
		expect(toasts.items.map((item) => item.message)).toEqual([]);
		finish({ ok: true, id: BATCH_ID });
		await expect.element(page.getByText('Batch saved')).toBeVisible();
	});

	it('does not fail a save because the refresh afterwards failed', async () => {
		mocks.invalidateAll.mockRejectedValue(new Error('offline'));
		show();
		await field('Portions').fill('5');
		await saveButton().click();
		await expect.element(page.getByText('Batch saved')).toBeVisible();
		expect(document.body.textContent).not.toContain('Could not save');
	});
});

describe('BatchForm focus', () => {
	// A save that takes a few frames, as over the network: the browser drops the focus of an inert element at the
	// next frame, so a mock that settles at once would hide the loss.
	const slowSave = (result: unknown) =>
		mocks.saveBatch.mockImplementationOnce(
			() => new Promise((resolve) => setTimeout(() => resolve(result), 100))
		);

	it('puts focus back on Save once a save has settled', async () => {
		slowSave({ ok: true, id: BATCH_ID });
		show();
		await field('Portions').fill('5');
		await saveButton().click();
		await expect.element(page.getByText('Batch saved')).toBeVisible();
		await expect.element(saveButton()).toHaveFocus();
	});

	it('puts focus back on Save after a failed save', async () => {
		mocks.saveBatch.mockImplementationOnce(
			() => new Promise((_, reject) => setTimeout(() => reject(new Error('offline')), 100))
		);
		show();
		await field('Portions').fill('5');
		await saveButton().click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Could not save');
		await expect.element(saveButton()).toHaveFocus();
	});
});

describe('BatchForm header and actions', () => {
	it('shows the portions left, per portion and per 100 g of the stored batch', async () => {
		show();
		await expect
			.element(page.getByTestId('portions-left'))
			.toHaveTextContent('3 of 4 portions left');
		await expect.element(page.getByTestId('header-per-portion')).toHaveTextContent('500 kcal');
		await expect.element(page.getByTestId('header-per-100g')).toHaveTextContent('125 kcal');
	});

	it('has no header or actions on a new batch', async () => {
		show({ draft: fresh, batch: undefined });
		expect(page.getByTestId('portions-left').elements()).toHaveLength(0);
		expect(page.getByRole('button', { name: 'Log' }).elements()).toHaveLength(0);
	});

	it('Log opens the add sheet at this batch', async () => {
		show();
		await page.getByRole('button', { name: 'Log', exact: true }).click();
		expect(addSheet.open).toBe(true);
		expect(addSheet.batch?.id).toBe(BATCH_ID);
	});

	it('Finish finishes the batch and refreshes', async () => {
		show();
		await page.getByRole('button', { name: 'Finish' }).click();
		await vi.waitFor(() => expect(mocks.finishBatch).toHaveBeenCalledWith({ id: BATCH_ID }));
		await vi.waitFor(() => expect(mocks.invalidateAll).toHaveBeenCalled());
		await expect.element(page.getByText('Batch finished')).toBeVisible();
	});

	it('offers Reopen for a finished batch', async () => {
		show({ batch: { ...stored, finishedAt: '2026-11-06T09:00:00.000Z' } });
		await expect.element(page.getByText('Finished', { exact: true })).toBeVisible();
		expect(page.getByRole('button', { name: 'Finish' }).elements()).toHaveLength(0);
		await page.getByRole('button', { name: 'Reopen' }).click();
		await vi.waitFor(() => expect(mocks.reopenBatch).toHaveBeenCalledWith({ id: BATCH_ID }));
		await expect.element(page.getByText('Batch reopened')).toBeVisible();
	});

	it('Delete is off, with the reason, while the batch has live entries', async () => {
		show({ batch: { ...stored, liveEntryCount: 2 } });
		const remove = page.getByRole('button', { name: 'Delete', exact: true });
		await expect.element(remove).toHaveAttribute('aria-disabled', 'true');
		await expect
			.element(remove)
			.toHaveAccessibleDescription('Logged batches can be finished, not deleted');
		await remove.click({ force: true });
		expect(document.querySelector('dialog[open]')).toBeNull();
		expect(mocks.deleteBatch).not.toHaveBeenCalled();
	});

	it('Delete asks, deletes, and goes to the Recipes tab without a discard question', async () => {
		show();
		await field('Portions').fill('5');
		await page.getByRole('button', { name: 'Delete', exact: true }).click();
		await sheetSettled();
		await page
			.getByRole('dialog', { name: 'Delete this batch?' })
			.getByRole('button', { name: 'Delete' })
			.click();
		await vi.waitFor(() => expect(mocks.deleteBatch).toHaveBeenCalledWith({ id: BATCH_ID }));
		await vi.waitFor(() => expect(mocks.goto).toHaveBeenCalledWith('/recipes'));
		expect(navigate()).not.toHaveBeenCalled();
		// The page of the deleted batch is not reloaded: it would show "Batch not found" before the move.
		expect(mocks.invalidateAll).not.toHaveBeenCalled();
	});

	it('says why when the server refuses the delete', async () => {
		mocks.deleteBatch.mockResolvedValue({
			ok: false,
			reason: 'batch_logged',
			message: 'Logged batches can be finished, not deleted'
		});
		show();
		await page.getByRole('button', { name: 'Delete', exact: true }).click();
		await sheetSettled();
		await page
			.getByRole('dialog', { name: 'Delete this batch?' })
			.getByRole('button', { name: 'Delete' })
			.click();
		await expect
			.element(page.getByText('Logged batches can be finished, not deleted').first())
			.toBeVisible();
		expect(mocks.goto).not.toHaveBeenCalled();
	});
});

describe('BatchForm unsaved changes', () => {
	it('does not count choosing a container on the stored weight as a change', async () => {
		show();
		await page.getByLabelText('Container').selectOptions(pot.id);
		expect(navigate()).not.toHaveBeenCalled();
		await expect.element(saveButton()).not.toHaveAttribute('aria-disabled', 'true');
	});

	it('lets a navigation through while nothing changed', async () => {
		show();
		expect(navigate()).not.toHaveBeenCalled();
	});

	it('asks before an in app navigation after a change, and not after a save', async () => {
		show();
		await field('Portions').fill('5');
		expect(navigate()).toHaveBeenCalledTimes(1);
		await expect.element(page.getByRole('dialog', { name: 'Discard changes?' })).toBeVisible();
		await sheetSettled();
		await page.getByRole('button', { name: 'Keep editing' }).click();
		await closed();
		await saveButton().click();
		await expect.element(page.getByText('Batch saved')).toBeVisible();
		expect(navigate()).not.toHaveBeenCalled();
	});

	it('triggers the browser prompt on reload while there are unsaved changes', async () => {
		show();
		const quiet = new Event('beforeunload', { cancelable: true });
		window.dispatchEvent(quiet);
		expect(quiet.defaultPrevented).toBe(false);
		await field('Portions').fill('5');
		const loud = new Event('beforeunload', { cancelable: true });
		window.dispatchEvent(loud);
		expect(loud.defaultPrevented).toBe(true);
	});
});
