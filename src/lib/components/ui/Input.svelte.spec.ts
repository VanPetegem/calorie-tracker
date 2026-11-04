import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import Input from './Input.svelte';

describe('Input', () => {
	it('labels the field and links hint and error through aria-describedby', async () => {
		render(Input, {
			label: 'Email',
			value: '',
			hint: 'We never share it',
			error: 'Enter a valid email'
		});
		const input = page.getByLabelText('Email');
		await expect.element(input).toHaveAttribute('aria-invalid', 'true');
		const ids = input.element().getAttribute('aria-describedby')!.split(' ');
		const text = ids.map((id) => document.getElementById(id)?.textContent).join('|');
		expect(text).toContain('Enter a valid email');
		await expect.element(page.getByRole('alert')).toHaveTextContent('Enter a valid email');
	});

	it('does not validate while typing and calls onblur', async () => {
		const onblur = vi.fn();
		render(Input, { label: 'Name', value: '', onblur });
		const input = page.getByLabelText('Name');
		await input.fill('abc');
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
		(input.element() as HTMLInputElement).blur();
		expect(onblur).toHaveBeenCalledOnce();
	});

	it('disables the field', async () => {
		render(Input, { label: 'Name', value: 'x', disabled: true });
		await expect.element(page.getByLabelText('Name')).toBeDisabled();
	});
});
