<script lang="ts">
	import { ADAPTIVE_WINDOW_DAYS, MIN_VALID_DAYS, MIN_WEIGH_INS } from '#lib/domain/constants.ts';
	import type { WeeklyTarget } from '#lib/server/db/schema.ts';
	import { Card } from '#lib/components/ui/index.ts';
	import { formatWhole } from '#lib/components/weight/chart.ts';

	/** This week's target with its macros, and two sentences on where it comes from. */
	type Props = { target: WeeklyTarget };

	let { target }: Props = $props();

	const uid = $props.id();

	// Until the adaptive gate passes, the target rests on the formula alone.
	const explanation = $derived(
		target.tdeeAdaptive === null
			? `This target is a formula estimate for now. It adapts every Monday once you have ${MIN_VALID_DAYS} days of logged food and ${MIN_WEIGH_INS} weigh-ins.`
			: `This target adapts to your log and your weight trend: ${target.validDays} days of logged food and ${target.weighIns} weigh-ins in the last ${ADAPTIVE_WINDOW_DAYS} days.`
	);

	const macros = $derived([
		{ name: 'Protein', grams: target.proteinG },
		{ name: 'Fat', grams: target.fatG },
		{ name: 'Carbs', grams: target.carbsG }
	]);
</script>

<Card>
	<section class="flex flex-col gap-4" aria-labelledby="{uid}-heading">
		<div class="flex flex-col gap-1">
			<h2 id="{uid}-heading" class="text-lg font-semibold text-text">Your target</h2>
			<p class="text-5xl font-semibold tracking-tight text-text tabular-nums">
				{formatWhole(target.targetKcal)}
			</p>
			<p class="text-base text-text-muted">kcal a day</p>
		</div>
		<dl class="grid grid-cols-3 gap-3">
			{#each macros as macro (macro.name)}
				<div class="flex flex-col gap-0.5">
					<dt class="text-sm text-text-muted">{macro.name}</dt>
					<dd class="text-lg font-semibold text-text tabular-nums">{formatWhole(macro.grams)} g</dd>
				</div>
			{/each}
		</dl>
		<p class="text-base text-text-muted">{explanation}</p>
		{#if target.carbsFloored}
			<p class="text-sm text-text-muted">
				Protein and fat use the whole target, so carbs stay at 0 g.
			</p>
		{/if}
	</section>
</Card>
