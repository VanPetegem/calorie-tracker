import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { Food } from '#lib/server/db/schema.ts';
import FoodForm from './FoodForm.svelte';

const mocks = vi.hoisted(() => ({
	invalidateAll: vi.fn(),
	createFood: vi.fn(),
	updateFood: vi.fn()
}));

vi.mock('$app/navigation', () => ({ invalidateAll: mocks.invalidateAll }));
vi.mock('../../../routes/(app)/foods.remote.ts', () => ({
	createFood: mocks.createFood,
	updateFood: mocks.updateFood
}));

const saved = { id: 'food-1', name: 'Oats', kcal: 370 } as Food;

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.invalidateAll.mockResolvedValue(undefined);
	mocks.createFood.mockResolvedValue({ ok: true, food: saved });
	mocks.updateFood.mockResolvedValue({ ok: true, food: saved });
});

const field = (label: string) => page.getByLabelText(label, { exact: true });

async function fillRequired(extra: Record<string, string> = {}) {
	const values = {
		Name: 'Oats',
		Calories: '370',
		Protein: '12,5',
		Carbs: '59',
		Fat: '7',
		...extra
	};
	for (const [label, value] of Object.entries(values)) await field(label).fill(value);
}

describe('FoodForm validation', () => {
	it('rejects 901 kcal on blur and accepts 900', async () => {
		render(FoodForm, { onsaved: vi.fn() });
		await field('Calories').fill('901');
		await expect.element(page.getByText('Enter at most 900')).not.toBeInTheDocument();
		await field('Calories').element().blur();
		await expect.element(page.getByText('Enter at most 900')).toBeVisible();
		await field('Calories').fill('900');
		await field('Calories').element().blur();
		await expect.element(page.getByText('Enter at most 900')).not.toBeInTheDocument();
	});

	it('accepts a comma decimal on blur', async () => {
		render(FoodForm, { onsaved: vi.fn() });
		await field('Protein').fill('12,5');
		await field('Protein').element().blur();
		expect(page.getByRole('alert').elements()).toHaveLength(0);
	});

	it('says "Enter a number" for text in an optional field such as fiber', async () => {
		render(FoodForm, { onsaved: vi.fn() });
		await field('Fiber (optional)').fill('abc');
		await field('Fiber (optional)').element().blur();
		await expect.element(page.getByText('Enter a number')).toBeVisible();
	});

	it('does not save while a field is invalid and shows every error', async () => {
		render(FoodForm, { onsaved: vi.fn() });
		await page.getByRole('button', { name: 'Save food' }).click();
		await expect.element(page.getByText('Enter a value')).toBeVisible();
		expect(mocks.createFood).not.toHaveBeenCalled();
	});
});

describe('FoodForm saving', () => {
	it('creates a food and hands it to onsaved', async () => {
		const onsaved = vi.fn();
		render(FoodForm, { onsaved });
		await fillRequired();
		await page.getByRole('button', { name: 'Save food' }).click();
		await vi.waitFor(() => expect(onsaved).toHaveBeenCalledWith(saved));
		expect(mocks.createFood).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'Oats', kcal: 370, protein: 12.5, nutritionBasis: 'g' })
		);
		expect(mocks.invalidateAll).toHaveBeenCalled();
	});

	it('prefills from initial, such as a barcode from the miss flow', async () => {
		render(FoodForm, { onsaved: vi.fn(), initial: { barcode: '7612345678900', name: 'Muesli' } });
		await expect.element(field('Barcode (optional)')).toHaveValue('7612345678900');
		await expect.element(field('Name')).toHaveValue('Muesli');
	});

	it('updates an existing food and says past days keep their values', async () => {
		const onsaved = vi.fn();
		render(FoodForm, {
			onsaved,
			foodId: 'food-1',
			initial: { name: 'Oats', kcal: 370, protein: 12.5, carbs: 59, fat: 7, nutritionBasis: 'g' }
		});
		await expect.element(page.getByText(/Days you already logged keep their values/)).toBeVisible();
		await field('Calories').fill('380');
		await page.getByRole('button', { name: 'Save food' }).click();
		await vi.waitFor(() => expect(onsaved).toHaveBeenCalled());
		expect(mocks.updateFood).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'food-1', kcal: 380 })
		);
	});

	it('names the food that already has the barcode and does not call onsaved', async () => {
		mocks.createFood.mockResolvedValue({
			ok: false,
			reason: 'barcode_taken',
			food: { ...saved, name: 'Nutella' }
		});
		const onsaved = vi.fn();
		render(FoodForm, { onsaved });
		await fillRequired({ 'Barcode (optional)': '3017620422003' });
		await page.getByRole('button', { name: 'Save food' }).click();
		await expect.element(page.getByText(/already in your library as Nutella/)).toBeVisible();
		expect(onsaved).not.toHaveBeenCalled();
		await field('Barcode (optional)').fill('3017620422004');
		await expect.element(page.getByText(/already in your library/)).not.toBeInTheDocument();
	});

	it('shows an inline error when saving fails and keeps the values', async () => {
		mocks.createFood.mockRejectedValue(new Error('offline'));
		render(FoodForm, { onsaved: vi.fn() });
		await fillRequired();
		await page.getByRole('button', { name: 'Save food' }).click();
		await expect.element(page.getByText('Could not save. Try again.')).toBeVisible();
		await expect.element(field('Name')).toHaveValue('Oats');
	});

	it('does not call a failed refresh after a successful save a failure', async () => {
		mocks.invalidateAll.mockRejectedValue(new Error('offline'));
		const onsaved = vi.fn();
		render(FoodForm, { onsaved });
		await fillRequired();
		await page.getByRole('button', { name: 'Save food' }).click();
		await vi.waitFor(() => expect(onsaved).toHaveBeenCalled());
		expect(page.getByText('Could not save. Try again.').elements()).toHaveLength(0);
	});
});
