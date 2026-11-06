import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { Container } from '#lib/server/db/schema.ts';
import WeightFieldTestHarness from './WeightFieldTestHarness.svelte';

const pot: Container = {
	id: '0198a000-0000-7000-8000-0000000000c1',
	name: 'Pot',
	tareG: 650,
	createdAt: '2026-11-06T09:00:00.000Z'
};
const box: Container = {
	...pot,
	id: '0198a000-0000-7000-8000-0000000000c2',
	name: 'Box',
	tareG: 200
};

const show = (props: { value?: number | null; containers?: Container[] } = {}) => {
	const oncreatecontainer = vi.fn(async (input) => ({
		...pot,
		id: '0198a000-0000-7000-8000-0000000000c3',
		...input
	}));
	render(WeightFieldTestHarness, { containers: [pot, box], oncreatecontainer, ...props });
	return { oncreatecontainer };
};

const value = () => page.getByTestId('value');
const problem = () => page.getByTestId('problem');

describe('WeightField', () => {
	it('without a container the typed weight is the net weight', async () => {
		show();
		await expect.element(value()).toHaveTextContent('none');
		await page.getByLabelText('Cooked weight').fill('1200,5');
		await expect.element(value()).toHaveTextContent('1200.5');
		await page.getByLabelText('Cooked weight').fill('');
		await expect.element(value()).toHaveTextContent('none');
		await expect.element(problem()).toHaveTextContent('none');
	});

	it('starts from the net weight a batch already has', async () => {
		show({ value: 1600 });
		await expect.element(page.getByLabelText('Cooked weight')).toHaveValue('1600');
		await expect.element(value()).toHaveTextContent('1600');
	});

	it('gross 1850 with a 650 g pot gives 1200 g net', async () => {
		show();
		await page.getByLabelText('Container').selectOptions(pot.id);
		await page.getByLabelText('Weight on the scale').fill('1850');
		await expect.element(page.getByText('Net weight 1200 g')).toBeVisible();
		await expect.element(value()).toHaveTextContent('1200');
	});

	it('shows the error and no value when the gross weight is at or below the tare', async () => {
		show();
		await page.getByLabelText('Container').selectOptions(pot.id);
		await page.getByLabelText('Weight on the scale').fill('600');
		await userEvent.tab();
		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent('More than the container, 650 g');
		await expect.element(value()).toHaveTextContent('none');
		await expect.element(problem()).toHaveTextContent('More than the container, 650 g');
		// Choosing the lighter box makes the same weight valid: 600 - 200 = 400.
		await page.getByLabelText('Container').selectOptions(box.id);
		await expect.element(value()).toHaveTextContent('400');
		await expect.element(problem()).toHaveTextContent('none');
	});

	it('reports a number that is not one, and a weight over the limit', async () => {
		show();
		await page.getByLabelText('Cooked weight').fill('abc');
		await expect.element(problem()).toHaveTextContent('Enter a number');
		await page.getByLabelText('Cooked weight').fill('20001');
		await expect.element(problem()).toHaveTextContent('Enter at most 20000');
		await expect.element(value()).toHaveTextContent('none');
	});

	it('creates a container inline and selects it', async () => {
		const { oncreatecontainer } = show({ containers: [] });
		await page.getByRole('button', { name: 'New container' }).click();
		await page.getByLabelText('Name').fill('Dutch oven');
		await page.getByLabelText('Weight of the empty container').fill('4200');
		await page.getByRole('button', { name: 'Save container' }).click();
		expect(oncreatecontainer).toHaveBeenCalledWith({ name: 'Dutch oven', tareG: 4200 });
		await expect.element(page.getByLabelText('Container')).toHaveDisplayValue('Dutch oven, 4200 g');
		await expect.element(page.getByLabelText('Weight on the scale')).toBeVisible();
		await page.getByLabelText('Weight on the scale').fill('5000');
		await expect.element(value()).toHaveTextContent('800');
	});
});
