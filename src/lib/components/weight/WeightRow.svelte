<script lang="ts">
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { TrendPoint } from '#lib/domain/trend.ts';
	import { IconButton, ListItem } from '#lib/components/ui/index.ts';
	import { formatDay, formatKg } from './chart.ts';

	/**
	 * One weigh-in in the history: its date, weight and the trend on that day. A tap on the row edits it; the trash
	 * button deletes it (the caller offers Undo, there is no confirm). Both are buttons, so nothing depends on a
	 * swipe or a hover. The caller wraps the row in an `<li>`.
	 */
	type Props = {
		point: TrendPoint;
		onedit: (point: TrendPoint) => void;
		ondelete: (point: TrendPoint) => void;
	};

	let { point, onedit, ondelete }: Props = $props();

	const day = $derived(formatDay(point.date, { year: true }));
</script>

<div class="flex items-center pr-1">
	<ListItem
		title={day}
		subtitle="Trend {formatKg(point.trend)} kg"
		onclick={() => onedit(point)}
		class="min-w-0 flex-1"
	>
		{#snippet trailing()}
			<span class="text-base font-medium text-text tabular-nums">{formatKg(point.kg)} kg</span>
		{/snippet}
	</ListItem>
	<IconButton label="Delete weigh-in of {day}" icon={Trash2} onclick={() => ondelete(point)} />
</div>
