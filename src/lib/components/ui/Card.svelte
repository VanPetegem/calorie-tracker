<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		children: Snippet;
		padding?: 'sm' | 'md';
		as?: 'section' | 'div';
		class?: string;
	};

	let { children, padding = 'md', as: tag = 'div', class: className = '' }: Props = $props();
</script>

<svelte:element
	this={tag}
	class={[
		'rounded-lg border border-border bg-surface shadow-sm',
		padding === 'sm' ? 'p-3' : 'p-4',
		className
	]}
>
	{@render children()}
</svelte:element>
