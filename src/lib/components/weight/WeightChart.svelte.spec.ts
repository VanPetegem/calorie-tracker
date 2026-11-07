import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { addDays } from '#lib/domain/dates.ts';
import type { TrendPoint } from '#lib/domain/trend.ts';
import WeightChart from './WeightChart.svelte';

const today = '2026-11-07';

/** One weigh-in every `every` days, `count` of them, the last on today. */
function series(count: number, every = 1): TrendPoint[] {
	return Array.from({ length: count }, (_, i) => {
		const kg = 70 + (i % 5) * 0.2;
		return { date: addDays(today, -(count - 1 - i) * every), kg, trend: 70.4 };
	});
}

const rows = () => page.getByRole('row').elements().length - 1;
const plot = () => page.getByRole('slider', { name: 'Weight chart' });
const tooltip = () => page.getByTestId('tooltip');

afterEach(() => {
	vi.restoreAllMocks();
	localStorage.clear();
});

describe('WeightChart', () => {
	it('lists one table row per visible point', async () => {
		// 13 points a week apart (84 days back): 5 inside 30 days, all inside 90 days. None is on a window edge.
		render(WeightChart, { series: series(13, 7), today });
		expect(rows()).toBe(13);
		await page.getByRole('radio', { name: '30 days' }).click();
		expect(rows()).toBe(5);
		await page.getByRole('radio', { name: 'All' }).click();
		expect(rows()).toBe(13);
	});

	it('shows the date, weight and trend of a point in its table row', async () => {
		render(WeightChart, {
			series: [{ date: '2026-11-07', kg: 71.24, trend: 70.86 }],
			today
		});
		const row = page.getByRole('row').nth(1);
		await expect.element(row).toHaveTextContent('Sat 7 Nov 2026');
		await expect.element(row).toHaveTextContent('71.2');
		await expect.element(row).toHaveTextContent('70.9');
	});

	it('draws no goal line without a goal, and one with it', async () => {
		const view = render(WeightChart, { series: series(10), today });
		expect(page.getByTestId('goal-line').elements()).toHaveLength(0);
		await view.rerender({
			series: series(10),
			today,
			goal: { from: '2026-11-02', trendKg: 70.4, kgPerWeek: 0.35 }
		});
		await expect.element(page.getByTestId('goal-line')).toBeInTheDocument();
	});

	it('says what is missing for no weigh-ins and for an empty range', async () => {
		const view = render(WeightChart, { series: [], today });
		await expect.element(page.getByText(/first weigh-in/)).toBeVisible();
		expect(page.getByRole('table').elements()).toHaveLength(0);
		await view.rerender({
			series: [{ date: addDays(today, -200), kg: 70, trend: 70 }],
			today
		});
		await page.getByRole('radio', { name: '30 days' }).click();
		await expect.element(page.getByText('No weigh-ins in this range')).toBeVisible();
		expect(page.getByRole('table').elements()).toHaveLength(0);
	});

	it('draws a dot for every visible point', async () => {
		const view = render(WeightChart, { series: series(1), today });
		expect(view.container.querySelectorAll('[data-dot]')).toHaveLength(1);
		await view.rerender({ series: series(12), today });
		expect(view.container.querySelectorAll('[data-dot]')).toHaveLength(12);
	});

	it('remembers the range on this device', async () => {
		const first = render(WeightChart, { series: series(13, 7), today });
		await page.getByRole('radio', { name: '30 days' }).click();
		first.unmount();
		render(WeightChart, { series: series(13, 7), today });
		await expect.element(page.getByRole('radio', { name: '30 days' })).toBeChecked();
	});

	it('works when storage is blocked', async () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		const errors: unknown[] = [];
		const onerror = (event: ErrorEvent) => errors.push(event.error);
		window.addEventListener('error', onerror);
		try {
			render(WeightChart, { series: series(13, 7), today });
			await page.getByRole('radio', { name: '30 days' }).click();
			await expect.element(page.getByRole('radio', { name: '30 days' })).toBeChecked();
		} finally {
			window.removeEventListener('error', onerror);
		}
		expect(errors).toEqual([]);
	});

	it('opens the tooltip for the latest point on focus and moves it with the arrow keys', async () => {
		render(WeightChart, {
			series: [
				{ date: '2026-11-05', kg: 70, trend: 70 },
				{ date: '2026-11-06', kg: 70.5, trend: 70.05 },
				{ date: '2026-11-07', kg: 71.2, trend: 70.2 }
			],
			today
		});
		const status = tooltip();
		await expect.poll(() => status.element().textContent?.trim()).toBe('');
		(plot().element() as HTMLElement).focus();
		await expect.element(status).toHaveTextContent('Sat 7 Nov');
		await expect.element(status).toHaveTextContent('71.2 kg');
		await expect.element(status).toHaveTextContent('Trend 70.2 kg');
		await expect
			.element(plot())
			.toHaveAttribute('aria-valuetext', 'Sat 7 Nov 2026, 71.2 kg, trend 70.2 kg');
		await userEvent.keyboard('{ArrowLeft}');
		await expect.element(status).toHaveTextContent('Fri 6 Nov');
		await expect.element(status).toHaveTextContent('70.5 kg');
		await expect.element(plot()).toHaveAttribute('aria-valuenow', '1');
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => status.element().textContent?.trim()).toBe('');
	});

	it('opens the tooltip on a touch tap, not only on hover', async () => {
		// Ten daily weigh-ins; a tap at the left edge reads the oldest, where focus alone would read today's.
		render(WeightChart, { series: series(10), today });
		// A real tap is a touch pointer, which has no hover before it, so it is sent as one.
		const box = plot().element().getBoundingClientRect();
		plot()
			.element()
			.dispatchEvent(
				new PointerEvent('pointerdown', {
					pointerType: 'touch',
					clientX: box.left + 46,
					clientY: box.top + 120,
					bubbles: true
				})
			);
		await expect.element(tooltip()).toHaveTextContent('Thu 29 Oct');
	});

	it('opens the tooltip on hover and closes it when the pointer leaves', async () => {
		render(WeightChart, { series: series(10), today });
		await plot().hover();
		await expect.element(tooltip()).toHaveTextContent(/kg/);
		await page.getByRole('radiogroup', { name: 'Range' }).hover();
		await expect.poll(() => tooltip().element().textContent?.trim()).toBe('');
	});

	// Five daily weigh-ins, Tue 3 Nov to Sat 7 Nov.
	const five = () => series(5);

	it('moves with Home and End, and stops at both ends', async () => {
		render(WeightChart, { series: five(), today });
		const tip = tooltip();
		const slider = plot();
		(slider.element() as HTMLElement).focus();
		await expect.element(slider).toHaveAttribute('aria-valuenow', '4');
		await userEvent.keyboard('{ArrowRight}');
		await expect.element(slider).toHaveAttribute('aria-valuenow', '4');
		await userEvent.keyboard('{Home}');
		await expect.element(slider).toHaveAttribute('aria-valuenow', '0');
		await expect.element(tip).toHaveTextContent('Tue 3 Nov');
		await userEvent.keyboard('{ArrowLeft}');
		await expect.element(slider).toHaveAttribute('aria-valuenow', '0');
		await userEvent.keyboard('{End}');
		await expect.element(slider).toHaveAttribute('aria-valuenow', '4');
		await expect.element(tip).toHaveTextContent('Sat 7 Nov');
	});

	it('reads ArrowUp as next and ArrowDown as previous, like a slider', async () => {
		render(WeightChart, { series: five(), today });
		const slider = plot();
		(slider.element() as HTMLElement).focus();
		await userEvent.keyboard('{ArrowDown}');
		await expect.element(slider).toHaveAttribute('aria-valuenow', '3');
		await userEvent.keyboard('{ArrowUp}');
		await expect.element(slider).toHaveAttribute('aria-valuenow', '4');
	});

	it('keeps a valid point when the series shrinks under the focus', async () => {
		const view = render(WeightChart, { series: series(10), today });
		const slider = plot();
		(slider.element() as HTMLElement).focus();
		await expect.element(slider).toHaveAttribute('aria-valuenow', '9');
		await view.rerender({ series: series(5), today });
		await expect.element(slider).toHaveAttribute('aria-valuemax', '4');
		await expect.element(slider).toHaveAttribute('aria-valuenow', '4');
		await expect.element(tooltip()).toHaveTextContent('Sat 7 Nov');
		await userEvent.keyboard('{ArrowRight}');
		await expect.element(slider).toHaveAttribute('aria-valuenow', '4');
		await userEvent.keyboard('{ArrowLeft}');
		await expect.element(slider).toHaveAttribute('aria-valuenow', '3');
	});

	it('closes the tooltip when a touch lands outside the chart', async () => {
		render(WeightChart, { series: series(10), today });
		const touch = (target: Element, clientX: number) =>
			target.dispatchEvent(
				new PointerEvent('pointerdown', {
					pointerType: 'touch',
					clientX,
					clientY: 10,
					bubbles: true
				})
			);
		const box = plot().element().getBoundingClientRect();
		touch(plot().element(), box.left + 46);
		await expect.element(tooltip()).toHaveTextContent(/kg/);
		touch(plot().element(), box.left + 46);
		await expect.element(tooltip()).toHaveTextContent(/kg/);
		touch(page.getByRole('radiogroup', { name: 'Range' }).element(), box.left);
		await expect.poll(() => tooltip().element().textContent?.trim()).toBe('');
	});
});
