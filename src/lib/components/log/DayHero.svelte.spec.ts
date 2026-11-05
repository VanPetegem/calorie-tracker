import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import DayHero from './DayHero.svelte';

const totals = { kcal: 1240, protein: 82, carbs: 150, fat: 40 };
const target = { kcal: 3000, proteinG: 126, fatG: 83, carbsG: 424, carbsFloored: false };

describe('DayHero', () => {
	it('without a target shows kcal and grams eaten, with no bars', async () => {
		render(DayHero, { props: { totals, target: null } });
		await expect.element(page.getByText('1,240', { exact: true })).toBeVisible();
		await expect.element(page.getByText('kcal eaten', { exact: true })).toBeVisible();
		await expect.element(page.getByText('82 g')).toBeVisible();
		await expect.element(page.getByText('150 g')).toBeVisible();
		await expect.element(page.getByText('40 g')).toBeVisible();
		expect(page.getByRole('progressbar').elements()).toHaveLength(0);
	});

	it('under target shows remaining kcal, a calorie bar and three macro bars', async () => {
		render(DayHero, { props: { totals, target } });
		await expect.element(page.getByText('1,760', { exact: true })).toBeVisible();
		await expect.element(page.getByText(/kcal remaining/)).toBeVisible();
		const calories = page.getByRole('progressbar', { name: 'Calories' });
		await expect.element(calories).toHaveAttribute('aria-valuenow', '1240');
		await expect.element(calories).toHaveAttribute('aria-valuemax', '3000');
		for (const name of ['Protein', 'Carbs', 'Fat']) {
			await expect.element(page.getByRole('progressbar', { name })).toBeVisible();
		}
		expect(page.getByText(/over by/i).elements()).toHaveLength(0);
	});

	it('over target says "over by" in the success color, not a warning', async () => {
		render(DayHero, { props: { totals: { ...totals, kcal: 3120 }, target } });
		const over = page.getByText('Over by 120');
		await expect.element(over).toBeVisible();
		expect(over.element().className).toContain('text-success');
		await expect
			.element(page.getByRole('progressbar', { name: 'Calories' }))
			.toHaveAttribute('data-over', 'true');
	});

	it('explains a floored carb target', async () => {
		render(DayHero, { props: { totals, target: { ...target, carbsG: 0, carbsFloored: true } } });
		await expect.element(page.getByText(/carbs have no room left/)).toBeVisible();
	});
});
