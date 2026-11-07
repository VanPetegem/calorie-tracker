import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import SheetTestHarness from './SheetTestHarness.svelte';

const state = () => page.getByTestId('state');
const dialogEl = () =>
	page
		.getByRole('dialog', { name: 'Delete entry', includeHidden: true })
		.element() as HTMLDialogElement;
const scrimOf = (dialog: HTMLDialogElement) => dialog.previousElementSibling as HTMLElement;

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
		// The top left corner is outside the sheet (above it, or left of the centered dialog).
		await page.elementLocator(scrimOf(dialogEl())).click({ position: { x: 2, y: 2 } });
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
		expect(getComputedStyle(scrimOf(dialogEl())).overscrollBehaviorY).toBe('contain');
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

	it('paints the scrim with the scrim token', async () => {
		render(SheetTestHarness);
		await openSheet();
		const scrim = getComputedStyle(document.documentElement).getPropertyValue('--kc-scrim').trim();
		expect(scrim).not.toBe('');
		await expect
			.poll(() => getComputedStyle(scrimOf(dialogEl())).backgroundColor)
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

	// Brave and Firefox on iOS place top layer content (showModal) below the visible screen, so the sheet is a
	// non-modal dialog in a fixed layer. These pin what showModal used to provide.
	it('is not in the top layer, and sits in a fixed layer at the end of the body', async () => {
		render(SheetTestHarness);
		await openSheet();
		expect(dialogEl().matches(':modal')).toBe(false);
		const layer = dialogEl().parentElement!;
		expect(layer.parentElement).toBe(document.body);
		expect(getComputedStyle(layer).position).toBe('fixed');
	});

	it('makes the page behind inert while open and gives it back after close', async () => {
		render(SheetTestHarness);
		const trigger = page.getByRole('button', { name: 'Open sheet' }).element() as HTMLElement;
		const pageRoot = [...document.body.children].find((child) =>
			child.contains(trigger)
		) as HTMLElement;
		await openSheet();
		expect(pageRoot.inert).toBe(true);
		expect(dialogEl().closest('[inert]')).toBeNull();
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => dialogEl().open, { timeout: 3000 }).toBe(false);
		expect(pageRoot.inert).toBe(false);
	});

	it('stacks a second sheet: Escape closes only the top one, and the first works again', async () => {
		render(SheetTestHarness);
		await openSheet();
		await page.getByRole('button', { name: 'Open second' }).click();
		const second = page.getByRole('dialog', { name: 'Second sheet' });
		await expect.element(second).toBeVisible();
		expect(dialogEl().parentElement!.inert).toBe(true);
		await userEvent.keyboard('{Escape}');
		await expect.element(second).not.toBeInTheDocument();
		expect(dialogEl().open).toBe(true);
		expect(dialogEl().parentElement!.inert).toBe(false);
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect.poll(() => dialogEl().open, { timeout: 3000 }).toBe(false);
	});

	it('releases the page when it unmounts while open', async () => {
		const { unmount } = render(SheetTestHarness);
		await openSheet();
		unmount();
		expect(document.querySelectorAll('body > [inert]')).toHaveLength(0);
		expect(getComputedStyle(document.documentElement).overflow).not.toBe('hidden');
	});
});
