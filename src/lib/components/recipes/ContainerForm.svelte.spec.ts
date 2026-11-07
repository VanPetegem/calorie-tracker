import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ContainerForm from './ContainerForm.svelte';

const field = (label: string) => page.getByLabelText(label, { exact: true });

describe('ContainerForm', () => {
	it('checks the name and the tare against the schema when they lose focus', async () => {
		render(ContainerForm, { onsave: vi.fn() });
		await field('Name').click();
		await field('Weight of the empty container').click();
		await expect.element(page.getByText('Enter a value')).toBeVisible();
		await field('Weight of the empty container').fill('10001');
		await field('Name').click();
		await expect.element(page.getByText('Enter at most 10000')).toBeVisible();
	});

	it('does not save an invalid container and shows every error', async () => {
		const onsave = vi.fn();
		render(ContainerForm, { onsave });
		await page.getByRole('button', { name: 'Save container' }).click();
		await expect.element(page.getByText('Enter a value')).toBeVisible();
		await expect.element(page.getByText('Enter a number')).toBeVisible();
		expect(onsave).not.toHaveBeenCalled();
	});

	it('saves the trimmed name and the tare with a decimal comma', async () => {
		const onsave = vi.fn().mockResolvedValue(undefined);
		render(ContainerForm, { onsave });
		await field('Name').fill('  Pot ');
		await field('Weight of the empty container').fill('650,5');
		await page.getByRole('button', { name: 'Save container' }).click();
		await vi.waitFor(() => expect(onsave).toHaveBeenCalledWith({ name: 'Pot', tareG: 650.5 }));
	});

	it('starts from an existing container and sends its id', async () => {
		const onsave = vi.fn().mockResolvedValue(undefined);
		render(ContainerForm, {
			container: { id: '0198a000-0000-7000-8000-0000000000c1', name: 'Pot', tareG: 650 },
			onsave,
			submitLabel: 'Save'
		});
		await expect.element(field('Name')).toHaveValue('Pot');
		await field('Name').fill('Big pot');
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await vi.waitFor(() =>
			expect(onsave).toHaveBeenCalledWith({
				id: '0198a000-0000-7000-8000-0000000000c1',
				name: 'Big pot',
				tareG: 650
			})
		);
	});

	it('keeps the form and offers Retry when the save fails', async () => {
		const onsave = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
		render(ContainerForm, { onsave });
		await field('Name').fill('Pot');
		await field('Weight of the empty container').fill('650');
		await page.getByRole('button', { name: 'Save container' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Could not save');
		await expect.element(field('Name')).toHaveValue('Pot');
		await page.getByRole('button', { name: 'Retry' }).click();
		await vi.waitFor(() => expect(onsave).toHaveBeenCalledTimes(2));
	});

	it('Cancel calls oncancel', async () => {
		const oncancel = vi.fn();
		render(ContainerForm, { onsave: vi.fn(), oncancel });
		await page.getByRole('button', { name: 'Cancel' }).click();
		expect(oncancel).toHaveBeenCalled();
	});
});
