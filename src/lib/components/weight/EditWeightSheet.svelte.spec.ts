import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import EditWeightSheet from './EditWeightSheet.svelte';

const today = '2026-11-07';
const point = { date: '2026-11-03', kg: 70.4 };

function setup(
	props: {
		point?: { date: string; kg: number } | null;
		kgOn?: (date: string) => number | null;
		onsave?: () => Promise<void>;
	} = {}
) {
	const onsave = vi.fn<(input: { date: string; kg: number }) => Promise<void>>(async () => {});
	render(EditWeightSheet, { open: true, point, today, kgOn: () => null, onsave, ...props });
	return { onsave };
}

/** The sheet has slid in: a click before that lands where the sheet is not yet, on the scrim. */
async function opened() {
	await expect.element(page.getByRole('dialog')).toHaveAttribute('data-shown', 'true');
}

describe('EditWeightSheet', () => {
	it('edits the weight of a stored day and keeps its date', async () => {
		const { onsave } = setup();
		await opened();
		const dialog = page.getByRole('dialog', { name: 'Edit weigh-in' });
		await expect.element(dialog).toHaveTextContent('Tue 3 Nov 2026');
		expect(page.getByLabelText('Date').elements()).toHaveLength(0);
		const input = page.getByLabelText('Weight', { exact: true });
		await expect.element(input).toHaveValue('70.4');
		await input.fill('70,9');
		await page.getByRole('button', { name: 'Save' }).click();
		expect(onsave).toHaveBeenCalledWith({ date: '2026-11-03', kg: 70.9 });
		await expect.element(dialog).not.toBeInTheDocument();
	});

	it('adds a weigh-in for a chosen day when there is no point', async () => {
		const { onsave } = setup({ point: null });
		await opened();
		await expect.element(page.getByRole('dialog', { name: 'Add weigh-in' })).toBeVisible();
		const date = page.getByLabelText('Date');
		await date.fill('2026-10-30');
		await page.getByLabelText('Weight', { exact: true }).fill('69.5');
		await page.getByRole('button', { name: 'Save' }).click();
		expect(onsave).toHaveBeenCalledWith({ date: '2026-10-30', kg: 69.5 });
	});

	it('starts a new weigh-in on yesterday, so today is not replaced by accident', async () => {
		const { onsave } = setup({ point: null });
		await opened();
		await expect.element(page.getByLabelText('Date')).toHaveValue('2026-11-06');
		await page.getByLabelText('Weight', { exact: true }).fill('69.5');
		await page.getByRole('button', { name: 'Save' }).click();
		expect(onsave).toHaveBeenCalledWith({ date: '2026-11-06', kg: 69.5 });
	});

	it('says when the chosen day already has a weigh-in that saving replaces', async () => {
		setup({ point: null, kgOn: (date) => (date === '2026-11-07' ? 70.6 : null) });
		await opened();
		const dialog = page.getByRole('dialog', { name: 'Add weigh-in' });
		await expect.element(dialog).not.toHaveTextContent('saving replaces it');
		await expect.element(dialog).toHaveTextContent('Up to tomorrow.');
		await page.getByLabelText('Date').fill('2026-11-07');
		await expect.element(dialog).toHaveTextContent('This day has 70.6 kg; saving replaces it');
		await page.getByLabelText('Date').fill('2026-11-05');
		await expect.element(dialog).not.toHaveTextContent('saving replaces it');
	});

	it('shows the date error after blur, before Save', async () => {
		const { onsave } = setup({ point: null });
		await opened();
		const date = page.getByLabelText('Date');
		await date.fill('2026-11-09');
		expect(page.getByRole('alert').elements()).toHaveLength(0);
		(date.element() as HTMLInputElement).blur();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Choose a day up to tomorrow');
		expect(onsave).not.toHaveBeenCalled();
	});

	it('takes a new weigh-in up to tomorrow and not a day later', async () => {
		const { onsave } = setup({ point: null });
		await opened();
		await page.getByLabelText('Weight', { exact: true }).fill('69.5');
		await page.getByLabelText('Date').fill('2026-11-09');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Choose a day up to tomorrow');
		expect(onsave).not.toHaveBeenCalled();
		await page.getByLabelText('Date').fill('2026-11-08');
		await page.getByRole('button', { name: 'Save' }).click();
		expect(onsave).toHaveBeenCalledWith({ date: '2026-11-08', kg: 69.5 });
	});

	it('shows the limit after blur and does not save it', async () => {
		const { onsave } = setup();
		await opened();
		const input = page.getByLabelText('Weight', { exact: true });
		await input.fill('450');
		(input.element() as HTMLInputElement).blur();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Enter at most 400');
		await page.getByRole('button', { name: 'Save' }).click();
		expect(onsave).not.toHaveBeenCalled();
	});

	it('stays open with the value after a failed save and offers Retry', async () => {
		const onsave = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
		render(EditWeightSheet, { open: true, point, today, kgOn: () => null, onsave });
		await opened();
		await page.getByLabelText('Weight', { exact: true }).fill('71');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Could not save');
		await expect.element(page.getByLabelText('Weight', { exact: true })).toHaveValue('71');
		await page.getByRole('button', { name: 'Retry' }).click();
		expect(onsave).toHaveBeenLastCalledWith({ date: '2026-11-03', kg: 71 });
	});

	it('lets a save from a closed opening act on nothing in the next one', async () => {
		let fail!: (error: Error) => void;
		const onsave = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
		const view = render(EditWeightSheet, { open: true, point, today, kgOn: () => null, onsave });
		await opened();
		await page.getByRole('button', { name: 'Save' }).click();
		await view.rerender({ open: false });
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await view.rerender({ open: true });
		await opened();
		fail(new Error('offline'));
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(page.getByRole('alert').elements()).toHaveLength(0);
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeEnabled();
	});

	it('opens clean again after an invalid entry was left behind', async () => {
		const onsave = vi.fn(async () => {});
		const view = render(EditWeightSheet, {
			open: true,
			point: null,
			today,
			kgOn: () => null,
			onsave
		});
		await opened();
		const input = page.getByLabelText('Weight', { exact: true });
		await input.fill('abc');
		(input.element() as HTMLInputElement).blur();
		await expect.element(page.getByRole('alert')).toBeVisible();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await view.rerender({ open: false });
		await view.rerender({ open: true });
		await opened();
		await expect.element(page.getByLabelText('Weight', { exact: true })).toHaveValue('');
		expect(page.getByRole('alert').elements()).toHaveLength(0);
	});

	it('drops the failure and Retry as soon as the weight changes', async () => {
		const onsave = vi.fn().mockRejectedValue(new Error('offline'));
		render(EditWeightSheet, { open: true, point, today, kgOn: () => null, onsave });
		await opened();
		await page.getByRole('button', { name: 'Save' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Could not save');
		const input = page.getByLabelText('Weight', { exact: true });
		await input.fill('71');
		(input.element() as HTMLInputElement).blur();
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeVisible();
	});

	it('keeps the focus in the sheet when it is reopened during its exit', async () => {
		const view = render(EditWeightSheet, {
			open: true,
			point,
			today,
			kgOn: () => null,
			onsave: async () => {}
		});
		await opened();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await view.rerender({ open: true });
		await opened();
		const dialog = page.getByRole('dialog').element();
		expect(dialog.contains(document.activeElement)).toBe(true);
		expect(document.activeElement).not.toBe(document.body);
	});
});
