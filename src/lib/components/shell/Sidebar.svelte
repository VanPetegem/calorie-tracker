<script lang="ts">
	import { isActive, navItems } from './nav.ts';

	type Props = {
		/** The current path; decides which item is active. */
		pathname: string;
		/** Landmark name. Only the shell's real sidebar is "Primary"; previews must pick another. */
		label?: string;
		/** Renders in the normal flow instead of fixed to the left edge (for the /design page). */
		preview?: boolean;
		class?: string;
	};

	let { pathname, label = 'Primary', preview = false, class: className = '' }: Props = $props();
</script>

<nav
	aria-label={label}
	class={[
		'sidebar flex-col gap-6 border-r border-border bg-surface px-3 py-6',
		preview && 'preview flex rounded-lg border',
		className
	]}
>
	<p class="px-3 text-2xl font-semibold tracking-tight text-text">kcal</p>
	<ul class="flex flex-col gap-1">
		{#each navItems as item (item.href)}
			{@const active = isActive(item.href, pathname)}
			<li>
				<!-- eslint-disable svelte/no-navigation-without-resolve -- navItems holds absolute app paths -->
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class={[
						'flex min-h-11 items-center gap-3 rounded-md px-3 text-base font-medium transition-colors duration-100 ease-out',
						active
							? 'bg-surface-raised text-brand'
							: 'text-text-muted hover:bg-text/5 hover:text-text active:bg-text/10'
					]}
				>
					<item.icon size={24} aria-hidden="true" />
					{item.label}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</li>
		{/each}
	</ul>
</nav>

<style>
	.sidebar {
		position: fixed;
		inset-block: 0;
		left: 0;
		z-index: 40;
		width: 240px;
	}

	.sidebar.preview {
		position: static;
		width: 100%;
		max-width: 240px;
	}
</style>
