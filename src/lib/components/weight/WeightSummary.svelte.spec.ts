import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import WeightSummary from './WeightSummary.svelte';

describe('WeightSummary', () => {
	it('shows the trend and a signed weekly rate in kg and percent', async () => {
		render(WeightSummary, { trendKg: 70.44, rate: { kg: 0.2449, pct: 0.3331 } });
		await expect.element(page.getByTestId('trend')).toHaveTextContent('70.4 kg');
		await expect.element(page.getByTestId('rate')).toHaveTextContent('+0.24 kg/week');
		await expect.element(page.getByTestId('rate')).toHaveTextContent('+0.33 %');
	});

	it('shows a loss with a minus sign', async () => {
		render(WeightSummary, { trendKg: 70, rate: { kg: -0.3, pct: -0.43 } });
		await expect.element(page.getByTestId('rate')).toHaveTextContent('-0.30 kg/week');
		await expect.element(page.getByTestId('rate')).toHaveTextContent('-0.43 %');
	});

	it('says when the rate comes instead of showing a number', async () => {
		render(WeightSummary, { trendKg: 70.4, rate: null });
		await expect.element(page.getByText('Rate after 14 days of weigh-ins')).toBeVisible();
		expect(page.getByTestId('rate').elements()).toHaveLength(0);
	});

	it('shows no numbers before the first weigh-in', async () => {
		render(WeightSummary, { trendKg: null, rate: null });
		await expect.element(page.getByText('No weigh-ins up to today yet')).toBeVisible();
		expect(page.getByTestId('trend').elements()).toHaveLength(0);
	});
});
