<script lang="ts">
	type Props = {
		/** Any CSS length, e.g. "100%" or "6rem". */
		width?: string;
		height?: string;
		rounded?: 'sm' | 'md' | 'lg' | 'full';
		class?: string;
	};

	let { width = '100%', height = '1rem', rounded = 'md', class: className = '' }: Props = $props();

	const radii = {
		sm: 'rounded-sm',
		md: 'rounded-md',
		lg: 'rounded-lg',
		full: 'rounded-full'
	} as const;
</script>

<div
	aria-hidden="true"
	style:width
	style:height
	class={['animate-pulse bg-text/10 motion-reduce:animate-none', radii[rounded], className]}
></div>
