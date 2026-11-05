<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import LogOut from '@lucide/svelte/icons/log-out';
	import { resolve } from '$app/paths';
	import { Button, Card, ListItem } from '#lib/components/ui/index.ts';
	import { signOut } from '#lib/auth-client.ts';
	import { toasts } from '#lib/stores/toasts.svelte.ts';

	let signingOut = $state(false);

	async function handleSignOut() {
		signingOut = true;
		if (!(await signOut())) {
			signingOut = false;
			toasts.show({ message: 'Couldn’t sign out. Check your connection.', tone: 'danger' });
		}
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
	<Button variant="secondary" icon={LogOut} loading={signingOut} onclick={handleSignOut}>
		Sign out
	</Button>
</div>
