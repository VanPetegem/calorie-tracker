<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import ScanFace from '@lucide/svelte/icons/scan-face';
	import { Button, Input } from '#lib/components/ui/index.ts';
	import { signInPasskeyError } from '#lib/auth-errors.ts';
	import { createPasskeySignIn, type PasskeySignInResult } from '#lib/passkey-sign-in.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let passkeyPending = $state(false);
	let passkeyError = $state<string>();
	let email = $state('');
	let password = $state('');
	let passwordPending = $state(false);

	const passkey = createPasskeySignIn();

	async function finish(result: PasskeySignInResult) {
		if (!result.ok) return false;
		// `redirectTo` was checked on the server: always a path on this origin.
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- already an absolute app path
		await goto(data.redirectTo, { invalidateAll: true });
		return true;
	}

	/**
	 * Offers the passkey in the email field's autofill (1Password, iCloud Keychain). Runs until a passkey is
	 * picked; the button aborts it, then starts it again.
	 */
	async function startAutofill() {
		const available = await window.PublicKeyCredential?.isConditionalMediationAvailable?.();
		if (!available) return;
		const result = await passkey.signIn({ autofill: true });
		if (await finish(result)) return;
		// A cancelled ceremony usually means the button took over; it restarts the autofill when done.
		if (!result.ok && !result.cancelled) passkeyError = signInPasskeyError(result.error);
	}

	async function signInWithPasskey() {
		passkeyPending = true;
		passkeyError = undefined;
		const result = await passkey.signIn();
		if (await finish(result)) return;
		passkeyPending = false;
		if (!result.ok) passkeyError = signInPasskeyError(result.error);
		void startAutofill();
	}

	onMount(() => {
		// Fetch the challenge now: on iOS the tap must reach WebAuthn without waiting on the network.
		void passkey.prefetch().then(startAutofill);
	});
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

<!-- Always rendered: password managers (1Password on iOS) look for login fields when the page loads. -->
<div class="flex items-center gap-3 text-sm text-text-muted" aria-hidden="true">
	<span class="h-px flex-1 bg-border"></span>
	or
	<span class="h-px flex-1 bg-border"></span>
</div>

<form
	method="POST"
	class="flex flex-col gap-5"
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
		autocomplete="username webauthn"
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
