<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { IconComponent } from './types';

	type Props = {
		icon: IconComponent;
		title: string;
		body: string;
		action?: Snippet;
		class?: string;
	};

	let { icon: Icon, title, body, action, class: className = '' }: Props = $props();
</script>

<div class={['flex flex-col items-center gap-3 px-6 py-10 text-center', className]}>
	<span
		class="flex size-12 items-center justify-center rounded-full bg-surface-raised text-text-muted"
	>
		<Icon size={24} aria-hidden="true" />
	</span>
	<h3 class="text-lg font-medium text-text">{title}</h3>
	<p class="max-w-xs text-base text-text-muted">{body}</p>
	{#if action}
		<div class="mt-2">{@render action()}</div>
	{/if}
</div>
