import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { sampleBatch } from '../recipes/batch.fixture.ts';
import FoodSearch from './FoodSearch.svelte';

vi.mock('../../../routes/(app)/foods.remote.ts', () => ({
	searchFoods: vi.fn().mockResolvedValue([]),
	searchOff: vi.fn(),
	pickOff: vi.fn()
}));

const base = {
	recents: [],
	frequents: [],
	active: false,
	onpick: vi.fn(),
	onnew: vi.fn(),
	onscan: vi.fn()
};

describe('FoodSearch quick actions', () => {
	it('offers Quick add, New food and Scan when onquick is given', async () => {
		const onquick = vi.fn();
		render(FoodSearch, { ...base, onquick });
		await page.getByRole('button', { name: 'Quick add' }).click();
		expect(onquick).toHaveBeenCalledOnce();
		await expect.element(page.getByRole('button', { name: 'New food' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Scan' })).toBeVisible();
	});

	it('hides Quick add without onquick and keeps New food and Scan', async () => {
		render(FoodSearch, base);
		await expect.element(page.getByRole('button', { name: 'New food' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Scan' })).toBeVisible();
		expect(page.getByRole('button', { name: 'Quick add' }).elements()).toHaveLength(0);
	});
});

/** True when `a` comes before `b` in the document. */
const isBefore = (a: Element, b: Element) =>
	Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('FoodSearch batches', () => {
	const stew = sampleBatch();
	const curry = sampleBatch({ id: 'batch-curry', name: 'Lentil curry', portionsLeft: 0 });

	it('lists the active batches above the quick actions while the search is empty', async () => {
		const onbatch = vi.fn();
		render(FoodSearch, { ...base, onquick: vi.fn(), batches: [stew, curry], onbatch });
		const stewRow = page.getByRole('button', { name: /Beef stew/ });
		const curryRow = page.getByRole('button', { name: /Lentil curry/ });
		await expect.element(stewRow).toBeVisible();
		await expect.element(curryRow).toBeVisible();
		await expect.element(page.getByText('0 of 4 portions left')).toBeVisible();
		expect(isBefore(stewRow.element(), curryRow.element())).toBe(true);
		expect(
			isBefore(curryRow.element(), page.getByRole('button', { name: 'Quick add' }).element())
		).toBe(true);
		await stewRow.click();
		expect(onbatch).toHaveBeenCalledWith(stew);
	});

	it('lists them above recents too', async () => {
		render(FoodSearch, {
			...base,
			batches: [stew],
			onbatch: vi.fn(),
			recents: [
				{
					id: 'food-1',
					source: 'custom',
					barcode: null,
					name: 'Oats',
					brand: null,
					nutritionBasis: 'g',
					kcal: 372,
					protein: 13,
					carbs: 58,
					fat: 7,
					fiber: 10,
					servingG: null,
					sourceRef: null,
					searchText: 'oats',
					fetchedAt: null,
					editedAt: null,
					archivedAt: null,
					createdAt: '2026-11-01T08:00:00.000Z',
					updatedAt: '2026-11-01T08:00:00.000Z',
					lastAmount: 40,
					lastUnit: 'g'
				}
			]
		});
		const batchRow = page.getByRole('button', { name: /Beef stew/ }).element();
		const recent = page.getByRole('button', { name: /Oats/ }).element();
		expect(isBefore(batchRow, recent)).toBe(true);
	});

	it('hides them once something is typed', async () => {
		render(FoodSearch, { ...base, batches: [stew], onbatch: vi.fn() });
		await expect.element(page.getByRole('button', { name: /Beef stew/ })).toBeVisible();
		await page.getByLabelText('Search foods').fill('rice');
		expect(page.getByRole('button', { name: /Beef stew/ }).elements()).toHaveLength(0);
	});

	it('shows no batch section without batches', async () => {
		render(FoodSearch, base);
		expect(page.getByRole('region', { name: 'Batches' }).elements()).toHaveLength(0);
	});
});
