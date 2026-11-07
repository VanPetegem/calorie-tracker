import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import WeightRow from './WeightRow.svelte';

const point = { date: '2026-11-05', kg: 71.24, trend: 70.86 };

describe('WeightRow', () => {
	it('shows the date, the weight and the trend', async () => {
		render(WeightRow, { point, onedit: () => {}, ondelete: () => {} });
		await expect.element(page.getByText('Thu 5 Nov 2026')).toBeVisible();
		await expect.element(page.getByText('71.2 kg')).toBeVisible();
		await expect.element(page.getByText('Trend 70.9 kg')).toBeVisible();
	});

	it('edits on a tap of the row, and deletes only from its own button', async () => {
		const onedit = vi.fn();
		const ondelete = vi.fn();
		render(WeightRow, { point, onedit, ondelete });
		await page.getByRole('button', { name: /^Thu 5 Nov 2026/ }).click();
		expect(onedit).toHaveBeenCalledWith(point);
		expect(ondelete).not.toHaveBeenCalled();
		await page.getByRole('button', { name: 'Delete weigh-in of Thu 5 Nov 2026' }).click();
		expect(ondelete).toHaveBeenCalledWith(point);
		expect(onedit).toHaveBeenCalledTimes(1);
	});
});
