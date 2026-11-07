import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import EditWeightSheet from './EditWeightSheet.svelte';

const today = '2026-11-07';
const point = { date: '2026-11-03', kg: 70.4 };

function setup(
	props: { point?: { date: string; kg: number } | null; onsave?: () => Promise<void> } = {}
) {
	const onsave = vi.fn<(input: { date: string; kg: number }) => Promise<void>>(async () => {});
	render(EditWeightSheet, { open: true, point, today, onsave, ...props });
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
		await expect.element(date).toHaveValue(today);
		await date.fill('2026-10-30');
		await page.getByLabelText('Weight', { exact: true }).fill('69.5');
		await page.getByRole('button', { name: 'Save' }).click();
		expect(onsave).toHaveBeenCalledWith({ date: '2026-10-30', kg: 69.5 });
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
		render(EditWeightSheet, { open: true, point, today, onsave });
		await opened();
		await page.getByLabelText('Weight', { exact: true }).fill('71');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Could not save');
		await expect.element(page.getByLabelText('Weight', { exact: true })).toHaveValue('71');
		await page.getByRole('button', { name: 'Retry' }).click();
		expect(onsave).toHaveBeenLastCalledWith({ date: '2026-11-03', kg: 71 });
	});
});
