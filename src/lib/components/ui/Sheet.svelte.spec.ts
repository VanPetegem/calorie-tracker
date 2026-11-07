import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import SheetTestHarness from './SheetTestHarness.svelte';

const state = () => page.getByTestId('state');
const dialogEl = () =>
	page.getByRole('dialog', { name: 'Delete entry', includeHidden: true }).element() as HTMLElement;
/** Open from the moment it is shown until its exit has finished, like a dialog's `open`. */
const isOpen = (el: HTMLElement = dialogEl()) => el.hasAttribute('data-open');
const scrimOf = (dialog: HTMLElement) => dialog.previousElementSibling as HTMLElement;

async function openSheet() {
	await page.getByRole('button', { name: 'Open sheet' }).click();
	await expect.element(page.getByRole('dialog', { name: 'Delete entry' })).toBeVisible();
}

describe('Sheet', () => {
	it('shows a dialog named by its title when open becomes true', async () => {
		render(SheetTestHarness);
		expect(isOpen()).toBe(false);
		await openSheet();
		expect(isOpen()).toBe(true);
		await expect.element(page.getByText('This removes it from today.')).toBeVisible();
		await expect.element(state()).toHaveTextContent('open');
	});

	it('closes on Escape and sets open to false', async () => {
		const onclose = vi.fn();
		render(SheetTestHarness, { onclose });
		await openSheet();
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => isOpen(), { timeout: 3000 }).toBe(false);
		await expect.element(state()).toHaveTextContent('closed');
		expect(onclose).toHaveBeenCalledOnce();
	});

	it('closes on a backdrop click', async () => {
		render(SheetTestHarness);
		await openSheet();
		// The top left corner is outside the sheet (above it, or left of the centered dialog).
		await page.elementLocator(scrimOf(dialogEl())).click({ position: { x: 2, y: 2 } });
		await expect.poll(() => isOpen(), { timeout: 3000 }).toBe(false);
		await expect.element(state()).toHaveTextContent('closed');
	});

	it('does not close when the sheet content is clicked', async () => {
		render(SheetTestHarness);
		await openSheet();
		await page.getByText('Body text').click();
		await expect.element(state()).toHaveTextContent('open');
		expect(isOpen()).toBe(true);
	});

	it('closes with the close button', async () => {
		render(SheetTestHarness);
		await openSheet();
		await page.getByRole('button', { name: 'Close' }).click();
		await expect.poll(() => isOpen(), { timeout: 3000 }).toBe(false);
		await expect.element(state()).toHaveTextContent('closed');
	});

	it('closes from the footer by setting open to false', async () => {
		render(SheetTestHarness);
		await openSheet();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect.poll(() => isOpen(), { timeout: 3000 }).toBe(false);
	});

	it('focuses the first focusable element on open', async () => {
		render(SheetTestHarness);
		await openSheet();
		const close = page.getByRole('button', { name: 'Close' }).element();
		await expect.poll(() => document.activeElement).toBe(close);
	});

	it('focuses the autofocus element over the first focusable one', async () => {
		render(SheetTestHarness, { autofocusCancel: true });
		await openSheet();
		const cancel = page.getByRole('button', { name: 'Cancel' }).element();
		await expect.poll(() => document.activeElement).toBe(cancel);
	});

	it('slides in by setting data-shown after open', async () => {
		render(SheetTestHarness);
		await openSheet();
		await expect.poll(() => dialogEl().hasAttribute('data-shown')).toBe(true);
	});

	it('stays closed when closed again while opening', async () => {
		render(SheetTestHarness);
		await page.getByRole('button', { name: 'Flash sheet' }).click();
		await expect.poll(() => isOpen(), { timeout: 3000 }).toBe(false);
		expect(dialogEl().hasAttribute('data-shown')).toBe(false);
		expect(dialogEl().contains(document.activeElement)).toBe(false);
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
		await expect.poll(() => isOpen(), { timeout: 3000 }).toBe(false);
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
		await expect.poll(() => isOpen(), { timeout: 3000 }).toBe(false);
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
		await expect.poll(() => isOpen(), { timeout: 3000 }).toBe(false);
		expect(document.activeElement).not.toBe(trigger);
		unmount();
	});

	// iOS browsers misplace a <dialog> (showModal and show), so the sheet is a plain fixed panel. These pin what
	// showModal used to provide.
	it('is not in the top layer, and sits in a fixed layer at the end of the body', async () => {
		render(SheetTestHarness);
		await openSheet();
		expect(dialogEl().tagName).toBe('DIV');
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
		await expect.poll(() => isOpen(), { timeout: 3000 }).toBe(false);
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
		expect(isOpen()).toBe(true);
		expect(dialogEl().parentElement!.inert).toBe(false);
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect.poll(() => isOpen(), { timeout: 3000 }).toBe(false);
	});

	it('releases the page when it unmounts while open', async () => {
		const { unmount } = render(SheetTestHarness);
		await openSheet();
		unmount();
		expect(document.querySelectorAll('body > [inert]')).toHaveLength(0);
		expect(getComputedStyle(document.documentElement).overflow).not.toBe('hidden');
	});

	// Mounted the other way round: the second sheet's layer comes first in the body. Opening must still draw it on
	// top, and one Escape must close only it.
	it('draws the newest sheet on top and closes only it on Escape, whatever the mount order', async () => {
		render(SheetTestHarness, { secondFirst: true });
		await openSheet();
		await page.getByRole('button', { name: 'Open second' }).click();
		const second = page.getByRole('dialog', { name: 'Second sheet' });
		await expect.element(second).toBeVisible();
		expect(document.body.lastElementChild).toBe(second.element().parentElement);
		await userEvent.keyboard('{Escape}');
		await expect.element(second).not.toBeInTheDocument();
		expect(isOpen()).toBe(true);
	});

	it('does not close on an Escape that a control inside the sheet handled', async () => {
		render(SheetTestHarness);
		await openSheet();
		const body = page.getByText('Body text').element() as HTMLElement;
		body.tabIndex = -1;
		body.focus();
		body.addEventListener('keydown', (event) => event.preventDefault(), { once: true });
		await userEvent.keyboard('{Escape}');
		expect(isOpen()).toBe(true);
	});

	it('makes the page inert also when the sheet is mounted open', async () => {
		render(SheetTestHarness, { startOpen: true });
		await expect.element(page.getByRole('dialog', { name: 'Delete entry' })).toBeVisible();
		const trigger = page.getByRole('button', { name: 'Open sheet', includeHidden: true }).element();
		expect(trigger.closest('[inert]')).not.toBeNull();
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => isOpen(), { timeout: 3000 }).toBe(false);
	});

	it('lets taps through to the page while it animates out', async () => {
		render(SheetTestHarness);
		await openSheet();
		const layer = dialogEl().parentElement!;
		await userEvent.keyboard('{Escape}');
		expect(getComputedStyle(layer).pointerEvents).toBe('none');
		await expect.poll(() => isOpen(), { timeout: 3000 }).toBe(false);
	});

	it('keeps the page inert without a gap when a node is added to the body', async () => {
		render(SheetTestHarness);
		await openSheet();
		const trigger = page.getByRole('button', { name: 'Open sheet', includeHidden: true }).element();
		const pageRoot = trigger.closest('[inert]')!;
		const records: MutationRecord[] = [];
		const changes = new MutationObserver((list) => records.push(...list));
		changes.observe(pageRoot, { attributes: true, attributeFilter: ['inert'] });
		const late = document.body.appendChild(document.createElement('div'));
		await expect.poll(() => late.inert).toBe(true);
		records.push(...changes.takeRecords());
		expect(records).toHaveLength(0);
		changes.disconnect();
		late.remove();
	});

	it('draws a sheet reopened during its exit above a sheet opened meanwhile', async () => {
		render(SheetTestHarness, { secondFirst: true });
		await openSheet();
		const first = dialogEl().parentElement!;
		await userEvent.keyboard('{Escape}');
		const second = page
			.getByRole('dialog', { name: 'Second sheet', includeHidden: true })
			.element();
		// Simulates the race: the second sheet takes the top, then the first is pushed back without moving.
		const { pushLayer, popLayer } = await import('./sheet-stack.ts');
		pushLayer(second.parentElement!, () => {}, true);
		pushLayer(first, () => {}, false);
		expect(Number(first.style.zIndex)).toBeGreaterThan(Number(second.parentElement!.style.zIndex));
		popLayer(first);
		popLayer(second.parentElement!);
	});

	it('does not cover the page while closed', async () => {
		render(SheetTestHarness);
		expect(getComputedStyle(dialogEl().parentElement!).display).toBe('none');
	});
});
