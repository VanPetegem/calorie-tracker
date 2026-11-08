<script lang="ts">
	import { TARGETS_HISTORY_LATEST } from '#lib/domain/constants.ts';
	import TdeeBasis from '#lib/components/targets/TdeeBasis.svelte';
	import { Button } from '#lib/components/ui/index.ts';
	import { formatDay, formatSigned, formatWhole } from '#lib/components/weight/chart.ts';
	import type { WeeklyTarget } from '#lib/server/db/schema.ts';

	/**
	 * One row per stored week, newest first: the week, its target kcal, the TDEE it used, whether that TDEE is the
	 * formula or the adaptive estimate (with its valid days) and the weekly rate. The newest weeks show first, then
	 * "Show all" lists the rest. The current week reads "This week".
	 */
	type Props = {
		rows: WeeklyTarget[];
		/** The Monday of the current week, `YYYY-MM-DD`. */
		currentWeekStart: string;
	};

	let { rows, currentWeekStart }: Props = $props();

	let all = $state(false);
	const shown = $derived(all ? rows : rows.slice(0, TARGETS_HISTORY_LATEST));
</script>

{#if rows.length === 0}
	<p class="text-base text-text-muted">No targets yet. The first one is made at onboarding.</p>
{:else}
	<ul
		aria-label="Weekly targets"
		class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
	>
		{#each shown as row (row.weekStart)}
			<li class="flex flex-col gap-1 px-4 py-3">
				<div class="flex items-baseline justify-between gap-3">
					<span class="text-base font-medium text-text">
						{row.weekStart === currentWeekStart
							? 'This week'
							: `Week of ${formatDay(row.weekStart, { year: true })}`}
					</span>
					<span class="text-base font-semibold text-text tabular-nums">
						{formatWhole(row.targetKcal)} kcal
					</span>
				</div>
				<div
					class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted tabular-nums"
				>
					<span>TDEE used {formatWhole(row.tdeeUsed)} kcal</span>
					<TdeeBasis adaptive={row.tdeeAdaptive} validDays={row.validDays} />
					<span>
						{row.rateKgPerWeek === null
							? 'No rate yet'
							: `${formatSigned(row.rateKgPerWeek, 2)} kg/week`}
					</span>
				</div>
			</li>
		{/each}
	</ul>
	{#if !all && rows.length > TARGETS_HISTORY_LATEST}
		<Button variant="secondary" onclick={() => (all = true)}>Show all</Button>
	{/if}
{/if}
