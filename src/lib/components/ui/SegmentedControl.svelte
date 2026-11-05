<script lang="ts" generics="T extends string">
	type Props = {
		options: { value: T; label: string }[];
		value: T;
		/** Accessible name of the group. */
		label: string;
		class?: string;
	};

	let { options, value = $bindable(), label, class: className = '' }: Props = $props();

	function onkeydown(event: KeyboardEvent & { currentTarget: HTMLElement }, index: number) {
		const last = options.length - 1;
		let next: number;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				next = index === last ? 0 : index + 1;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				next = index === 0 ? last : index - 1;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = last;
				break;
			default:
				return;
		}
		event.preventDefault();
		value = options[next].value;
		// Move focus with the selection (roving tabindex): the radios are the group's only children.
		(event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
	}
</script>

<div
	role="radiogroup"
	aria-label={label}
	class={['inline-flex rounded-md border border-border-strong bg-surface p-0.5', className]}
>
	{#each options as option, index (option.value)}
		{@const checked = option.value === value}
		<button
			type="button"
			role="radio"
			aria-checked={checked}
			tabindex={checked ? 0 : -1}
			onclick={() => (value = option.value)}
			onkeydown={(event) => onkeydown(event, index)}
			class={[
				'min-h-11 flex-1 cursor-pointer rounded-sm px-4 text-base font-medium whitespace-nowrap transition-colors duration-100 ease-out',
				checked ? 'bg-brand-solid text-on-brand' : 'text-text hover:bg-text/5'
			]}
		>
			{option.label}
		</button>
	{/each}
</div>
