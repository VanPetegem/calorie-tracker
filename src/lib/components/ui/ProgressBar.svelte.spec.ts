import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ProgressBar from './ProgressBar.svelte';

describe('ProgressBar', () => {
	it('exposes aria values and a partial fill', async () => {
		render(ProgressBar, { value: 500, max: 2000, label: 'Calories' });
		const bar = page.getByRole('progressbar', { name: 'Calories' });
		await expect.element(bar).toHaveAttribute('aria-valuenow', '500');
		await expect.element(bar).toHaveAttribute('aria-valuemax', '2000');
		expect(bar.element().getAttribute('data-over')).not.toBe('true');
		const fill = bar.element().querySelector<HTMLElement>('[data-fill]')!;
		expect(fill.style.width).toBe('25%');
	});

	it('clamps the fill to 100% and flags data-over when above max', async () => {
		render(ProgressBar, { value: 2500, max: 2000, label: 'Calories' });
		const bar = page.getByRole('progressbar', { name: 'Calories' });
		await expect.element(bar).toHaveAttribute('aria-valuenow', '2500');
		await expect.element(bar).toHaveAttribute('data-over', 'true');
		const fill = bar.element().querySelector<HTMLElement>('[data-fill]')!;
		expect(fill.style.width).toBe('100%');
	});
});
