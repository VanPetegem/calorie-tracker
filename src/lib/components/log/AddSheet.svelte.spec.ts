import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { addSheet } from '#lib/stores/add-sheet.svelte.ts';
import { toasts } from '#lib/stores/toasts.svelte.ts';
import { sampleBatch } from '../recipes/batch.fixture.ts';
import AddSheet from './AddSheet.svelte';

const mocks = vi.hoisted(() => ({
	loadSuggestions: vi.fn(),
	searchFoods: vi.fn(),
	logQuick: vi.fn(),
	logBatch: vi.fn(),
	invalidateAll: vi.fn()
}));

vi.mock('$app/navigation', () => ({ invalidateAll: mocks.invalidateAll }));
vi.mock('../../../routes/(app)/foods.remote.ts', () => ({
	loadSuggestions: mocks.loadSuggestions,
	searchFoods: mocks.searchFoods,
	searchOff: vi.fn(),
	pickOff: vi.fn(),
	lookupBarcode: vi.fn(),
	createFood: vi.fn(),
	updateFood: vi.fn()
}));
vi.mock('../../../routes/(app)/log.remote.ts', () => ({
	logFood: vi.fn(),
	logBatch: mocks.logBatch,
	logQuick: mocks.logQuick,
	editQuick: vi.fn()
}));

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
});

// The store is shared by every test: close the sheet and wait for its exit transition before the next test opens it.
afterEach(async () => {
	addSheet.open = false;
	addSheet.batch = null;
	await vi.waitFor(() => expect(document.querySelector('[data-sheet][data-open]')).toBeNull());
});

async function openQuickAdd() {
	addSheet.show();
	await expect.element(page.getByRole('dialog', { name: 'Add food' })).toBeVisible();
	// Clicking while the sheet still slides in can land on the backdrop and close it. Wait for data-shown (the
	// slide in has started) and then for no running animation.
	await vi.waitFor(() =>
		expect(
			document.querySelector('[data-sheet][data-shown]')?.getAnimations({ subtree: true })
		).toHaveLength(0)
	);
	await page.getByRole('button', { name: 'Quick add' }).click();
}

describe('AddSheet quick add without a loaded day', () => {
	it('shows a loading state with Back while today is still being fetched', async () => {
		mocks.loadSuggestions.mockReturnValue(new Promise(() => {}));
		render(AddSheet, { day: null });
		await openQuickAdd();
		await expect.element(page.getByText('Loading')).toBeInTheDocument();
		expect(page.getByLabelText('Calories', { exact: true }).elements()).toHaveLength(0);
		await page.getByRole('button', { name: 'Back' }).click();
		await expect.element(page.getByLabelText('Search foods')).toBeVisible();
	});

	it('shows an error with Back when today could not be fetched', async () => {
		mocks.loadSuggestions.mockRejectedValue(new Error('offline'));
		render(AddSheet, { day: null });
		await openQuickAdd();
		await expect.element(page.getByRole('alert')).toHaveTextContent(/Could not load/);
		await page.getByRole('button', { name: 'Back' }).click();
		await expect.element(page.getByLabelText('Search foods')).toBeVisible();
	});

	it('shows the form once today arrives', async () => {
		mocks.loadSuggestions.mockResolvedValue({ today: '2026-11-05', recents: [], frequents: [] });
		render(AddSheet, { day: null });
		await openQuickAdd();
		await expect.element(page.getByLabelText('Calories', { exact: true })).toBeVisible();
	});
});

describe('AddSheet batches', () => {
	const stew = sampleBatch();
	const curry = sampleBatch({ id: 'batch-curry', name: 'Lentil curry', portionsLeft: 0 });
	const dayWith = (batches = [stew, curry]) => ({
		date: '2026-11-05',
		recents: [],
		frequents: [],
		batches
	});

	async function openSheet() {
		addSheet.show();
		await expect.element(page.getByRole('dialog', { name: 'Add food' })).toBeVisible();
		await vi.waitFor(() =>
			expect(
				document.querySelector('[data-sheet][data-shown]')?.getAnimations({ subtree: true })
			).toHaveLength(0)
		);
	}

	it('shows the active batches first while the search is empty, and not once something is typed', async () => {
		mocks.searchFoods.mockResolvedValue([]);
		render(AddSheet, { day: dayWith() });
		await openSheet();
		const batchRow = page.getByRole('button', { name: /Beef stew/ });
		await expect.element(batchRow).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Lentil curry/ })).toBeVisible();
		expect(
			batchRow
				.element()
				.compareDocumentPosition(page.getByRole('button', { name: 'Quick add' }).element()) &
				Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		await page.getByLabelText('Search foods').fill('rice');
		expect(page.getByRole('button', { name: /Beef stew/ }).elements()).toHaveLength(0);
	});

	it('takes the batches of the fetched suggestions on a page without a day', async () => {
		mocks.loadSuggestions.mockResolvedValue({
			today: '2026-11-05',
			recents: [],
			frequents: [],
			batches: [stew]
		});
		render(AddSheet, { day: null });
		await openSheet();
		await expect.element(page.getByRole('button', { name: /Beef stew/ })).toBeVisible();
	});

	it('logs 1.5 portions of the picked batch on the day, then closes and refreshes', async () => {
		mocks.logBatch.mockResolvedValue({});
		render(AddSheet, { day: dayWith() });
		await openSheet();
		await page.getByRole('button', { name: /Beef stew/ }).click();
		await expect.element(page.getByRole('dialog', { name: 'Beef stew' })).toBeVisible();
		await expect.element(page.getByLabelText('Amount')).toHaveValue('1');
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('500 kcal');
		await page.getByLabelText('Amount').fill('1,5');
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('750 kcal');
		await page.getByRole('button', { name: 'Log', exact: true }).click();
		expect(mocks.logBatch).toHaveBeenCalledWith({
			date: '2026-11-05',
			batchId: 'batch-stew',
			amount: 1.5,
			unit: 'portion'
		});
		await vi.waitFor(() => expect(mocks.invalidateAll).toHaveBeenCalled());
		expect(toasts.items.map((item) => item.message)).toContain('Logged Beef stew');
		await vi.waitFor(() => expect(document.querySelector('[data-sheet][data-open]')).toBeNull());
	});

	it('logs grams of a weighed batch', async () => {
		mocks.logBatch.mockResolvedValue({});
		render(AddSheet, { day: dayWith() });
		await openSheet();
		await page.getByRole('button', { name: /Beef stew/ }).click();
		await page.getByRole('radio', { name: 'g', exact: true }).click();
		await page.getByLabelText('Amount').fill('200');
		await page.getByRole('button', { name: 'Log', exact: true }).click();
		expect(mocks.logBatch).toHaveBeenCalledWith({
			date: '2026-11-05',
			batchId: 'batch-stew',
			amount: 200,
			unit: 'g'
		});
	});

	it('keeps the step open with an error when logging fails, and goes back to the search', async () => {
		mocks.logBatch.mockRejectedValue(new Error('offline'));
		render(AddSheet, { day: dayWith() });
		await openSheet();
		await page.getByRole('button', { name: /Beef stew/ }).click();
		await page.getByRole('button', { name: 'Log', exact: true }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Could not save');
		expect(mocks.invalidateAll).not.toHaveBeenCalled();
		await page.getByRole('button', { name: 'Back' }).click();
		await expect.element(page.getByLabelText('Search foods')).toBeVisible();
	});

	it('opens straight at the batch amount step through openBatch, and show() opens the search again', async () => {
		render(AddSheet, { day: dayWith([]) });
		addSheet.openBatch(stew);
		await expect.element(page.getByRole('dialog', { name: 'Beef stew' })).toBeVisible();
		await expect.element(page.getByLabelText('Amount')).toHaveValue('1');
		addSheet.open = false;
		await vi.waitFor(() => expect(document.querySelector('[data-sheet][data-open]')).toBeNull());
		addSheet.show();
		await expect.element(page.getByRole('dialog', { name: 'Add food' })).toBeVisible();
	});
});
