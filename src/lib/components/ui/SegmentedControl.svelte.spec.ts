import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import SegmentedControl from './SegmentedControl.svelte';

const options = [
	{ value: 'system', label: 'System' },
	{ value: 'light', label: 'Light' },
	{ value: 'dark', label: 'Dark' }
];

function setup(initial = 'system') {
	const setter = vi.fn();
	const state = $state({ value: initial });
	render(SegmentedControl, {
		options,
		label: 'Theme',
		get value() {
			return state.value;
		},
		set value(v: string) {
			setter(v);
			state.value = v;
		}
	});
	return { setter };
}

describe('SegmentedControl', () => {
	it('renders a radiogroup with the selected radio checked', async () => {
		setup('light');
		await expect.element(page.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
		await expect.element(page.getByRole('radio', { name: 'Light' })).toBeChecked();
		await expect.element(page.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
	});

	it('moves the selection with ArrowRight and ArrowLeft', async () => {
		const { setter } = setup('system');
		(page.getByRole('radio', { name: 'System' }).element() as HTMLElement).focus();
		await userEvent.keyboard('{ArrowRight}');
		expect(setter).toHaveBeenLastCalledWith('light');
		await expect.element(page.getByRole('radio', { name: 'Light' })).toBeChecked();
		await expect.element(page.getByRole('radio', { name: 'Light' })).toHaveFocus();
		await userEvent.keyboard('{ArrowLeft}');
		expect(setter).toHaveBeenLastCalledWith('system');
	});

	it('selects on click', async () => {
		const { setter } = setup('system');
		await page.getByRole('radio', { name: 'Dark' }).click();
		expect(setter).toHaveBeenLastCalledWith('dark');
	});

	it('keeps only the selected radio in the tab order', async () => {
		setup('light');
		await expect
			.element(page.getByRole('radio', { name: 'Light' }))
			.toHaveAttribute('tabindex', '0');
		await expect
			.element(page.getByRole('radio', { name: 'Dark' }))
			.toHaveAttribute('tabindex', '-1');
	});
});
