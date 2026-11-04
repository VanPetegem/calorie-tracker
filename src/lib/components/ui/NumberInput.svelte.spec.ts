import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import NumberInput from './NumberInput.svelte';

function setup(extra: Record<string, unknown> = {}) {
	const state = $state({ value: null as number | null });
	render(NumberInput, {
		label: 'Weight',
		unit: 'kg',
		get value() {
			return state.value;
		},
		set value(v: number | null) {
			state.value = v;
		},
		...extra
	});
	return { state, input: page.getByLabelText('Weight') };
}

describe('NumberInput', () => {
	it('uses the decimal keypad', async () => {
		const { input } = setup();
		await expect.element(input).toHaveAttribute('inputmode', 'decimal');
	});

	it.each(['72,5', '72.5'])('commits %s as 72.5 on blur', async (text) => {
		const { state, input } = setup();
		await input.fill(text);
		(input.element() as HTMLInputElement).blur();
		expect(state.value).toBe(72.5);
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
	});

	it('shows a format error only after blur', async () => {
		const { state, input } = setup();
		await input.fill('7,2');
		await input.fill('7,2,5');
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
		(input.element() as HTMLInputElement).blur();
		await expect.element(page.getByRole('alert')).toHaveTextContent(/number/i);
		expect(state.value).toBeNull();
	});

	it('shows an error when the value is above max', async () => {
		const { input } = setup({ max: 300 });
		await input.fill('350');
		(input.element() as HTMLInputElement).blur();
		await expect.element(page.getByRole('alert')).toHaveTextContent('300');
	});

	it('shows an error when the value is below min', async () => {
		const { input } = setup({ min: 20 });
		await input.fill('5');
		(input.element() as HTMLInputElement).blur();
		await expect.element(page.getByRole('alert')).toHaveTextContent('20');
	});

	it('rounds to the configured decimals', async () => {
		const { state, input } = setup({ decimals: 1 });
		await input.fill('72,56');
		(input.element() as HTMLInputElement).blur();
		expect(state.value).toBe(72.6);
	});

	it('steps with ArrowUp and ArrowDown and respects min and max', async () => {
		const { state, input } = setup({ step: 0.5, min: 70, max: 72 });
		await input.fill('71,5');
		(input.element() as HTMLInputElement).focus();
		await userEvent.keyboard('{ArrowUp}');
		expect(state.value).toBe(72);
		await userEvent.keyboard('{ArrowUp}');
		expect(state.value).toBe(72);
		await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
		expect(state.value).toBe(70);
	});

	it('commits null for empty text without an error', async () => {
		const { state, input } = setup();
		await input.fill('72');
		(input.element() as HTMLInputElement).blur();
		await input.fill('');
		(input.element() as HTMLInputElement).blur();
		expect(state.value).toBeNull();
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
	});
});
