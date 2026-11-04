<script lang="ts">
	type Props = {
		value: number;
		max: number;
		tone?: 'brand' | 'protein' | 'carbs' | 'fat';
		label: string;
		class?: string;
	};

	let { value, max, tone = 'brand', label, class: className = '' }: Props = $props();

	const fills = {
		brand: 'bg-brand',
		protein: 'bg-protein',
		carbs: 'bg-carbs',
		fat: 'bg-fat'
	} as const;

	const percent = $derived(max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0);
	// Going over is not an error (it is the goal when gaining), so it gets an end cap, not a warning color.
	const over = $derived(value > max);
</script>

<div
	role="progressbar"
	aria-label={label}
	aria-valuemin="0"
	aria-valuemax={max}
	aria-valuenow={value}
	data-over={over ? 'true' : undefined}
	class={['h-2 w-full overflow-hidden rounded-full bg-text/10', className]}
>
	<div
		data-fill
		style:width="{percent}%"
		class={['relative h-full rounded-full transition-width duration-200 ease-out', fills[tone]]}
	>
		{#if over}
			<span class="absolute inset-y-0 right-0 w-1 rounded-full bg-text" aria-hidden="true"></span>
		{/if}
	</div>
</div>
