import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { sampleBatch } from '#lib/components/recipes/batch.fixture.ts';
import type { BatchDetail, BatchDetailIngredient } from '#lib/server/batches/repo.ts';
import Page from './+page.svelte';

const mocks = vi.hoisted(() => ({ invalidateAll: vi.fn(), saveBatch: vi.fn() }));

vi.mock('$app/navigation', () => ({
	invalidateAll: mocks.invalidateAll,
	goto: vi.fn(),
	beforeNavigate: vi.fn()
}));
vi.mock('../../batches.remote.ts', () => ({
	saveBatch: mocks.saveBatch,
	finishBatch: vi.fn(),
	reopenBatch: vi.fn(),
	deleteBatch: vi.fn(),
	saveContainer: vi.fn()
}));
vi.mock('../../../foods.remote.ts', () => ({
	loadSuggestions: vi
		.fn()
		.mockResolvedValue({ today: '2026-11-06', recents: [], frequents: [], batches: [] }),
	searchFoods: vi.fn(),
	searchOff: vi.fn(),
	pickOff: vi.fn(),
	lookupBarcode: vi.fn(),
	createFood: vi.fn(),
	updateFood: vi.fn(),
	readLabel: vi.fn()
}));

const BATCH_ID = '0198a000-0000-7000-8000-0000000000bb';
const L1 = '0198a000-0000-7000-8000-0000000001a1';
const L2 = '0198a000-0000-7000-8000-0000000001a2';

const line = (id: string, name: string): BatchDetailIngredient => ({
	id,
	batchId: BATCH_ID,
	foodId: null,
	name,
	amount: 100,
	unit: 'g',
	grams: 100,
	kcal: 200,
	protein: 20,
	carbs: 0,
	fat: 12,
	fiber: null,
	position: 0,
	food: null,
	servingG: null
});

const batch = (
	ids: string[],
	overrides: Partial<BatchDetail> = {}
): { batch: BatchDetail; containers: [] } => ({
	batch: {
		...sampleBatch({ id: BATCH_ID }),
		liveEntryCount: 0,
		ingredients: ids.map((id) => line(id, id === L1 ? 'Line one' : 'Line two')),
		...overrides
	},
	containers: []
});

const name = () => page.getByLabelText('Name', { exact: true });

beforeEach(() => {
	mocks.invalidateAll.mockReset().mockResolvedValue(undefined);
	mocks.saveBatch.mockReset();
});

describe('batch page', () => {
	it('mounts a fresh form when a save gave new lines their ids', async () => {
		const view = render(Page, { data: batch([L1]), params: { id: BATCH_ID } } as never);
		await name().fill('Typed name');
		await view.rerender({ data: batch([L1, L2]), params: { id: BATCH_ID } } as never);
		// A new form starts from the stored batch again.
		await expect.element(name()).toHaveValue('Beef stew');
		await expect.element(page.getByRole('button', { name: /^Line two/ })).toBeVisible();
	});

	it('keeps the form when only finishedAt or the portions left change', async () => {
		const view = render(Page, { data: batch([L1]), params: { id: BATCH_ID } } as never);
		await name().fill('Typed name');
		await view.rerender({
			data: batch([L1], { finishedAt: '2026-11-06T10:00:00.000Z', portionsLeft: 1 }),
			params: { id: BATCH_ID }
		} as never);
		await expect
			.element(page.getByTestId('portions-left'))
			.toHaveTextContent('1 of 4 portions left');
		await expect.element(name()).toHaveValue('Typed name');
	});

	it('puts focus on Save of the fresh form after a save that gave new lines their ids', async () => {
		mocks.saveBatch.mockImplementationOnce(
			() => new Promise((resolve) => setTimeout(() => resolve({ ok: true, id: BATCH_ID }), 100))
		);
		const view = render(Page, { data: batch([L1]), params: { id: BATCH_ID } } as never);
		mocks.invalidateAll.mockImplementationOnce(() =>
			view.rerender({ data: batch([L1, L2]), params: { id: BATCH_ID } } as never)
		);
		await page.getByRole('button', { name: 'Save batch' }).click();
		await expect.element(page.getByRole('button', { name: /^Line two/ })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Save batch' })).toHaveFocus();
	});
});
