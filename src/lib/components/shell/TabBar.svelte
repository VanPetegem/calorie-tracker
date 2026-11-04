<script lang="ts">
	import { isActive, navItems } from './nav.ts';

	type Props = {
		/** The current path; decides which tab is active. */
		pathname: string;
		/** Landmark name. Only the shell's real bar is "Primary"; previews must pick another. */
		label?: string;
		/** Renders in the normal flow instead of fixed to the screen bottom (for the /design page). */
		preview?: boolean;
		class?: string;
	};

	let { pathname, label = 'Primary', preview = false, class: className = '' }: Props = $props();
</script>

<nav
	aria-label={label}
	class={['tabbar border-t border-border bg-surface', preview && 'preview', className]}
>
	<ul class="flex">
		{#each navItems as item (item.href)}
			{@const active = isActive(item.href, pathname)}
			<li class="min-w-0 flex-1">
				<!-- eslint-disable svelte/no-navigation-without-resolve -- navItems holds absolute app paths -->
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class={[
						'relative flex h-16 min-h-11 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-100 ease-out',
						active ? 'text-brand' : 'text-text-muted active:text-text'
					]}
				>
					{#if active}
						<span class="absolute top-0 h-0.5 w-8 rounded-full bg-brand" aria-hidden="true"></span>
					{/if}
					<item.icon size={24} aria-hidden="true" />
					{item.label}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</li>
		{/each}
	</ul>
</nav>

<style>
	/* The bar is 64 px of content plus the home indicator inset; Toaster sits 72 px above the inset. */
	.tabbar {
		position: fixed;
		inset-inline: 0;
		bottom: 0;
		z-index: 40;
		padding-bottom: env(safe-area-inset-bottom);
		padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
	}

	.tabbar.preview {
		position: static;
	}
</style>
