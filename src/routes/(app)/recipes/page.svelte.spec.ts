import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { RecipeSummary } from '#lib/server/recipes/repo.ts';
import Page from './+page.svelte';

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

const show = (recipes: RecipeSummary[]) =>
	render(Page, { data: { recipes }, params: {}, form: null } as never);

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
