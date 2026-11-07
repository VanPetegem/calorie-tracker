import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import WeightEntry from './WeightEntry.svelte';

const today = '2026-11-07';

function setup(props: { todayKg?: number | null; lastKg?: number | null } = {}) {
	const onsave = vi.fn<(kg: number) => Promise<void>>(async () => {});
	render(WeightEntry, { today, todayKg: null, lastKg: 70.2, onsave, ...props });
	return {
		onsave,
		input: page.getByLabelText('Weight', { exact: true }),
		save: page.getByRole('button', { name: /^(Save|Retry)$/ })
	};
}

describe('WeightEntry', () => {
	it('starts from the latest weigh-in', async () => {
		const { input } = setup();
		await expect.element(input).toHaveValue('70.2');
	});

	it('starts from today weigh-in over the latest one and says it is logged', async () => {
		const { input } = setup({ todayKg: 71.4, lastKg: 70.2 });
		await expect.element(input).toHaveValue('71.4');
		await expect.element(page.getByText('Logged today')).toBeVisible();
	});

	it('does not say logged before today has a weigh-in', async () => {
		setup();
		expect(page.getByText('Logged today').elements()).toHaveLength(0);
	});

	it('steps up by 0.1 without float drift', async () => {
		// 70.6 + 0.1 is 70.69999999999999 in floating point; the saved weight must be 70.7.
		const { onsave, save } = setup({ lastKg: 70.6 });
		await page.getByRole('button', { name: 'Increase weight by 0.1 kg' }).click();
		await save.click();
		expect(onsave).toHaveBeenCalledWith(70.7);
	});

	it('steps down by 0.1 without float drift', async () => {
		// 70.4 - 0.1 is 70.30000000000001 in floating point.
		const { onsave, save } = setup({ lastKg: 70.4 });
		await page.getByRole('button', { name: 'Decrease weight by 0.1 kg' }).click();
		await save.click();
		expect(onsave).toHaveBeenCalledWith(70.3);
	});

	it('steps from what was typed, even when the field never lost focus', async () => {
		const { onsave, input, save } = setup({ lastKg: 70.2 });
		await input.fill('65,5');
		await page.getByRole('button', { name: 'Increase weight by 0.1 kg' }).click();
		await save.click();
		expect(onsave).toHaveBeenCalledWith(65.6);
	});

	it('turns a step off at each limit', async () => {
		const low = setup({ lastKg: 20 });
		await expect
			.element(page.getByRole('button', { name: 'Decrease weight by 0.1 kg' }))
			.toBeDisabled();
		await expect
			.element(page.getByRole('button', { name: 'Increase weight by 0.1 kg' }))
			.toBeEnabled();
		expect(low.onsave).not.toHaveBeenCalled();
	});

	it('turns the up step off at the upper limit', async () => {
		setup({ lastKg: 400 });
		await expect
			.element(page.getByRole('button', { name: 'Increase weight by 0.1 kg' }))
			.toBeDisabled();
	});

	it('says why a step is off at each limit', async () => {
		const low = render(WeightEntry, { today, todayKg: null, lastKg: 20, onsave: async () => {} });
		await expect.element(page.getByText('20 kg is the lowest weight')).toBeVisible();
		low.unmount();
		render(WeightEntry, { today, todayKg: null, lastKg: 400, onsave: async () => {} });
		await expect.element(page.getByText('400 kg is the highest weight')).toBeVisible();
	});

	it('gives no limit hint between the limits', async () => {
		setup({ lastKg: 70.2 });
		expect(page.getByText(/is the (lowest|highest) weight/).elements()).toHaveLength(0);
	});

	it('shows the limit after the field loses focus, and does not save it', async () => {
		const { onsave, input, save } = setup();
		await input.fill('10');
		expect(page.getByRole('alert').elements()).toHaveLength(0);
		(input.element() as HTMLInputElement).blur();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Enter at least 20');
		await save.click();
		expect(onsave).not.toHaveBeenCalled();
	});

	it('saves what was typed when Enter is pressed in the field', async () => {
		const { onsave, input } = setup();
		await input.fill('71,4');
		await userEvent.keyboard('{Enter}');
		expect(onsave).toHaveBeenCalledWith(71.4);
	});

	it('steps from a number typed into an empty field, without the field losing focus', async () => {
		// iOS Safari does not focus a tapped button, so the field never blurs: the click is dispatched without moving focus.
		const { onsave, input, save } = setup({ lastKg: null });
		await input.fill('70.5');
		const field = input.element() as HTMLInputElement;
		expect(document.activeElement).toBe(field);
		const plus = page.getByRole('button', { name: 'Increase weight by 0.1 kg' });
		await expect.element(plus).toBeEnabled();
		(plus.element() as HTMLButtonElement).click();
		await expect.element(input).toHaveValue('70.6');
		await save.click();
		expect(onsave).toHaveBeenCalledWith(70.6);
	});

	it('asks for a number when the field is empty and a step has nothing to start from', async () => {
		const { onsave, input, save } = setup({ lastKg: null });
		await page.getByRole('button', { name: 'Decrease weight by 0.1 kg' }).click();
		await expect.element(input).toHaveValue('');
		expect(page.getByRole('alert').elements()).toHaveLength(0);
		await save.click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Enter a number');
		expect(onsave).not.toHaveBeenCalled();
	});

	it('shows a saving state and does not send twice', async () => {
		let finish = () => {};
		const onsave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
		render(WeightEntry, { today, todayKg: null, lastKg: 70.2, onsave });
		const save = page.getByRole('button', { name: 'Save' });
		await save.click();
		await expect.element(save).toHaveAttribute('aria-busy', 'true');
		// Enter in the field submits the form too, and must not send a second time while the first is open.
		await page.getByLabelText('Weight', { exact: true }).click();
		await userEvent.keyboard('{Enter}');
		await save.click({ force: true });
		expect(onsave).toHaveBeenCalledTimes(1);
		finish();
		await expect.element(save).not.toHaveAttribute('aria-busy');
	});

	it('keeps the value after a failed save and offers Retry', async () => {
		const onsave = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
		render(WeightEntry, { today, todayKg: null, lastKg: 70.2, onsave });
		await page.getByRole('button', { name: 'Save' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Could not save');
		await expect.element(page.getByLabelText('Weight', { exact: true })).toHaveValue('70.2');
		await page.getByRole('button', { name: 'Retry' }).click();
		expect(onsave).toHaveBeenCalledTimes(2);
		expect(page.getByRole('alert').elements()).toHaveLength(0);
	});

	it('drops the failure and Retry as soon as the weight changes', async () => {
		const onsave = vi.fn().mockRejectedValue(new Error('offline'));
		render(WeightEntry, { today, todayKg: null, lastKg: 70.2, onsave });
		await page.getByRole('button', { name: 'Save' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Could not save');
		await page.getByRole('button', { name: 'Increase weight by 0.1 kg' }).click();
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeVisible();
		await page.getByRole('button', { name: 'Save' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Could not save');
		const input = page.getByLabelText('Weight', { exact: true });
		await input.fill('71');
		(input.element() as HTMLInputElement).blur();
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
	});
});
