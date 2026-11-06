import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { RecipeDetail } from '#lib/server/recipes/repo.ts';
import Page from './+page.svelte';

vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn(),
	goto: vi.fn(),
	beforeNavigate: vi.fn()
}));
vi.mock('../recipes.remote.ts', () => ({
	saveRecipe: vi.fn(),
	archiveRecipe: vi.fn(),
	restoreRecipe: vi.fn()
}));
vi.mock('../../foods.remote.ts', () => ({
	loadSuggestions: vi
		.fn()
		.mockResolvedValue({ today: '2026-11-06', recents: [], frequents: [], batches: [] }),
	searchFoods: vi.fn(),
	searchOff: vi.fn(),
	pickOff: vi.fn(),
	lookupBarcode: vi.fn(),
	createFood: vi.fn(),
	updateFood: vi.fn()
}));

const RECIPE_ID = '0198a000-0000-7000-8000-0000000000aa';

const show = (archivedAt: string | null) =>
	render(Page, {
		data: {
			recipe: {
				id: RECIPE_ID,
				name: 'Chicken rice',
				defaultPortions: 4,
				notes: null,
				archivedAt,
				ingredientCount: 0,
				ingredients: []
			} as unknown as RecipeDetail
		},
		params: { id: RECIPE_ID },
		form: null
	} as never);

describe('recipe page', () => {
	it('offers Cook batch for a recipe that is not archived', async () => {
		show(null);
		await expect
			.element(page.getByRole('link', { name: 'Cook batch' }))
			.toHaveAttribute('href', `/recipes/batches/new?recipe=${RECIPE_ID}`);
	});

	it('hides Cook batch on an archived recipe', async () => {
		show('2026-11-01T10:00:00.000Z');
		await expect.element(page.getByRole('heading', { name: 'Chicken rice' })).toBeVisible();
		expect(page.getByRole('link', { name: 'Cook batch' }).elements()).toHaveLength(0);
	});
});
