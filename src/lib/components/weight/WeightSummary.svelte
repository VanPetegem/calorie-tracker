<script lang="ts">
	import { RATE_WINDOW_DAYS } from '#lib/domain/constants.ts';
	import { Card } from '#lib/components/ui/index.ts';
	import { formatKg, formatSigned } from './chart.ts';

	/**
	 * The weight trend today and the weekly rate. The rate is signed (a gain is "+0.24 kg/week") and shown in percent
	 * of the trend as well; until there are RATE_WINDOW_DAYS days of history it says when the rate comes. Without a
	 * trend (no weigh-in up to today) it says so and shows no numbers.
	 */
	type Props = {
		trendKg: number | null;
		rate: { kg: number; pct: number } | null;
	};

	let { trendKg, rate }: Props = $props();
</script>

<Card>
	{#if trendKg === null}
		<p class="text-base text-text-muted">No weigh-ins up to today yet</p>
	{:else}
		<dl class="grid grid-cols-2 gap-4">
			<div class="flex min-w-0 flex-col gap-1">
				<dt class="text-sm font-medium text-text-muted">Trend weight</dt>
				<dd class="text-3xl font-semibold text-text tabular-nums" data-testid="trend">
					{formatKg(trendKg)} kg
				</dd>
			</div>
			<div class="flex min-w-0 flex-col gap-1">
				<dt class="text-sm font-medium text-text-muted">Weekly rate</dt>
				{#if rate}
					<dd class="flex flex-col text-text tabular-nums" data-testid="rate">
						<span class="text-2xl font-semibold">{formatSigned(rate.kg, 2)} kg/week</span>
						<span class="text-sm text-text-muted">{formatSigned(rate.pct, 2)} %</span>
					</dd>
				{:else}
					<dd class="text-base text-text-muted">
						Rate after {RATE_WINDOW_DAYS} days of weigh-ins
					</dd>
				{/if}
			</div>
		</dl>
	{/if}
</Card>
