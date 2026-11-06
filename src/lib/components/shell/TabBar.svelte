<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { isActive, navItems } from './nav.ts';

	type Props = {
		/** The current path; decides which tab is active. */
		pathname: string;
		/** Landmark name. Only the shell's real bar is "Primary"; previews must pick another. */
		label?: string;
		/** Renders in the normal flow instead of fixed to the screen bottom (for the /design page). */
		preview?: boolean;
		/** The round add button in the middle of the bar. */
		onadd: () => void;
		class?: string;
	};

	let {
		pathname,
		label = 'Primary',
		preview = false,
		onadd,
		class: className = ''
	}: Props = $props();

	// The add button sits between the second and third destination.
	const MIDDLE = Math.ceil(navItems.length / 2);
</script>

<nav
	aria-label={label}
	class={['tabbar border-t border-border bg-surface', preview && 'preview', className]}
>
	<ul class="flex">
		{#each navItems as item, index (item.href)}
			{@const active = isActive(item.href, pathname)}
			{#if index === MIDDLE}
				<li class="flex min-w-0 flex-1 items-center justify-center">
					<button
						type="button"
						aria-label="Add food"
						onclick={onadd}
						class="inline-flex size-12 cursor-pointer items-center justify-center rounded-full bg-brand-solid text-on-brand shadow-md outline-hidden transition duration-100 ease-out hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:scale-95 active:brightness-95"
					>
						<Plus size={24} aria-hidden="true" />
					</button>
				</li>
			{/if}
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
