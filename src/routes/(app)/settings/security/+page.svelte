<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, EmptyState, IconButton, ListItem, Sheet } from '#lib/components/ui/index.ts';
	import { authClient, deviceName, signOut } from '#lib/auth-client.ts';
	import { toasts, type ToastOptions } from '#lib/stores/toasts.svelte.ts';
	import type { PageProps } from './$types';

	type Passkey = PageProps['data']['passkeys'][number];

	let { data }: PageProps = $props();

	const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

	let adding = $state(false);
	let signingOut = $state(false);
	let toDelete = $state<Passkey>();
	let confirmOpen = $state(false);
	let deleting = $state(false);
	// Toasts render behind a modal sheet, so the result of a delete is shown once the sheet has closed.
	let afterClose: ToastOptions | undefined;

	const label = (passkey: Passkey) => passkey.name || 'Passkey';

	async function addPasskey() {
		adding = true;
		const result = await authClient.passkey.addPasskey({ name: deviceName() });
		adding = false;
		if (result.error) {
			toasts.show({
				message: result.error.message ?? 'The passkey was not saved.',
				tone: 'danger'
			});
			return;
		}
		await invalidateAll();
		toasts.show({ message: 'Passkey added', tone: 'success' });
	}

	function askToDelete(passkey: Passkey) {
		toDelete = passkey;
		confirmOpen = true;
	}

	async function confirmDelete() {
		if (!toDelete) return;
		deleting = true;
		const result = await authClient.passkey.deletePasskey({ id: toDelete.id });
		if (result.error) {
			afterClose = { message: 'Couldn’t delete the passkey. Try again.', tone: 'danger' };
		} else {
			await invalidateAll();
			afterClose = { message: `${label(toDelete)} passkey deleted`, tone: 'success' };
		}
		deleting = false;
		confirmOpen = false;
	}

	function handleSheetClose() {
		toDelete = undefined;
		if (afterClose) toasts.show(afterClose);
		afterClose = undefined;
	}

	async function handleSignOut() {
		signingOut = true;
		if (!(await signOut())) {
			signingOut = false;
			toasts.show({ message: 'Couldn’t sign out. Check your connection.', tone: 'danger' });
		}
	}
</script>

<svelte:head>
	<title>Security · kcal</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<a
			href={resolve('/(app)/settings')}
			class="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-md pr-2 text-base text-text-muted transition-colors duration-100 ease-out hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
		>
			<ChevronLeft size={20} aria-hidden="true" />
			Settings
		</a>
		<h1 class="text-3xl font-semibold tracking-tight text-text">Security</h1>
	</div>

	<section class="flex flex-col gap-3" aria-labelledby="passkeys-heading">
		<div class="flex flex-col gap-1">
			<h2 id="passkeys-heading" class="text-lg font-semibold text-text">Passkeys</h2>
			<p class="text-sm text-pretty text-text-muted">
				Sign in with Face ID or Touch ID. Each device keeps its own passkey.
			</p>
		</div>

		{#if data.passkeys.length === 0}
			<EmptyState
				icon={KeyRound}
				title="No passkeys yet"
				body="Add one to sign in on this device without your password."
			/>
		{:else}
			<ul
				class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
				aria-label="Passkeys"
			>
				{#each data.passkeys as passkey (passkey.id)}
					<li>
						<ListItem
							title={label(passkey)}
							subtitle={passkey.createdAt
								? `Added ${dateFormat.format(passkey.createdAt)}`
								: undefined}
						>
							{#snippet trailing()}
								<IconButton
									icon={Trash2}
									label={`Delete ${label(passkey)} passkey`}
									onclick={() => askToDelete(passkey)}
								/>
							{/snippet}
						</ListItem>
					</li>
				{/each}
			</ul>
		{/if}

		<Button variant="secondary" icon={Plus} loading={adding} onclick={addPasskey}>
			Add a passkey
		</Button>
	</section>

	<section class="flex flex-col gap-3" aria-labelledby="session-heading">
		<h2 id="session-heading" class="text-lg font-semibold text-text">This device</h2>
		<Button variant="secondary" icon={LogOut} loading={signingOut} onclick={handleSignOut}>
			Sign out
		</Button>
	</section>
</div>

<Sheet
	bind:open={confirmOpen}
	title={`Delete ${toDelete ? label(toDelete) : ''} passkey?`}
	description="You won’t be able to sign in with it again. This can’t be undone."
	onclose={handleSheetClose}
>
	<p class="text-base text-text-muted">Your other passkeys and your password keep working.</p>
	{#snippet footer()}
		<Button variant="secondary" onclick={() => (confirmOpen = false)}>Cancel</Button>
		<Button variant="destructive" icon={Trash2} loading={deleting} onclick={confirmDelete}>
			Delete
		</Button>
	{/snippet}
</Sheet>
