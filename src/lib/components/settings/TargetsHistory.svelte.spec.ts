import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { addDays } from '#lib/domain/dates.ts';
import { weekRow } from '#lib/components/targets/week.fixture.ts';
import TargetsHistory from './TargetsHistory.svelte';

const THIS_WEEK = '2026-11-02';
const LAST_WEEK = '2026-10-26';

/** The history row whose text contains `text`. */
const rowWith = (text: string) => page.getByRole('listitem').filter({ hasText: text });

describe('TargetsHistory', () => {
	it('lists the latest 26 weeks, then every week after Show all', async () => {
		const rows = Array.from({ length: 30 }, (_, i) => weekRow(addDays(THIS_WEEK, -7 * i)));
		render(TargetsHistory, { rows, currentWeekStart: THIS_WEEK });
		expect(page.getByRole('listitem').elements()).toHaveLength(26);
		await page.getByRole('button', { name: 'Show all' }).click();
		await expect.poll(() => page.getByRole('listitem').elements().length).toBe(30);
	});

	it('marks a formula week and an adaptive week with its valid days', async () => {
		render(TargetsHistory, {
			rows: [
				weekRow(THIS_WEEK),
				weekRow(LAST_WEEK, { tdeeAdaptive: 2400, tdeeUsed: 2400, validDays: 16 })
			],
			currentWeekStart: THIS_WEEK
		});
		await expect.element(rowWith('This week')).toHaveTextContent('Formula');
		await expect
			.element(rowWith('Week of Mon 26 Oct 2026'))
			.toHaveTextContent('Adaptive, 16 valid days');
		expect(rowWith('Week of Mon 26 Oct 2026').element().textContent).not.toContain('Formula');
	});

	it('titles the current week This week and the others by their Monday', async () => {
		render(TargetsHistory, {
			rows: [weekRow(THIS_WEEK), weekRow(LAST_WEEK)],
			currentWeekStart: THIS_WEEK
		});
		expect(rowWith('This week').elements()).toHaveLength(1);
		expect(rowWith('Week of Mon 26 Oct 2026').elements()).toHaveLength(1);
	});

	it("shows each week's target and the TDEE it used", async () => {
		render(TargetsHistory, {
			rows: [weekRow(THIS_WEEK, { targetKcal: 2450, tdeeUsed: 2640, tdeeFormula: 2600 })],
			currentWeekStart: THIS_WEEK
		});
		await expect.element(rowWith('This week')).toHaveTextContent('2,450 kcal');
		await expect.element(rowWith('This week')).toHaveTextContent('TDEE used 2,640 kcal');
	});

	it('shows the weekly rate, or says there is none yet', async () => {
		render(TargetsHistory, {
			rows: [
				weekRow(THIS_WEEK, { rateKgPerWeek: 0.25 }),
				weekRow(LAST_WEEK, { rateKgPerWeek: null })
			],
			currentWeekStart: THIS_WEEK
		});
		await expect.element(rowWith('This week')).toHaveTextContent('+0.25 kg/week');
		await expect.element(rowWith('Week of Mon 26 Oct 2026')).toHaveTextContent('No rate yet');
	});

	it('says there are no targets before the first week', async () => {
		render(TargetsHistory, { rows: [], currentWeekStart: THIS_WEEK });
		await expect.element(page.getByText('No targets yet')).toBeVisible();
		expect(page.getByRole('listitem').elements()).toHaveLength(0);
	});
});
