<script lang="ts">
	import type { BatchSummary } from '#lib/server/batches/repo.ts';
	import { ListItem } from '#lib/components/ui/index.ts';

	/**
	 * One batch in the add sheet and the Recipes tab: its name, "N of M portions left" (never below 0, though the raw
	 * value can go negative) and the kcal of one portion. A finished batch says so. With `onpick` the row is a button
	 * (the add sheet), with `href` a link to the batch page; the caller wraps it in an `<li>` and passes a resolved `href`.
	 */
	type Props = {
		batch: BatchSummary;
		onpick?: (batch: BatchSummary) => void;
		href?: string;
	};

	let { batch, onpick, href }: Props = $props();

	const round1 = (value: number) => Math.round(value * 10) / 10;
	const subtitle = $derived.by(() => {
		const left = round1(Math.max(0, batch.portionsLeft));
		const total = round1(batch.portions);
		const text = `${left} of ${total} portion${total === 1 ? '' : 's'} left`;
		return batch.finishedAt === null ? text : `Finished · ${text}`;
	});
</script>

<ListItem title={batch.name} {subtitle} {href} onclick={onpick ? () => onpick(batch) : undefined}>
	{#snippet trailing()}
		<span class="flex flex-col items-end">
			<span class="text-base font-medium text-text tabular-nums">
				{Math.round(batch.perPortion.kcal)} kcal
			</span>
			<span class="text-sm text-text-muted">per portion</span>
		</span>
	{/snippet}
</ListItem>
