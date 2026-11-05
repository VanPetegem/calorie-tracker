<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import LogOut from '@lucide/svelte/icons/log-out';
	import { resolve } from '$app/paths';
	import { Button, Card, ListItem } from '#lib/components/ui/index.ts';
	import { signOutOrWarn } from '#lib/auth-client.ts';

	let signingOut = $state(false);

	async function handleSignOut() {
		signingOut = true;
		if (!(await signOutOrWarn())) signingOut = false;
	}
</script>

<svelte:head>
	<title>Settings · kcal</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<h1 class="text-3xl font-semibold tracking-tight text-text">Settings</h1>
	<Card>
		<p class="text-base text-text-muted">
			Your profile, calorie goal and units will live here. Nothing to set up yet.
		</p>
	</Card>
	<div class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
		<ListItem
			title="Security"
			subtitle="Passkeys and sign out"
			href={resolve('/(app)/settings/security')}
		>
			{#snippet trailing()}
				<ChevronRight size={20} aria-hidden="true" />
			{/snippet}
		</ListItem>
		<ListItem
			title="Design system"
			subtitle="Tokens and components"
			href={resolve('/(app)/design')}
		>
			{#snippet trailing()}
				<ChevronRight size={20} aria-hidden="true" />
			{/snippet}
		</ListItem>
	</div>
	<section class="flex flex-col gap-2" aria-labelledby="sources-heading">
		<h2 id="sources-heading" class="text-lg font-semibold text-text">Data sources</h2>
		<p class="text-sm text-text-muted">
			Generic foods: Swiss Food Composition Database (BLV), version 7.1, Federal Food Safety and
			Veterinary Office FSVO,
			<a class="underline" href="https://naehrwertdaten.ch" rel="noreferrer" target="_blank"
				>naehrwertdaten.ch</a
			>.
		</p>
		<p class="text-sm text-text-muted">
			Products: Open Food Facts, available under the
			<a
				class="underline"
				href="https://opendatacommons.org/licenses/odbl/1-0/"
				rel="noreferrer"
				target="_blank">Open Database Licence</a
			>, with contributors credited at
			<a class="underline" href="https://openfoodfacts.org" rel="noreferrer" target="_blank"
				>openfoodfacts.org</a
			>.
		</p>
	</section>
	<Button variant="secondary" icon={LogOut} loading={signingOut} onclick={handleSignOut}>
		Sign out
	</Button>
</div>
