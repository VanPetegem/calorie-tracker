import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { weekRow } from '#lib/components/targets/week.fixture.ts';
import WeekTargetCard from './WeekTargetCard.svelte';

const card = () => page.getByRole('region', { name: "This week's target" });

describe('WeekTargetCard', () => {
	it('shows the target and the TDEE used this week', async () => {
		render(WeekTargetCard, {
			week: weekRow('2026-11-02', { targetKcal: 2450, tdeeUsed: 2600, tdeeFormula: 2650 })
		});
		await expect.element(card()).toHaveTextContent('2,450 kcal');
		await expect.element(card()).toHaveTextContent('TDEE used 2,600 kcal');
	});

	it('names the adaptive estimate and its valid days', async () => {
		render(WeekTargetCard, {
			week: weekRow('2026-11-02', { tdeeAdaptive: 2400, tdeeUsed: 2400, validDays: 16 })
		});
		await expect.element(card()).toHaveTextContent('Adaptive, 16 valid days');
	});

	it('says Formula while the adaptive gate has not passed', async () => {
		render(WeekTargetCard, { week: weekRow('2026-11-02', { tdeeAdaptive: null, validDays: 9 }) });
		await expect.element(card()).toHaveTextContent('Formula');
		expect(card().element().textContent).not.toContain('valid days');
	});
});
