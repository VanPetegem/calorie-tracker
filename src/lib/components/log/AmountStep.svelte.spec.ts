import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { Food } from '#lib/server/db/schema.ts';
import AmountStep from './AmountStep.svelte';

type TestFood = Pick<
	Food,
	'name' | 'brand' | 'nutritionBasis' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'servingG'
>;

const oats: TestFood = {
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

const plain: TestFood = { ...oats, servingG: null };
const juice: TestFood = { ...plain, name: 'Juice', nutritionBasis: 'ml' };

function props(food = oats, extra: Record<string, unknown> = {}) {
	return { food, mode: 'add' as const, onsubmit: vi.fn(), ...extra };
}

const amountField = () => page.getByLabelText('Amount');

describe('AmountStep', () => {
	it('starts at one serving for a food with a serving weight', async () => {
		render(AmountStep, props());
		await expect.element(amountField()).toHaveValue('1');
		await expect.element(page.getByRole('radio', { name: 'serving' })).toBeChecked();
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('100 kcal');
	});

	it('previews 1,5 servings of a 40 g serving as 60 g worth of kcal', async () => {
		render(AmountStep, props());
		await amountField().fill('1,5');
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('150 kcal');
		await expect.element(page.getByText('60 g')).toBeVisible();
	});

	it('starts at 100 g without a serving weight and offers no serving unit', async () => {
		render(AmountStep, props(plain));
		await expect.element(amountField()).toHaveValue('100');
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('250 kcal');
		expect(page.getByRole('radio', { name: 'serving' }).elements()).toHaveLength(0);
	});

	it('labels the base unit ml for a liquid', async () => {
		render(AmountStep, props(juice));
		await expect.element(page.getByRole('radio', { name: 'ml' })).toBeChecked();
	});

	it('keeps the grams when the unit is switched', async () => {
		render(AmountStep, props(oats, { initial: { amount: 80, unit: 'g' } }));
		await page.getByRole('radio', { name: 'serving' }).click();
		await expect.element(amountField()).toHaveValue('2');
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('200 kcal');
	});

	it('submits the typed amount and unit', async () => {
		const p = props();
		render(AmountStep, p);
		await amountField().fill('2,5');
		await page.getByRole('button', { name: 'Log' }).click();
		expect(p.onsubmit).toHaveBeenCalledWith({ amount: 2.5, unit: 'serving' });
	});

	it('submits on Enter', async () => {
		const p = props(plain);
		render(AmountStep, p);
		await amountField().fill('200');
		await userEvent.keyboard('{Enter}');
		expect(p.onsubmit).toHaveBeenCalledWith({ amount: 200, unit: 'g' });
	});

	it('blocks an empty or invalid amount', async () => {
		const p = props(plain);
		render(AmountStep, p);
		await amountField().fill('abc');
		await expect.element(page.getByTestId('preview-kcal')).toHaveTextContent('0 kcal');
		await page.getByRole('button', { name: 'Log' }).click({ force: true });
		expect(p.onsubmit).not.toHaveBeenCalled();
	});

	it('flags an amount above the limit of the unit', async () => {
		render(AmountStep, props());
		await amountField().fill('51');
		await amountField().element().blur();
		await expect.element(page.getByText('Too much for this unit')).toBeVisible();
	});

	it('says Save in edit mode', async () => {
		render(AmountStep, props(oats, { mode: 'edit' }));
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeVisible();
	});

	it('shows an error when submitting fails and lets the person try again', async () => {
		const onsubmit = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(undefined);
		render(AmountStep, props(oats, { onsubmit }));
		await page.getByRole('button', { name: 'Log' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Could not save');
		await page.getByRole('button', { name: 'Log' }).click();
		expect(onsubmit).toHaveBeenCalledTimes(2);
	});
});
