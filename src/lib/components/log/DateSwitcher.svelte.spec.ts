import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import DateSwitcher from './DateSwitcher.svelte';

const today = '2026-11-05';

describe('DateSwitcher', () => {
	it('names today, yesterday and tomorrow, and formats other days', async () => {
		const view = render(DateSwitcher, { date: today, today, onselect: () => {} });
		await expect.element(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
		await view.rerender({ date: '2026-11-04', today, onselect: () => {} });
		await expect.element(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible();
		await view.rerender({ date: '2026-11-06', today, onselect: () => {} });
		await expect.element(page.getByRole('heading', { name: 'Tomorrow' })).toBeVisible();
		await view.rerender({ date: '2026-10-30', today, onselect: () => {} });
		await expect.element(page.getByRole('heading', { name: 'Fri 30 Oct' })).toBeVisible();
	});

	it('goes to the previous and next day', async () => {
		const onselect = vi.fn();
		render(DateSwitcher, { date: today, today, onselect });
		await page.getByRole('button', { name: 'Previous day' }).click();
		expect(onselect).toHaveBeenLastCalledWith('2026-11-04');
		await page.getByRole('button', { name: 'Next day' }).click();
		expect(onselect).toHaveBeenLastCalledWith('2026-11-06');
	});

	it('disables next on tomorrow and says why', async () => {
		const onselect = vi.fn();
		render(DateSwitcher, { date: '2026-11-06', today, onselect });
		await expect.element(page.getByRole('button', { name: 'Next day' })).toBeDisabled();
		await expect.element(page.getByText('You can log up to tomorrow.')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Previous day' })).toBeEnabled();
	});

	it('keeps next enabled before tomorrow', async () => {
		render(DateSwitcher, { date: today, today, onselect: () => {} });
		await expect.element(page.getByRole('button', { name: 'Next day' })).toBeEnabled();
		expect(page.getByText('You can log up to tomorrow.').elements()).toHaveLength(0);
	});
});
