import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import NutritionSummary from './NutritionSummary.svelte';

const totals = { kcal: 1000, protein: 60, carbs: 120, fat: 30, fiber: 12 };

describe('NutritionSummary', () => {
	it('shows the totals and per portion values for 1.5 portions', async () => {
		render(NutritionSummary, { totals, portions: 1.5 });
		await expect.element(page.getByTestId('total-kcal')).toHaveTextContent('1000 kcal');
		await expect.element(page.getByTestId('per-portion-kcal')).toHaveTextContent('667 kcal');
		await expect
			.element(page.getByRole('region', { name: /Per portion/ }))
			.toHaveTextContent('Protein 40 g');
		expect(page.getByText('Enter portions to see per portion values').elements()).toHaveLength(0);
	});

	it.each([0, null, Number.NaN])(
		'shows only the totals and a hint for %s portions',
		async (portions) => {
			render(NutritionSummary, { totals, portions });
			await expect.element(page.getByTestId('total-kcal')).toHaveTextContent('1000 kcal');
			await expect
				.element(page.getByText('Enter portions to see per portion values'))
				.toBeVisible();
			expect(page.getByTestId('per-portion-kcal').elements()).toHaveLength(0);
		}
	);

	it('shows values per 100 g only when given', async () => {
		const { rerender } = render(NutritionSummary, { totals, portions: 2 });
		expect(page.getByTestId('per100g-kcal').elements()).toHaveLength(0);
		await rerender({ totals, portions: 2, per100g: { ...totals, kcal: 250 } });
		await expect.element(page.getByTestId('per100g-kcal')).toHaveTextContent('250 kcal');
	});

	it('announces the hint from one status node that stays while the portions change', async () => {
		const { rerender } = render(NutritionSummary, { totals, portions: 2 });
		const status = page.getByRole('status');
		const node = status.element();
		await expect.element(status).toHaveTextContent('');
		await rerender({ totals, portions: 0 });
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent('Enter portions to see per portion values');
		expect(page.getByRole('status').element()).toBe(node);
	});
});
