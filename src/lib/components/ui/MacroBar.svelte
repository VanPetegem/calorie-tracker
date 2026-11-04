<script lang="ts">
	import ProgressBar from './ProgressBar.svelte';

	type Props = {
		macro: 'protein' | 'carbs' | 'fat';
		current: number;
		target: number;
		class?: string;
	};

	let { macro, current, target, class: className = '' }: Props = $props();

	const names = { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' } as const;
	const name = $derived(names[macro]);
</script>

<div class={['flex flex-col gap-1.5', className]}>
	<div class="flex items-baseline justify-between gap-2">
		<span class="text-sm font-medium text-text">{name}</span>
		<span class="text-sm text-text-muted tabular-nums">
			{Math.round(current)} / {Math.round(target)} g
		</span>
	</div>
	<ProgressBar value={current} max={target} tone={macro} label={name} />
</div>
