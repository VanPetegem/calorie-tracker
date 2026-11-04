import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import SheetTestHarness from './SheetTestHarness.svelte';

const state = () => page.getByTestId('state');
const dialogEl = () => document.querySelector('dialog') as HTMLDialogElement;

async function openSheet() {
	await page.getByRole('button', { name: 'Open sheet' }).click();
	await expect.element(page.getByRole('dialog', { name: 'Delete entry' })).toBeVisible();
}

describe('Sheet', () => {
	it('shows a dialog named by its title when open becomes true', async () => {
		render(SheetTestHarness);
		expect(dialogEl().open).toBe(false);
		await openSheet();
		expect(dialogEl().open).toBe(true);
		await expect.element(page.getByText('This removes it from today.')).toBeVisible();
		await expect.element(state()).toHaveTextContent('open');
	});

	it('closes on Escape and sets open to false', async () => {
		const onclose = vi.fn();
		render(SheetTestHarness, { onclose });
		await openSheet();
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => dialogEl().open, { timeout: 3000 }).toBe(false);
		await expect.element(state()).toHaveTextContent('closed');
		expect(onclose).toHaveBeenCalledOnce();
	});

	it('closes on a backdrop click', async () => {
		render(SheetTestHarness);
		await openSheet();
		const rect = dialogEl().getBoundingClientRect();
		// A point above the sheet (or left of the centered dialog) is the backdrop.
		const x = rect.left > 4 ? -rect.left / 2 : 2;
		const y = rect.top > 4 ? -rect.top / 2 : 2;
		await page.elementLocator(dialogEl()).click({ position: { x, y } });
		await expect.poll(() => dialogEl().open, { timeout: 3000 }).toBe(false);
		await expect.element(state()).toHaveTextContent('closed');
	});

	it('does not close when the sheet content is clicked', async () => {
		render(SheetTestHarness);
		await openSheet();
		await page.getByText('Body text').click();
		await expect.element(state()).toHaveTextContent('open');
		expect(dialogEl().open).toBe(true);
	});

	it('closes with the close button', async () => {
		render(SheetTestHarness);
		await openSheet();
		await page.getByRole('button', { name: 'Close' }).click();
		await expect.poll(() => dialogEl().open, { timeout: 3000 }).toBe(false);
		await expect.element(state()).toHaveTextContent('closed');
	});

	it('closes from the footer by setting open to false', async () => {
		render(SheetTestHarness);
		await openSheet();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect.poll(() => dialogEl().open, { timeout: 3000 }).toBe(false);
	});

	it('returns focus to the trigger button on close', async () => {
		render(SheetTestHarness);
		const trigger = page.getByRole('button', { name: 'Open sheet' });
		await openSheet();
		expect(document.activeElement).not.toBe(trigger.element());
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => document.activeElement).toBe(trigger.element());
	});

	it('contains scroll so the page behind does not scroll', async () => {
		render(SheetTestHarness);
		await openSheet();
		expect(getComputedStyle(dialogEl()).overscrollBehaviorY).toBe('contain');
		expect(getComputedStyle(dialogEl(), '::backdrop').overscrollBehaviorY).toBe('contain');
	});

	// overscroll-behavior does not stop iOS from scrolling the page behind a sheet that does not overflow.
	it('locks the page scroll while open and releases it after close', async () => {
		render(SheetTestHarness);
		const root = document.documentElement;
		expect(getComputedStyle(root).overflow).not.toBe('hidden');
		await openSheet();
		expect(getComputedStyle(root).overflow).toBe('hidden');
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => dialogEl().open, { timeout: 3000 }).toBe(false);
		await expect.poll(() => getComputedStyle(root).overflow).not.toBe('hidden');
	});

	it('paints the backdrop with the scrim token', async () => {
		render(SheetTestHarness);
		await openSheet();
		const scrim = getComputedStyle(document.documentElement).getPropertyValue('--kc-scrim').trim();
		expect(scrim).not.toBe('');
		await expect
			.poll(() => getComputedStyle(dialogEl(), '::backdrop').backgroundColor)
			.not.toBe('rgba(0, 0, 0, 0)');
	});

	it('restores focus to the opener after close', async () => {
		render(SheetTestHarness);
		const trigger = page.getByRole('button', { name: 'Open sheet' }).element() as HTMLElement;
		trigger.focus();
		await openSheet();
		await page.getByRole('button', { name: 'Close' }).click();
		await expect.poll(() => dialogEl().open, { timeout: 3000 }).toBe(false);
		await expect.poll(() => document.activeElement).toBe(trigger);
	});

	it('does not throw when the opener left the page while the sheet was open', async () => {
		const { unmount } = render(SheetTestHarness);
		const trigger = page.getByRole('button', { name: 'Open sheet' }).element() as HTMLElement;
		trigger.focus();
		trigger.click();
		await expect.element(page.getByRole('dialog', { name: 'Delete entry' })).toBeVisible();
		trigger.remove();
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => dialogEl().open, { timeout: 3000 }).toBe(false);
		expect(document.activeElement).not.toBe(trigger);
		unmount();
	});
});
