<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = {
		label: string;
		value: string;
		hint?: string;
		/** Set by the parent, normally on blur. The input never validates while typing. */
		error?: string;
		disabled?: boolean;
		readonly?: boolean;
		type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'date';
		inputmode?: HTMLInputAttributes['inputmode'];
		autocomplete?: HTMLInputAttributes['autocomplete'];
		name?: string;
		placeholder?: string;
		/** Unit shown inside the field after the text, e.g. "kg". */
		suffix?: string;
		onblur?: (event: FocusEvent & { currentTarget: HTMLInputElement }) => void;
		onkeydown?: (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => void;
		class?: string;
	};

	let {
		label,
		value = $bindable(),
		hint,
		error,
		disabled = false,
		readonly = false,
		type = 'text',
		inputmode,
		autocomplete,
		name,
		placeholder,
		suffix,
		onblur,
		onkeydown,
		class: className = ''
	}: Props = $props();

	const uid = $props.id();
	const inputId = `${uid}-input`;
	const hintId = `${uid}-hint`;
	const errorId = `${uid}-error`;

	const describedBy = $derived(
		[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined
	);
</script>

<div class={['flex flex-col gap-1.5', className]}>
	<label for={inputId} class="text-sm font-medium text-text">{label}</label>
	<div
		class={[
			'flex min-h-11 items-center gap-2 rounded-md border bg-surface px-3 transition-colors duration-100 ease-out',
			error ? 'border-danger' : 'border-border-strong',
			!disabled && !error && 'hover:border-text-muted',
			'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand',
			disabled && 'opacity-50'
		]}
	>
		<!-- 18 px text: iOS Safari zooms the page when an input is focused with text under 16 px. -->
		<input
			id={inputId}
			bind:value
			{type}
			{inputmode}
			{autocomplete}
			{name}
			{placeholder}
			{disabled}
			{readonly}
			{onblur}
			{onkeydown}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
			class={[
				'min-w-0 flex-1 bg-transparent py-2 text-lg text-text outline-none placeholder:text-text-muted',
				disabled ? 'cursor-not-allowed' : readonly && 'cursor-default'
			]}
		/>
		{#if suffix}
			<span class="shrink-0 text-base text-text-muted">{suffix}</span>
		{/if}
	</div>
	{#if hint}
		<p id={hintId} class="text-sm text-text-muted">{hint}</p>
	{/if}
	{#if error}
		<p id={errorId} role="alert" class="flex items-start gap-1.5 text-sm text-danger">
			<CircleAlert size={16} class="mt-px shrink-0" aria-hidden="true" />
			<span>{error}</span>
		</p>
	{/if}
</div>
