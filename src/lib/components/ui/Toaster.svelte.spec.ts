import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { toasts, withUndo } from '#lib/stores/toasts.svelte.ts';
import Toaster from './Toaster.svelte';

afterEach(() => {
	for (const item of [...toasts.items]) toasts.dismiss(item.id);
});

describe('Toaster', () => {
	it('is a polite live region', async () => {
		const { container } = render(Toaster);
		expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
	});

	it('shows toasts and runs the Undo action from a 44 px button', async () => {
		render(Toaster);
		const revert = vi.fn();
		withUndo({ message: 'Deleted Oats', apply: () => {}, revert });
		await expect.element(page.getByText('Deleted Oats')).toBeVisible();
		const undo = page.getByRole('button', { name: 'Undo' });
		await expect.element(undo).toBeVisible();
		expect(undo.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
		await undo.click();
		expect(revert).toHaveBeenCalledOnce();
		await expect.poll(() => toasts.items.length).toBe(0);
	});

	it('shows at most three toasts', async () => {
		render(Toaster);
		for (const message of ['One', 'Two', 'Three', 'Four']) toasts.show({ message });
		await expect.element(page.getByText('Four')).toBeVisible();
		await expect.element(page.getByText('Two')).toBeVisible();
		expect(toasts.items).toHaveLength(3);
		await expect.element(page.getByText('One')).not.toBeInTheDocument();
	});
});
