<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
		children: Snippet;
		class?: string;
	};

	let { tone = 'neutral', children, class: className = '' }: Props = $props();

	// Text always uses the primary text color, which keeps 4.5:1 on every tint. The tone shows in the dot and the tint.
	const tones = {
		neutral: { tint: 'bg-surface-raised', dot: '' },
		brand: { tint: 'bg-brand/15', dot: 'bg-brand' },
		success: { tint: 'bg-success/15', dot: 'bg-success' },
		warning: { tint: 'bg-warning/15', dot: 'bg-warning' },
		danger: { tint: 'bg-danger/15', dot: 'bg-danger' }
	} as const;
</script>

<span
	class={[
		'inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-sm font-medium text-text',
		tones[tone].tint,
		className
	]}
>
	{#if tones[tone].dot}
		<span class={['size-1.5 rounded-full', tones[tone].dot]} aria-hidden="true"></span>
	{/if}
	{@render children()}
</span>
