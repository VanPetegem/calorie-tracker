import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { LogEntry } from '#lib/server/db/schema.ts';
import type { DayData } from '#lib/server/log/day.ts';
import { toasts } from '#lib/stores/toasts.svelte.ts';
import DayViewTestHarness from './DayViewTestHarness.svelte';

const mocks = vi.hoisted(() => ({
	invalidateAll: vi.fn(),
	removeEntry: vi.fn(),
	restoreEntry: vi.fn(),
	editAmount: vi.fn(),
	editQuick: vi.fn(),
	logQuick: vi.fn(),
	loadFood: vi.fn()
}));

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: mocks.invalidateAll }));
vi.mock('../../../routes/(app)/log.remote.ts', () => ({
	removeEntry: mocks.removeEntry,
	restoreEntry: mocks.restoreEntry,
	editAmount: mocks.editAmount,
	editQuick: mocks.editQuick,
	logQuick: mocks.logQuick
}));
vi.mock('../../../routes/(app)/foods.remote.ts', () => ({
	loadFood: mocks.loadFood,
	createFood: vi.fn(),
	updateFood: vi.fn()
}));

const entry: LogEntry = {
	id: '0198a000-0000-7000-8000-000000000001',
	date: '2026-11-05',
	loggedAt: '2026-11-05T08:00:00.000Z',
	kind: 'quick',
	foodId: null,
	batchId: null,
	amount: null,
	unit: null,
	grams: null,
	label: 'Porridge',
	kcal: 400,
	protein: 10,
	carbs: 60,
	fat: 8,
	fiber: null,
	deletedAt: null
};

const data: DayData = {
	date: '2026-11-05',
	today: '2026-11-05',
	entries: [entry],
	totals: { kcal: 400, protein: 10, carbs: 60, fat: 8, fiber: null },
	target: null,
	recents: [],
	frequents: [],
	batches: [],
	batchPortionG: {}
};

const row = () => page.getByRole('button', { name: /^Porridge/ });

async function deleteRow() {
	await page.getByRole('button', { name: 'More actions for Porridge' }).click();
	await page
		.getByRole('dialog', { name: 'Porridge' })
		.getByRole('button', { name: 'Delete' })
		.click();
}

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.removeEntry.mockResolvedValue(entry);
	mocks.restoreEntry.mockResolvedValue(undefined);
	mocks.invalidateAll.mockResolvedValue(undefined);
});

afterEach(() => {
	for (const toast of [...toasts.items]) toasts.dismiss(toast.id);
});

describe('DayView delete and undo', () => {
	it('shows Undo as soon as the delete resolves, before the refresh finishes', async () => {
		mocks.invalidateAll.mockReturnValue(new Promise(() => {}));
		render(DayViewTestHarness, { data });
		await deleteRow();
		await expect.element(page.getByText('Deleted Porridge')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
		expect(mocks.invalidateAll).toHaveBeenCalled();
	});

	it('keeps the row hidden and offers Undo when only the refresh fails after a delete', async () => {
		mocks.invalidateAll.mockRejectedValue(new Error('offline'));
		render(DayViewTestHarness, { data });
		await deleteRow();
		await expect.element(page.getByText('Deleted Porridge')).toBeVisible();
		await expect.element(row()).not.toBeInTheDocument();
		expect(page.getByText('Could not delete Porridge').elements()).toHaveLength(0);
		expect(page.getByRole('button', { name: 'Retry' }).elements()).toHaveLength(0);
	});

	it('brings the row back and says nothing is wrong when only the refresh fails after Undo', async () => {
		render(DayViewTestHarness, { data });
		await deleteRow();
		mocks.invalidateAll.mockRejectedValue(new Error('offline'));
		await page.getByRole('button', { name: 'Undo', exact: true }).click();
		await expect.element(row()).toBeVisible();
		expect(mocks.restoreEntry).toHaveBeenCalledWith({ id: entry.id });
		expect(page.getByText('Could not undo. Try again.').elements()).toHaveLength(0);
	});

	it('reports a failed delete with Retry and keeps the row', async () => {
		mocks.removeEntry.mockRejectedValueOnce(new Error('x'));
		render(DayViewTestHarness, { data });
		await deleteRow();
		await expect.element(page.getByText('Could not delete Porridge')).toBeVisible();
		await expect.element(row()).toBeVisible();
		await page.getByRole('button', { name: 'Retry' }).click();
		await expect.element(page.getByText('Deleted Porridge')).toBeVisible();
	});
});

describe('DayView edit', () => {
	const food = {
		id: '0198a000-0000-7000-8000-000000000002',
		name: 'Oats',
		brand: null,
		nutritionBasis: 'g',
		kcal: 250,
		protein: 10,
		carbs: 40,
		fat: 5,
		fiber: 8,
		servingG: 40
	};
	const foodEntry: LogEntry = {
		...entry,
		kind: 'food',
		foodId: food.id,
		amount: 80,
		unit: 'g',
		grams: 80,
		label: 'Oats',
		kcal: 200
	};

	it('opens the amount step for a food entry and saves the new amount', async () => {
		mocks.loadFood.mockResolvedValue(food);
		mocks.editAmount.mockResolvedValue(undefined);
		render(DayViewTestHarness, { data: { ...data, entries: [foodEntry] } });
		await page.getByRole('button', { name: /^Oats/ }).click();
		await expect.element(page.getByLabelText('Amount')).toHaveValue('80');
		await page.getByLabelText('Amount').fill('120');
		await page.getByRole('button', { name: 'Save' }).click();
		expect(mocks.editAmount).toHaveBeenCalledWith({ id: foodEntry.id, amount: 120, unit: 'g' });
		await vi.waitFor(() => expect(mocks.invalidateAll).toHaveBeenCalled());
	});

	it('previews the amount from the stored snapshot, not from the current food', async () => {
		// Logged at 200 kcal per 100 g; the food has since been edited to 250.
		mocks.loadFood.mockResolvedValue(food);
		const stale: LogEntry = { ...foodEntry, kcal: 160, protein: 8 };
		render(DayViewTestHarness, { data: { ...data, entries: [stale] } });
		await page.getByRole('button', { name: /^Oats/ }).click();
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('160 kcal');
		await page.getByLabelText('Amount').fill('100');
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('200 kcal');
	});

	it('opens the quick add form for a quick entry and saves it with editQuick', async () => {
		mocks.editQuick.mockResolvedValue(entry);
		render(DayViewTestHarness, { data });
		await row().click();
		expect(mocks.loadFood).not.toHaveBeenCalled();
		expect(page.getByLabelText('Amount').elements()).toHaveLength(0);
		await expect.element(page.getByLabelText('Calories', { exact: true })).toHaveValue('400');
		await page.getByLabelText('Calories', { exact: true }).fill('450');
		await page.getByRole('button', { name: 'Save' }).click();
		await vi.waitFor(() =>
			expect(mocks.editQuick).toHaveBeenCalledWith(
				expect.objectContaining({ id: entry.id, kcal: 450, label: 'Porridge' })
			)
		);
	});

	describe('with several quick entries', () => {
		const other: LogEntry = {
			...entry,
			id: '0198a000-0000-7000-8000-000000000003',
			label: 'Soup',
			kcal: 220
		};
		const two = { ...data, entries: [entry, other] };
		const calories = () => page.getByLabelText('Calories', { exact: true });

		it("shows the second entry's values and saves them to the second entry", async () => {
			mocks.editQuick.mockResolvedValue(other);
			render(DayViewTestHarness, { data: two });
			await page.getByRole('button', { name: /^Porridge/ }).click();
			await expect.element(calories()).toHaveValue('400');
			await calories().fill('999');
			await page.getByRole('button', { name: 'Close' }).click();
			await expect.element(calories()).not.toBeVisible();

			await page.getByRole('button', { name: /^Soup/ }).click();
			await expect.element(calories()).toHaveValue('220');
			await expect.element(page.getByLabelText('Label (optional)')).toHaveValue('Soup');
			await page.getByRole('button', { name: 'Save' }).click();
			await vi.waitFor(() => expect(mocks.editQuick).toHaveBeenCalled());
			expect(mocks.editQuick).toHaveBeenCalledWith(
				expect.objectContaining({ id: other.id, kcal: 220, label: 'Soup' })
			);
		});

		it('shows the stored values again when the same entry is reopened after closing', async () => {
			render(DayViewTestHarness, { data: two });
			await page.getByRole('button', { name: /^Porridge/ }).click();
			await calories().fill('999');
			await page.getByRole('button', { name: 'Close' }).click();
			await expect.element(calories()).not.toBeVisible();

			await page.getByRole('button', { name: /^Porridge/ }).click();
			await expect.element(calories()).toHaveValue('400');
		});
	});

	describe('a batch entry', () => {
		const BATCH = '0198a000-0000-7000-8000-0000000000b1';
		// 1.5 portions of a stew that was 500 kcal a portion when logged.
		const batchEntry: LogEntry = {
			...entry,
			id: '0198a000-0000-7000-8000-000000000004',
			kind: 'batch',
			batchId: BATCH,
			amount: 1.5,
			unit: 'portion',
			grams: 600,
			label: 'Beef stew',
			kcal: 750,
			protein: 45,
			carbs: 75,
			fat: 30
		};
		const withEntry = (batchEntryRow: LogEntry, portionG: number | null = 400): DayData => ({
			...data,
			entries: [batchEntryRow],
			batchPortionG: { [BATCH]: portionG }
		});
		const stew = () => page.getByRole('button', { name: /^Beef stew/ });
		const grams = () => page.getByRole('radio', { name: 'g', exact: true });

		it('opens the batch amount step from the entry own snapshot and saves a new amount', async () => {
			mocks.editAmount.mockResolvedValue(undefined);
			render(DayViewTestHarness, { data: withEntry(batchEntry) });
			await stew().click();
			expect(mocks.loadFood).not.toHaveBeenCalled();
			await expect.element(page.getByRole('dialog', { name: 'Beef stew' })).toBeVisible();
			await expect.element(page.getByLabelText('Amount')).toHaveValue('1.5');
			await expect.element(page.getByRole('radio', { name: 'portion' })).toBeChecked();
			await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('750 kcal');
			await page.getByLabelText('Amount').fill('2');
			await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('1000 kcal');
			await page.getByRole('button', { name: 'Save' }).click();
			expect(mocks.editAmount).toHaveBeenCalledWith({
				id: batchEntry.id,
				amount: 2,
				unit: 'portion'
			});
			await vi.waitFor(() => expect(mocks.invalidateAll).toHaveBeenCalled());
		});

		it('previews a switch from portions to grams from the entry grams', async () => {
			render(DayViewTestHarness, { data: withEntry(batchEntry) });
			await stew().click();
			await grams().click();
			await expect.element(page.getByLabelText('Amount')).toHaveValue('600');
			await page.getByLabelText('Amount').fill('300');
			await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('375 kcal');
		});

		it("previews a switch from grams to portions with the batch's current portion weight", async () => {
			const byGrams: LogEntry = {
				...batchEntry,
				amount: 200,
				unit: 'g',
				grams: 200,
				kcal: 250,
				protein: 15,
				carbs: 25,
				fat: 10
			};
			// The batch was re-weighed since: a portion is now 500 g, so 200 g is 0.4 portions.
			render(DayViewTestHarness, { data: withEntry(byGrams, 500) });
			await stew().click();
			await page.getByRole('radio', { name: 'portion' }).click();
			await expect.element(page.getByLabelText('Amount')).toHaveValue('0.4');
			await page.getByLabelText('Amount').fill('1');
			await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('625 kcal');
		});

		it('offers only grams for a gram entry whose batch has no portion weight now', async () => {
			const byGrams: LogEntry = { ...batchEntry, amount: 200, unit: 'g', grams: 200, kcal: 250 };
			render(DayViewTestHarness, { data: withEntry(byGrams, null) });
			await stew().click();
			await expect
				.element(page.getByRole('radio', { name: 'portion' }))
				.toHaveAttribute('aria-disabled', 'true');
			await expect.element(page.getByRole('radio', { name: 'g', exact: true })).toBeChecked();
		});

		it('edits an entry without grams in portions only', async () => {
			render(DayViewTestHarness, {
				data: withEntry({ ...batchEntry, amount: 2, grams: null })
			});
			await stew().click();
			await expect.element(grams()).toHaveAttribute('aria-disabled', 'true');
			await expect
				.element(page.getByText('This entry has no weight, so it changes in portions only'))
				.toBeVisible();
			await page.getByLabelText('Amount').fill('1');
			await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('375 kcal');
		});
	});
});
