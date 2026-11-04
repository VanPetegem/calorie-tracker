<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** Becomes the heading text. Component sections use the exact component name, which is also the heading `id`. */
		name: string;
		description?: string;
		children: Snippet;
	};

	let { name, description, children }: Props = $props();

	const id = $derived(name.replace(/\s+/g, '-'));
</script>

<section class="flex scroll-mt-6 flex-col gap-4" aria-labelledby={id}>
	<div class="flex flex-col gap-1">
		<h2 {id} class="text-2xl font-semibold text-text">{name}</h2>
		{#if description}
			<p class="max-w-prose text-base text-text-muted">{description}</p>
		{/if}
	</div>
	{@render children()}
</section>
