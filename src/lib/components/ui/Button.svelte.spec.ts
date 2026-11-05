import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Button from './Button.svelte';

const label = createRawSnippet(() => ({ render: () => '<span>Save</span>' }));

describe('Button', () => {
	it('links a disabled button to its reason through aria-describedby', async () => {
		const onclick = vi.fn();
		render(Button, {
			children: label,
			disabled: true,
			disabledReason: 'Fill in all fields',
			onclick
		});
		const el = page.getByRole('button', { name: 'Save' }).element() as HTMLButtonElement;
		expect(el.getAttribute('aria-disabled')).toBe('true');
		const describedBy = el.getAttribute('aria-describedby');
		expect(describedBy).toBeTruthy();
		expect(document.getElementById(describedBy!)?.textContent).toBe('Fill in all fields');
		el.click();
		expect(onclick).not.toHaveBeenCalled();
	});

	describe('disabled reason hint', () => {
		const hintOf = (el: HTMLElement) =>
			document.getElementById(el.getAttribute('aria-describedby')!)!;
		const isVisible = (el: HTMLElement) => {
			const rect = el.getBoundingClientRect();
			return rect.width > 1 && rect.height > 1;
		};

		it('is hidden visually until the button is touched', async () => {
			render(Button, { children: label, disabled: true, disabledReason: 'Fill in all fields' });
			const el = page.getByRole('button', { name: 'Save' }).element() as HTMLButtonElement;
			expect(isVisible(hintOf(el))).toBe(false);
		});

		it('shows when a disabled button is tapped without focus (touch)', async () => {
			render(Button, { children: label, disabled: true, disabledReason: 'Fill in all fields' });
			const el = page.getByRole('button', { name: 'Save' }).element() as HTMLButtonElement;
			// A DOM click does not focus the button, like a tap in iOS Safari.
			el.click();
			await expect.element(page.getByText('Fill in all fields')).toBeVisible();
			expect(document.activeElement).not.toBe(el);
			expect(isVisible(hintOf(el))).toBe(true);
		});

		it('shows on keyboard focus and hides on blur', async () => {
			render(Button, { children: label, disabled: true, disabledReason: 'Fill in all fields' });
			const el = page.getByRole('button', { name: 'Save' }).element() as HTMLButtonElement;
			el.focus();
			await expect.poll(() => isVisible(hintOf(el))).toBe(true);
			el.blur();
			await expect.poll(() => isVisible(hintOf(el))).toBe(false);
		});

		it('hides again on blur after a tap', async () => {
			render(Button, { children: label, disabled: true, disabledReason: 'Fill in all fields' });
			const el = page.getByRole('button', { name: 'Save' }).element() as HTMLButtonElement;
			el.focus();
			el.click();
			el.blur();
			await expect.poll(() => isVisible(hintOf(el))).toBe(false);
		});

		it('does not show for a loading button', async () => {
			render(Button, { children: label, loading: true, disabledReason: 'Not used' });
			const el = page.getByRole('button', { name: 'Save' }).element() as HTMLButtonElement;
			el.click();
			expect(el.hasAttribute('aria-describedby')).toBe(false);
		});
	});

	it('sets aria-busy and blocks clicks while loading', async () => {
		const onclick = vi.fn();
		render(Button, { children: label, loading: true, onclick });
		const el = page.getByRole('button', { name: 'Save' }).element() as HTMLButtonElement;
		expect(el.getAttribute('aria-busy')).toBe('true');
		el.click();
		expect(onclick).not.toHaveBeenCalled();
	});

	it('calls onclick when enabled', async () => {
		const onclick = vi.fn();
		render(Button, { children: label, onclick });
		await page.getByRole('button', { name: 'Save' }).click();
		expect(onclick).toHaveBeenCalledOnce();
	});

	it('renders a link when href is set', async () => {
		render(Button, { children: label, href: '/log' });
		const link = page.getByRole('link', { name: 'Save' });
		await expect.element(link).toHaveAttribute('href', '/log');
	});

	it('keeps a 44 px tall interactive element for the small size', async () => {
		render(Button, { children: label, size: 'sm' });
		const rect = page.getByRole('button', { name: 'Save' }).element().getBoundingClientRect();
		expect(rect.height).toBeGreaterThanOrEqual(44);
	});
});
