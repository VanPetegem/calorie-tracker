import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { LogEntry } from '#lib/server/db/schema.ts';
import EntryRow from './EntryRow.svelte';

const food: LogEntry = {
	id: '0198a000-0000-7000-8000-000000000001',
	date: '2026-11-05',
	loggedAt: '2026-11-05T08:00:00.000Z',
	kind: 'food',
	foodId: '0198a000-0000-7000-8000-000000000002',
	batchId: null,
	amount: 200,
	unit: 'g',
	grams: 200,
	label: 'Oats',
	kcal: 740,
	protein: 26.4,
	carbs: 123,
	fat: 14,
	fiber: 20,
	deletedAt: null
};

const quick: LogEntry = {
	...food,
	kind: 'quick',
	foodId: null,
	amount: null,
	unit: null,
	grams: null,
	label: null
};

function props(entry: LogEntry) {
	return { entry, onedit: vi.fn(), ondelete: vi.fn(), onmenu: vi.fn() };
}

describe('EntryRow', () => {
	it('shows a food entry with amount, macros and kcal', async () => {
		render(EntryRow, props(food));
		await expect.element(page.getByText('Oats')).toBeVisible();
		await expect.element(page.getByText('200 g · P 26 · C 123 · F 14')).toBeVisible();
		await expect.element(page.getByText('740 kcal')).toBeVisible();
	});

	it('shows a quick entry without a label as "Quick add"', async () => {
		render(EntryRow, props(quick));
		await expect.element(page.getByText('Quick add', { exact: true }).first()).toBeVisible();
	});

	it('tap edits and the menu button opens the menu, each with the entry', async () => {
		const p = props(food);
		render(EntryRow, p);
		await page.getByRole('button', { name: /Oats/ }).first().click();
		expect(p.onedit).toHaveBeenCalledWith(food);
		await page.getByRole('button', { name: 'More actions for Oats' }).click();
		expect(p.onmenu).toHaveBeenCalledWith(food);
	});

	it('the menu button is at least 44 px', async () => {
		render(EntryRow, props(food));
		const button = page.getByRole('button', { name: 'More actions for Oats' }).element();
		expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
		expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
	});
});
