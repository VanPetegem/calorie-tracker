import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { trendSeries } from '#lib/domain/trend.ts';
import { toasts } from '#lib/stores/toasts.svelte.ts';
import Page from './+page.svelte';

const mocks = vi.hoisted(() => ({
	saveWeight: vi.fn(),
	logWeightToday: vi.fn(),
	deleteWeight: vi.fn(),
	invalidateAll: vi.fn()
}));

vi.mock('./weight.remote.ts', () => ({
	saveWeight: mocks.saveWeight,
	logWeightToday: mocks.logWeightToday,
	deleteWeight: mocks.deleteWeight
}));
vi.mock('$app/navigation', () => ({ invalidateAll: mocks.invalidateAll }));

const TODAY = '2026-11-07';

beforeEach(() => {
	mocks.saveWeight.mockReset().mockResolvedValue(undefined);
	mocks.logWeightToday.mockReset().mockResolvedValue(undefined);
	mocks.deleteWeight.mockReset().mockResolvedValue(undefined);
	mocks.invalidateAll.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
	for (const toast of [...toasts.items]) toasts.dismiss(toast.id);
});

function show(weighIns: { date: string; kg: number }[], todayKg: number | null = null) {
	const series = trendSeries(weighIns);
	const last = series.filter((point) => point.date <= TODAY).at(-1);
	return render(Page, {
		data: {
			today: TODAY,
			series,
			todayKg,
			lastKg: last?.kg ?? null,
			trendKg: last?.trend ?? null,
			rate: null
		},
		params: {},
		form: null
	} as never);
}

/** The entry card's field; the closed sheet below it has one too. */
const entryField = () => page.getByLabelText('Weight', { exact: true }).first();

const toastTexts = () => toasts.items.map((toast) => toast.message);

describe('weight page', () => {
	it('shows the empty state and the entry card before the first weigh-in', async () => {
		show([]);
		await expect.element(page.getByRole('heading', { name: 'No weigh-ins yet' })).toBeVisible();
		await expect.element(entryField()).toBeVisible();
		expect(page.getByRole('button', { name: /^Delete weigh-in of/ }).elements()).toHaveLength(0);
		expect(page.getByRole('slider', { name: 'Weight chart' }).elements()).toHaveLength(0);
		await expect.element(page.getByRole('button', { name: 'Add weigh-in' })).toBeVisible();
	});

	it('lists the history newest first', async () => {
		show([
			{ date: '2026-11-01', kg: 70 },
			{ date: '2026-11-05', kg: 71 },
			{ date: '2026-11-03', kg: 70.5 }
		]);
		const rows = page.getByRole('button', { name: /^Delete weigh-in of/ });
		await expect.element(rows.first()).toHaveAccessibleName('Delete weigh-in of Thu 5 Nov 2026');
		await expect.element(rows.nth(2)).toHaveAccessibleName('Delete weigh-in of Sun 1 Nov 2026');
	});

	it('logs today, toasts "Logged", and refreshes', async () => {
		show([{ date: '2026-11-01', kg: 70 }]);
		await entryField().fill('70.6');
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await vi.waitFor(() => expect(toastTexts()).toEqual(['Logged 70.6 kg']));
		// The entry card sends no date: the server's today decides, so a page left open past midnight is safe.
		expect(mocks.logWeightToday).toHaveBeenCalledWith({ kg: 70.6 });
		expect(mocks.saveWeight).not.toHaveBeenCalled();
		expect(mocks.invalidateAll).toHaveBeenCalledOnce();
	});

	it('toasts "Updated" when today already has a weigh-in', async () => {
		show([{ date: TODAY, kg: 70 }], 70);
		await page.getByRole('button', { name: 'Increase weight by 0.1 kg' }).click();
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await vi.waitFor(() => expect(toastTexts()).toEqual(['Updated 70.1 kg']));
		expect(mocks.logWeightToday).toHaveBeenCalledWith({ kg: 70.1 });
	});

	it('keeps the value and offers Retry when the write fails, with no toast and no refresh', async () => {
		mocks.logWeightToday.mockRejectedValue(new Error('offline'));
		show([{ date: '2026-11-01', kg: 70 }]);
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect.element(page.getByRole('button', { name: 'Retry' })).toBeVisible();
		expect(toastTexts()).toEqual([]);
		expect(mocks.invalidateAll).not.toHaveBeenCalled();
	});

	it('does not treat a failed refresh after a successful write as a failed write', async () => {
		mocks.invalidateAll.mockRejectedValue(new Error('offline'));
		show([{ date: '2026-11-01', kg: 70 }]);
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await vi.waitFor(() => expect(toastTexts()).toEqual(['Logged 70.0 kg']));
		expect(page.getByRole('button', { name: 'Retry' }).elements()).toHaveLength(0);
	});

	it('edits a past weigh-in from its row and toasts "Updated"', async () => {
		show([
			{ date: '2026-11-01', kg: 70 },
			{ date: '2026-11-03', kg: 70.5 }
		]);
		await page.getByRole('button', { name: /^Tue 3 Nov 2026/ }).click();
		const dialog = page.getByRole('dialog', { name: 'Edit weigh-in' });
		await expect.element(dialog).toHaveAttribute('data-shown', 'true');
		await dialog.getByLabelText('Weight', { exact: true }).fill('70.9');
		await dialog.getByRole('button', { name: 'Save' }).click();
		await vi.waitFor(() => expect(toastTexts()).toEqual(['Updated 70.9 kg']));
		expect(mocks.saveWeight).toHaveBeenCalledWith({ date: '2026-11-03', kg: 70.9 });
	});

	it('adds a missed past day with Add weigh-in and toasts "Logged"', async () => {
		show([{ date: '2026-11-03', kg: 70.5 }]);
		await page.getByRole('button', { name: 'Add weigh-in' }).click();
		const dialog = page.getByRole('dialog', { name: 'Add weigh-in' });
		await expect.element(dialog).toHaveAttribute('data-shown', 'true');
		await dialog.getByLabelText('Date').fill('2026-11-02');
		await dialog.getByLabelText('Weight', { exact: true }).fill('70.2');
		await dialog.getByRole('button', { name: 'Save' }).click();
		await vi.waitFor(() => expect(toastTexts()).toEqual(['Logged 70.2 kg']));
		expect(mocks.saveWeight).toHaveBeenCalledWith({ date: '2026-11-02', kg: 70.2 });
	});

	it('warns in the add sheet that the default day, yesterday, already has a weigh-in', async () => {
		show([{ date: '2026-11-06', kg: 70.6 }]);
		await page.getByRole('button', { name: 'Add weigh-in' }).click();
		const dialog = page.getByRole('dialog', { name: 'Add weigh-in' });
		await expect.element(dialog).toHaveTextContent('This day has 70.6 kg; saving replaces it');
	});

	it('deletes with an Undo toast that saves the old values again', async () => {
		show([
			{ date: '2026-11-01', kg: 70 },
			{ date: '2026-11-03', kg: 70.5 }
		]);
		await page.getByRole('button', { name: 'Delete weigh-in of Tue 3 Nov 2026' }).click();
		await vi.waitFor(() => expect(toastTexts()).toEqual(['Deleted weigh-in of Tue 3 Nov 2026']));
		expect(mocks.deleteWeight).toHaveBeenCalledWith({ date: '2026-11-03' });
		expect(mocks.invalidateAll).toHaveBeenCalledOnce();

		expect(toasts.items[0].action?.label).toBe('Undo');
		await toasts.items[0].action!.run();
		await vi.waitFor(() =>
			expect(mocks.saveWeight).toHaveBeenCalledWith({ date: '2026-11-03', kg: 70.5 })
		);
		await vi.waitFor(() => expect(mocks.invalidateAll).toHaveBeenCalledTimes(2));
	});

	it('offers Retry in a toast when a delete fails', async () => {
		mocks.deleteWeight.mockRejectedValue(new Error('offline'));
		show([{ date: '2026-11-03', kg: 70.5 }]);
		await page.getByRole('button', { name: 'Delete weigh-in of Tue 3 Nov 2026' }).click();
		await vi.waitFor(() => expect(toastTexts()).toEqual(['Could not delete the weigh-in']));
		expect(toasts.items[0].action?.label).toBe('Retry');
		expect(mocks.invalidateAll).not.toHaveBeenCalled();
	});
});
