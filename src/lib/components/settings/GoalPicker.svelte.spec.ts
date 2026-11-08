import { error } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import GoalPicker from './GoalPicker.svelte';

describe('GoalPicker', () => {
	it('shows the kg per week each preset means at the trend', async () => {
		render(GoalPicker, { value: 0.35, trendKg: 70.4, onsave: vi.fn() });
		await expect.element(page.getByText('+0.18 kg/week', { exact: true })).toBeVisible();
		await expect.element(page.getByText('+0.25 kg/week', { exact: true })).toBeVisible();
		await expect.element(page.getByText('+0.35 kg/week', { exact: true })).toBeVisible();
	});

	it('shows the percent only while there is no trend', async () => {
		render(GoalPicker, { value: 0.35, trendKg: null, onsave: vi.fn() });
		await expect.element(page.getByRole('radio', { name: /^0\.25 %/ })).toBeVisible();
		expect(page.getByText(/kg\/week/).elements()).toHaveLength(0);
	});

	it('keeps Save off until another rate is chosen', async () => {
		render(GoalPicker, { value: 0.35, trendKg: 70.4, onsave: vi.fn() });
		const save = page.getByRole('button', { name: 'Save goal' });
		await expect.element(save).toBeDisabled();
		await page.getByRole('radio', { name: /^0\.5 %/ }).click();
		await expect.element(save).toBeEnabled();
	});

	it('saves the chosen rate', async () => {
		const onsave = vi.fn().mockResolvedValue(undefined);
		render(GoalPicker, { value: 0.35, trendKg: 70.4, onsave });
		await page.getByRole('radio', { name: /^0\.5 %/ }).click();
		await page.getByRole('button', { name: 'Save goal' }).click();
		await vi.waitFor(() => expect(onsave).toHaveBeenCalledWith(0.5));
	});

	it('keeps the choice and offers Retry when saving fails', async () => {
		const onsave = vi.fn().mockRejectedValue(new Error('offline'));
		render(GoalPicker, { value: 0.35, trendKg: 70.4, onsave });
		await page.getByRole('radio', { name: /^0\.5 %/ }).click();
		await page.getByRole('button', { name: 'Save goal' }).click();
		await expect.element(page.getByRole('button', { name: 'Retry' })).toBeVisible();
		await expect.element(page.getByRole('radio', { name: /^0\.5 %/ })).toBeChecked();
	});

	it('shows the reason the server rejected the rate with', async () => {
		const onsave = vi.fn(async () => error(400, 'Add a weigh-in first'));
		render(GoalPicker, { value: 0.35, trendKg: 70.4, onsave });
		await page.getByRole('radio', { name: /^0\.5 %/ }).click();
		await page.getByRole('button', { name: 'Save goal' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Add a weigh-in first');
	});
});
