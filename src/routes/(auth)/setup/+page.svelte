<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input } from '#lib/components/ui/index.ts';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Set up · kcal</title>
</svelte:head>

<div class="flex flex-col gap-2">
	<h1 class="text-3xl font-semibold tracking-tight text-balance text-text">Create your account</h1>
	<p class="text-base text-pretty text-text-muted">
		kcal has one account. Once you create it, sign up closes.
	</p>
</div>

<form
	method="POST"
	class="flex flex-col gap-5"
	novalidate
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			// Keep what was typed when the server sends the form back with errors.
			await update({ reset: false });
			submitting = false;
		};
	}}
>
	<Input
		label="Name"
		name="name"
		autocomplete="name"
		bind:value={name}
		error={form?.errors?.name}
	/>
	<Input
		label="Email"
		name="email"
		type="email"
		inputmode="email"
		autocomplete="email"
		bind:value={email}
		error={form?.errors?.email}
	/>
	<Input
		label="Password"
		name="password"
		type="password"
		autocomplete="new-password"
		hint="At least 12 characters. A few random words work well."
		bind:value={password}
		error={form?.errors?.password}
	/>
	{#if form?.message}
		<p role="alert" class="text-sm text-danger">{form.message}</p>
	{/if}
	<Button type="submit" size="lg" loading={submitting} class="w-full">Create account</Button>
</form>
