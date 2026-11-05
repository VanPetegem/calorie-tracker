<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ScanFace from '@lucide/svelte/icons/scan-face';
	import { Button, Input } from '#lib/components/ui/index.ts';
	import { authClient } from '#lib/auth-client.ts';
	import { signInPasskeyError } from '#lib/auth-errors.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let passkeyPending = $state(false);
	let passkeyError = $state<string>();
	let email = $state('');
	let password = $state('');
	let passwordPending = $state(false);

	async function signInWithPasskey() {
		passkeyPending = true;
		passkeyError = undefined;
		const result = await authClient.signIn.passkey();
		if (result.error) {
			passkeyPending = false;
			passkeyError = signInPasskeyError(result.error);
			return;
		}
		// `redirectTo` was checked on the server: always a path on this origin.
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- already an absolute app path
		await goto(data.redirectTo, { invalidateAll: true });
	}
</script>

<svelte:head>
	<title>Sign in · kcal</title>
</svelte:head>

<div class="flex flex-col gap-2">
	<h1 class="text-3xl font-semibold tracking-tight text-text">Sign in</h1>
	<p class="text-base text-pretty text-text-muted">Use Face ID or Touch ID on this device.</p>
</div>

<div class="flex flex-col gap-3">
	<Button
		size="lg"
		icon={ScanFace}
		loading={passkeyPending}
		onclick={signInWithPasskey}
		class="w-full"
	>
		Sign in with passkey
	</Button>
	{#if passkeyError}
		<p role="alert" class="text-sm text-danger">{passkeyError}</p>
	{/if}
</div>

<!-- Open after a failed password attempt, so the error stays in view. -->
<details class="group border-t border-border pt-2" open={form ? true : undefined}>
	<summary
		class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md text-base text-text-muted transition-colors duration-100 ease-out outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
	>
		Use email and password instead
		<ChevronDown
			size={20}
			class="shrink-0 transition-transform duration-200 ease-in-out group-open:rotate-180 motion-reduce:transition-none"
			aria-hidden="true"
		/>
	</summary>
	<form
		method="POST"
		class="flex flex-col gap-5 pt-4"
		use:enhance={() => {
			passwordPending = true;
			return async ({ update }) => {
				await update({ reset: false });
				passwordPending = false;
			};
		}}
	>
		<Input
			label="Email"
			name="email"
			type="email"
			inputmode="email"
			autocomplete="username"
			bind:value={email}
		/>
		<Input
			label="Password"
			name="password"
			type="password"
			autocomplete="current-password"
			bind:value={password}
		/>
		{#if form?.message}
			<p role="alert" class="text-sm text-danger">{form.message}</p>
		{/if}
		<Button type="submit" variant="secondary" loading={passwordPending} class="w-full">
			Sign in
		</Button>
	</form>
</details>

<style>
	/* Safari still draws the disclosure triangle with `list-style: none`; the chevron replaces it. */
	summary::-webkit-details-marker {
		display: none;
	}
</style>
