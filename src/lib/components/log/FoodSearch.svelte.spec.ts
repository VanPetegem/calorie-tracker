import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import FoodSearch from './FoodSearch.svelte';

vi.mock('../../../routes/(app)/foods.remote.ts', () => ({
	searchFoods: vi.fn(),
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
