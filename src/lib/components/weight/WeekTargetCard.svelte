<script lang="ts">
	import type { WeeklyTarget } from '#lib/server/db/schema.ts';
	import { Card } from '#lib/components/ui/index.ts';
	import TdeeBasis from '#lib/components/targets/TdeeBasis.svelte';

	/**
	 * This week's target on the Weight tab: the kcal, the TDEE it is built on and whether that TDEE is the formula or the
	 * adaptive estimate with its valid days. The page shows it only for this week's row.
	 */
	type Props = {
		week: Pick<WeeklyTarget, 'targetKcal' | 'tdeeUsed' | 'tdeeAdaptive' | 'validDays'>;
	};

	let { week }: Props = $props();

	const kcal = (value: number) => Math.round(value).toLocaleString('en-US');
</script>

<section aria-label="This week's target">
	<Card>
		<div class="flex flex-col gap-3">
			<div class="flex flex-col gap-1">
				<p class="text-sm font-medium text-text-muted">This week's target</p>
				<p class="text-3xl font-semibold tracking-tight text-text tabular-nums">
					{kcal(week.targetKcal)} kcal
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-text-muted tabular-nums">
				<span>TDEE used {kcal(week.tdeeUsed)} kcal</span>
				<TdeeBasis adaptive={week.tdeeAdaptive} validDays={week.validDays} />
			</div>
		</div>
	</Card>
</section>
