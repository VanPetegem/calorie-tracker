import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { addSheet } from '#lib/stores/add-sheet.svelte.ts';
import AddSheet from './AddSheet.svelte';

const mocks = vi.hoisted(() => ({
	loadSuggestions: vi.fn(),
	searchFoods: vi.fn(),
	logQuick: vi.fn()
}));

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
vi.mock('../../../routes/(app)/log.remote.ts', () => ({
	logFood: vi.fn(),
	logQuick: mocks.logQuick,
	editQuick: vi.fn()
}));

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
});

// The store is shared by every test: close the sheet and wait for its exit transition before the next test opens it.
afterEach(async () => {
	addSheet.open = false;
	await vi.waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull());
});

async function openQuickAdd() {
	addSheet.show();
	await expect.element(page.getByRole('dialog', { name: 'Add food' })).toBeVisible();
	// Clicking while the sheet still slides in can land on the backdrop and close it.
	await vi.waitFor(() =>
		expect(document.querySelector('dialog[open]')?.getAnimations({ subtree: true })).toHaveLength(0)
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
