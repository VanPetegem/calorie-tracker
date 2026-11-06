import { beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { LogEntry } from '#lib/server/db/schema.ts';
import { toasts } from '#lib/stores/toasts.svelte.ts';
import QuickAddForm from './QuickAddForm.svelte';

const mocks = vi.hoisted(() => ({
	invalidateAll: vi.fn(),
	logQuick: vi.fn(),
	editQuick: vi.fn()
}));

vi.mock('$app/navigation', () => ({ invalidateAll: mocks.invalidateAll }));
vi.mock('../../../routes/(app)/log.remote.ts', () => ({
	logQuick: mocks.logQuick,
	editQuick: mocks.editQuick
}));

const entry: LogEntry = {
	id: '0198a000-0000-7000-8000-000000000001',
	date: '2026-11-04',
	loggedAt: '2026-11-04T18:00:00.000Z',
	kind: 'quick',
	foodId: null,
	batchId: null,
	amount: null,
	unit: null,
	grams: null,
	label: 'Restaurant',
	kcal: 650,
	protein: 0,
	carbs: 0,
	fat: 0,
	fiber: null,
	deletedAt: null
};

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.invalidateAll.mockResolvedValue(undefined);
	mocks.logQuick.mockResolvedValue(entry);
	mocks.editQuick.mockResolvedValue(entry);
	for (const toast of [...toasts.items]) toasts.dismiss(toast.id);
});

const field = (label: string) => page.getByLabelText(label, { exact: true });

describe('QuickAddForm', () => {
	it('requires kcal and says so on blur', async () => {
		render(QuickAddForm, { date: '2026-11-05', ondone: vi.fn() });
		await field('Calories').element().focus();
		await field('Calories').element().blur();
		await expect.element(page.getByText('Enter a number')).toBeVisible();
	});

	it('logs a quick entry on the given day with empty macros as null', async () => {
		const ondone = vi.fn();
		render(QuickAddForm, { date: '2026-11-05', ondone });
		await field('Label (optional)').fill('Restaurant');
		await field('Calories').fill('650');
		await page.getByRole('button', { name: 'Log' }).click();
		await vi.waitFor(() => expect(ondone).toHaveBeenCalled());
		expect(mocks.logQuick).toHaveBeenCalledWith({
			date: '2026-11-05',
			label: 'Restaurant',
			kcal: 650,
			protein: null,
			carbs: null,
			fat: null
		});
		expect(mocks.invalidateAll).toHaveBeenCalled();
	});

	it('prefills an entry and saves the change with editQuick', async () => {
		const ondone = vi.fn();
		render(QuickAddForm, { entry, date: entry.date, ondone });
		await expect.element(field('Calories')).toHaveValue('650');
		await expect.element(field('Label (optional)')).toHaveValue('Restaurant');
		await field('Calories').fill('700');
		await page.getByRole('button', { name: 'Save' }).click();
		await vi.waitFor(() => expect(ondone).toHaveBeenCalled());
		expect(mocks.editQuick).toHaveBeenCalledWith(
			expect.objectContaining({ id: entry.id, kcal: 700, label: 'Restaurant' })
		);
		expect(mocks.logQuick).not.toHaveBeenCalled();
	});

	it('keeps the form and shows an error when saving fails', async () => {
		mocks.logQuick.mockRejectedValue(new Error('offline'));
		const ondone = vi.fn();
		render(QuickAddForm, { date: '2026-11-05', ondone });
		await field('Calories').fill('650');
		await page.getByRole('button', { name: 'Log' }).click();
		await expect.element(page.getByText('Could not save. Try again.')).toBeVisible();
		expect(ondone).not.toHaveBeenCalled();
	});

	it('does not call a failed refresh after a successful save a failure', async () => {
		mocks.invalidateAll.mockRejectedValue(new Error('offline'));
		const ondone = vi.fn();
		render(QuickAddForm, { date: '2026-11-05', ondone });
		await field('Calories').fill('650');
		await page.getByRole('button', { name: 'Log' }).click();
		await vi.waitFor(() => expect(ondone).toHaveBeenCalled());
		expect(page.getByText('Could not save. Try again.').elements()).toHaveLength(0);
	});
});
