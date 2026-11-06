import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import BatchRow from './BatchRow.svelte';
import { sampleBatch } from './batch.fixture.ts';

describe('BatchRow', () => {
	it('shows the portions left out of all portions and the kcal per portion', async () => {
		render(BatchRow, { batch: sampleBatch({ portionsLeft: 2.5 }), onpick: vi.fn() });
		await expect.element(page.getByText('2.5 of 4 portions left')).toBeVisible();
		await expect.element(page.getByText('500 kcal')).toBeVisible();
		await expect.element(page.getByText('per portion')).toBeVisible();
		await expect.element(page.getByText('Beef stew')).toBeVisible();
	});

	it('clamps an over logged batch at 0 left', async () => {
		render(BatchRow, { batch: sampleBatch({ portionsLeft: -0.5 }), onpick: vi.fn() });
		await expect.element(page.getByText('0 of 4 portions left')).toBeVisible();
	});

	it('says portion for a single portion batch and rounds the count', async () => {
		render(BatchRow, {
			batch: sampleBatch({ portions: 1, portionsLeft: 0.3333333 }),
			onpick: vi.fn()
		});
		await expect.element(page.getByText('0.3 of 1 portion left')).toBeVisible();
	});

	it('marks a finished batch', async () => {
		render(BatchRow, {
			batch: sampleBatch({ finishedAt: '2026-11-06T09:00:00.000Z', portionsLeft: 1 }),
			onpick: vi.fn()
		});
		await expect.element(page.getByText('Finished · 1 of 4 portions left')).toBeVisible();
	});

	it('is a button that calls onpick with the batch', async () => {
		const onpick = vi.fn();
		const batch = sampleBatch();
		render(BatchRow, { batch, onpick });
		await page.getByRole('button', { name: /Beef stew/ }).click();
		expect(onpick).toHaveBeenCalledWith(batch);
	});

	it('is a link when given an href', async () => {
		render(BatchRow, { batch: sampleBatch(), href: '/recipes/batches/batch-stew' });
		await expect
			.element(page.getByRole('link', { name: /Beef stew/ }))
			.toHaveAttribute('href', '/recipes/batches/batch-stew');
	});
});
