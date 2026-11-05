<script lang="ts">
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<!-- Login and setup have no app shell. The installed app draws under the status bar, so this pads by the insets. -->
<div class="screen">
	<main class="mx-auto flex w-full max-w-sm flex-col gap-8">
		<p class="text-lg font-semibold tracking-tight text-text" aria-hidden="true">
			kcal<span class="text-brand">.</span>
		</p>
		{@render children()}
	</main>
</div>

<style>
	.screen {
		min-height: 100dvh;
		/* Tailwind's 4 px spacing step: 12 = 48 px, 8 = 32 px, 4 = 16 px. */
		padding-top: calc(env(safe-area-inset-top) + var(--spacing) * 12);
		padding-bottom: calc(env(safe-area-inset-bottom) + var(--spacing) * 8);
		padding-inline: max(calc(var(--spacing) * 4), env(safe-area-inset-left))
			max(calc(var(--spacing) * 4), env(safe-area-inset-right));
	}
</style>
