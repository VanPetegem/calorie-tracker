import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { sampleBatch } from '#lib/components/recipes/batch.fixture.ts';
import type { BatchSummary } from '#lib/server/batches/repo.ts';
import type { RecipeSummary } from '#lib/server/recipes/repo.ts';
import Page from './+page.svelte';

const mocks = vi.hoisted(() => ({ reopenBatch: vi.fn(), invalidateAll: vi.fn() }));

vi.mock('./batches.remote.ts', () => ({ reopenBatch: mocks.reopenBatch }));
vi.mock('$app/navigation', () => ({ invalidateAll: mocks.invalidateAll }));

beforeEach(() => {
	mocks.reopenBatch.mockReset().mockResolvedValue(undefined);
	mocks.invalidateAll.mockReset().mockResolvedValue(undefined);
});

const recipe = (id: string, name: string): RecipeSummary =>
	({
		id,
		name,
		defaultPortions: 4,
		notes: null,
		archivedAt: null,
		ingredientCount: 2,
		totals: { kcal: 1600, protein: 100, carbs: 150, fat: 50, fiber: 10 },
		perPortion: { kcal: 400, protein: 25, carbs: 37.5, fat: 12.5, fiber: 2.5 }
	}) as RecipeSummary;

const show = (
	recipes: RecipeSummary[],
	batches: BatchSummary[] = [],
	finished: BatchSummary[] = []
) => render(Page, { data: { recipes, batches, finished }, params: {}, form: null } as never);

const active = page.getByRole('region', { name: 'Active batches' });

describe('recipes page', () => {
	it('shows the empty state and the New recipe link when there are no recipes', async () => {
		show([]);
		await expect.element(page.getByRole('heading', { name: 'No recipes yet' })).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'New recipe' }))
			.toHaveAttribute('href', '/recipes/new');
	});

	it('lists each recipe as a link to its page with kcal per portion', async () => {
		const id = '0198a000-0000-7000-8000-0000000000aa';
		show([recipe(id, 'Chicken rice')]);
		const row = page.getByRole('link', { name: /Chicken rice/ });
		await expect.element(row).toHaveAttribute('href', `/recipes/${id}`);
		await expect.element(row).toHaveTextContent('400 kcal');
		expect(page.getByRole('heading', { name: 'No recipes yet' }).elements()).toHaveLength(0);
	});
});

describe('recipes page batches', () => {
	it('puts Active batches first, with a link to each batch and a New batch link', async () => {
		show([recipe('r1', 'Chicken rice')], [sampleBatch({ portionsLeft: 2 })]);
		const headings = page.getByRole('heading', { level: 2 }).elements();
		expect(headings.map((h) => h.textContent)).toEqual(['Active batches', 'Recipes']);
		const row = active.getByRole('link', { name: /Beef stew/ });
		await expect.element(row).toHaveAttribute('href', '/recipes/batches/batch-stew');
		await expect.element(row).toHaveTextContent('2 of 4 portions left');
		await expect
			.element(active.getByRole('link', { name: 'New batch' }))
			.toHaveAttribute('href', '/recipes/batches/new');
	});

	it('says there are no active batches, and still offers New batch', async () => {
		show([]);
		await expect.element(active.getByText(/No active batches/)).toBeVisible();
		await expect.element(active.getByRole('link', { name: 'New batch' })).toBeVisible();
	});

	it('has no Finished section without finished batches', async () => {
		show([], [sampleBatch()]);
		expect(page.getByText('Finished', { exact: true }).elements()).toHaveLength(0);
	});

	it('keeps finished batches collapsed, and Reopen reopens one and refreshes', async () => {
		const finished = sampleBatch({
			id: 'batch-old',
			name: 'Old chili',
			finishedAt: '2026-11-01T10:00:00.000Z'
		});
		show([], [], [finished]);
		const link = page.getByRole('link', { name: /Old chili/ });
		await expect.element(page.getByText('Old chili')).not.toBeVisible();
		await page.getByText('Finished', { exact: true }).click();
		await expect.element(link).toBeVisible();
		await expect.element(link).toHaveAttribute('href', '/recipes/batches/batch-old');
		await page.getByRole('button', { name: 'Reopen' }).click();
		await vi.waitFor(() => expect(mocks.reopenBatch).toHaveBeenCalledWith({ id: 'batch-old' }));
		await vi.waitFor(() => expect(mocks.invalidateAll).toHaveBeenCalled());
	});
});
