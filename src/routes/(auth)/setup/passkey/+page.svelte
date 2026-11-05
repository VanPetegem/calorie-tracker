<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ScanFace from '@lucide/svelte/icons/scan-face';
	import { Button } from '#lib/components/ui/index.ts';
	import { authClient, deviceName } from '#lib/auth-client.ts';
	import { addPasskeyError } from '#lib/auth-errors.ts';

	let adding = $state(false);
	let error = $state<string>();

	async function addPasskey() {
		adding = true;
		error = undefined;
		const result = await authClient.passkey.addPasskey({ name: deviceName() });
		adding = false;
		if (result.error) {
			error = `${addPasskeyError(result.error).message} You can also skip and add one later in Settings.`;
			return;
		}
		await goto(resolve('/(app)'));
	}
</script>

<svelte:head>
	<title>Add a passkey · kcal</title>
</svelte:head>

<div class="flex flex-col gap-2">
	<h1 class="text-3xl font-semibold tracking-tight text-balance text-text">
		Sign in with your face
	</h1>
	<p class="text-base text-pretty text-text-muted">
		Save a passkey on this device. Next time, Face ID or Touch ID signs you in without a password.
	</p>
</div>

<div class="flex flex-col gap-3">
	<Button size="lg" icon={ScanFace} loading={adding} onclick={addPasskey} class="w-full">
		Add Face ID / Touch ID
	</Button>
	{#if error}
		<p role="alert" class="text-sm text-danger">{error}</p>
	{/if}
	<Button variant="ghost" href={resolve('/(app)')} class="w-full">Skip</Button>
</div>
