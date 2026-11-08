import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { WeeklyTarget } from '#lib/server/db/schema.ts';
import TargetExplainer from './TargetExplainer.svelte';

/** A week's row from the formula alone: the adaptive gate has not passed. */
const formulaRow: WeeklyTarget = {
	weekStart: '2026-11-02',
	tdeeFormula: 2600,
	tdeeAdaptive: null,
	tdeeUsed: 2600,
	targetKcal: 2900,
	proteinG: 130,
	carbsG: 400,
	fatG: 80,
	carbsFloored: false,
	trendKg: 72,
	rateKgPerWeek: null,
	validDays: 0,
	weighIns: 1,
	computedAt: '2026-11-08T10:00:00.000Z'
};

describe('TargetExplainer', () => {
	it('says the target is a formula estimate until the adaptive gate passes', async () => {
		render(TargetExplainer, { props: { target: formulaRow } });
		await expect
			.element(page.getByText(/formula estimate for now/))
			.toHaveTextContent('14 days of logged food and 6 weigh-ins');
	});

	it('says the target adapts to the log once the gate has passed, with the days it used', async () => {
		render(TargetExplainer, {
			props: { target: { ...formulaRow, tdeeAdaptive: 2450, validDays: 16, weighIns: 7 } }
		});
		await expect
			.element(page.getByText(/adapts to your log/))
			.toHaveTextContent('16 days of logged food and 7 weigh-ins in the last 21 days');
		expect(page.getByText(/formula estimate/).query()).toBeNull();
	});

	it('shows the kcal and the grams of each macro', async () => {
		render(TargetExplainer, { props: { target: formulaRow } });
		await expect.element(page.getByText('2,900', { exact: true })).toBeVisible();
		await expect.element(page.getByText('130 g', { exact: true })).toBeVisible();
		await expect.element(page.getByText('400 g', { exact: true })).toBeVisible();
		await expect.element(page.getByText('80 g', { exact: true })).toBeVisible();
	});

	it('says carbs are zero because protein and fat use the whole target, only when they are', async () => {
		render(TargetExplainer, {
			props: { target: { ...formulaRow, carbsG: 0, carbsFloored: true } }
		});
		await expect.element(page.getByText('0 g', { exact: true })).toBeVisible();
		await expect.element(page.getByText(/use the whole target/)).toBeVisible();
	});

	it('shows no carbs note when carbs have room', async () => {
		render(TargetExplainer, { props: { target: formulaRow } });
		await expect.element(page.getByText('400 g', { exact: true })).toBeVisible();
		expect(page.getByText(/use the whole target/).query()).toBeNull();
	});
});
