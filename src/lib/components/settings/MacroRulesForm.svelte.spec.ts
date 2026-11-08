import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import MacroRulesForm from './MacroRulesForm.svelte';

const value = { proteinGPerKg: 1.8, fatPct: 0.25, energyDensity: 5000 };

describe('MacroRulesForm', () => {
	it('shows the saved rules with fat as a percent, and energy density under Advanced', async () => {
		render(MacroRulesForm, { value, onsave: vi.fn() });
		await expect.element(page.getByLabelText('Protein per kg')).toHaveValue('1.8');
		await expect.element(page.getByLabelText('Fat share of kcal')).toHaveValue('25');
		// Collapsed: the energy density field is not in the accessibility tree until Advanced opens.
		expect(page.getByRole('textbox', { name: 'Energy density' }).elements()).toHaveLength(0);
		await page.getByText('Advanced').click();
		await expect.element(page.getByLabelText('Energy density')).toHaveValue('5000');
	});

	it('saves fat as a share of kcal and reads a comma decimal', async () => {
		const onsave = vi.fn().mockResolvedValue(undefined);
		render(MacroRulesForm, { value, onsave });
		await page.getByLabelText('Protein per kg').fill('2,0');
		await page.getByLabelText('Fat share of kcal').fill('30');
		await page.getByRole('button', { name: 'Save rules' }).click();
		await vi.waitFor(() =>
			expect(onsave).toHaveBeenCalledWith({ proteinGPerKg: 2, fatPct: 0.3, energyDensity: 5000 })
		);
	});

	it('checks each field when it loses focus, in its own units', async () => {
		render(MacroRulesForm, { value, onsave: vi.fn() });
		await page.getByLabelText('Protein per kg').fill('0.9');
		await page.getByLabelText('Fat share of kcal').click();
		await expect.element(page.getByText('Enter at least 1.2')).toBeVisible();
		await page.getByLabelText('Fat share of kcal').fill('50');
		await page.getByLabelText('Protein per kg').click();
		await expect.element(page.getByText('Enter a percent from 15 to 40')).toBeVisible();
	});

	it('does not save while a field is out of range', async () => {
		const onsave = vi.fn().mockResolvedValue(undefined);
		render(MacroRulesForm, { value, onsave });
		await page.getByLabelText('Fat share of kcal').fill('50');
		await page.getByRole('button', { name: 'Save rules' }).click();
		await expect.element(page.getByText('Enter a percent from 15 to 40')).toBeVisible();
		expect(onsave).not.toHaveBeenCalled();
	});

	it('opens Advanced to show an energy density that is out of range', async () => {
		const onsave = vi.fn().mockResolvedValue(undefined);
		render(MacroRulesForm, { value, onsave });
		await page.getByText('Advanced').click();
		await page.getByLabelText('Energy density').fill('9000');
		await page.getByText('Advanced').click();
		await page.getByRole('button', { name: 'Save rules' }).click();
		await expect.element(page.getByText('Enter at most 7700')).toBeVisible();
		expect(onsave).not.toHaveBeenCalled();
	});

	it('keeps the values and offers Retry when saving fails', async () => {
		const onsave = vi.fn().mockRejectedValue(new Error('offline'));
		render(MacroRulesForm, { value, onsave });
		await page.getByLabelText('Protein per kg').fill('2');
		await page.getByRole('button', { name: 'Save rules' }).click();
		await expect.element(page.getByRole('button', { name: 'Retry' })).toBeVisible();
		await expect.element(page.getByLabelText('Protein per kg')).toHaveValue('2');
	});
});
