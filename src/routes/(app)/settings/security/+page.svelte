<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LogIn from '@lucide/svelte/icons/log-in';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button, EmptyState, IconButton, ListItem, Sheet } from '#lib/components/ui/index.ts';
	import { authClient, deviceName, signOutOrWarn } from '#lib/auth-client.ts';
	import { addPasskeyError } from '#lib/auth-errors.ts';
	import { toasts, type ToastOptions } from '#lib/stores/toasts.svelte.ts';
	import type { PageProps } from './$types';

	type Passkey = PageProps['data']['passkeys'][number];

	let { data }: PageProps = $props();

	const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

	let adding = $state(false);
	/** Set when adding a passkey needs a fresh sign in first. */
	let reauthMessage = $state<string>();
	let reauthing = $state(false);
	let signingOut = $state(false);
	let toDelete = $state<Passkey>();
	let confirmOpen = $state(false);
	let deleting = $state(false);
	// Toasts render behind a modal sheet, so the result of a delete is shown once the sheet has closed.
	let afterClose: ToastOptions | undefined;

	const label = (passkey: Passkey) => passkey.name || 'Passkey';

	async function addPasskey() {
		adding = true;
		reauthMessage = undefined;
		const result = await authClient.passkey.addPasskey({ name: deviceName() });
		adding = false;
		if (result.error) {
			const { message, signInAgain } = addPasskeyError(result.error);
			if (signInAgain) reauthMessage = message;
			else toasts.show({ message, tone: 'danger' });
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
		// Kept locally: closing the sheet while the request runs clears toDelete.
		const passkey = toDelete;
		if (!passkey) return;
		deleting = true;
		const result = await authClient.passkey.deletePasskey({ id: passkey.id });
		let outcome: ToastOptions;
		if (result.error) {
			outcome = { message: 'Couldn’t delete the passkey. Try again.', tone: 'danger' };
		} else {
			await invalidateAll();
			outcome = { message: `${label(passkey)} passkey deleted`, tone: 'success' };
		}
		deleting = false;
		if (confirmOpen && toDelete === passkey) {
			afterClose = outcome;
			confirmOpen = false;
		} else {
			// The sheet was already closed: there is no close left to wait for.
			toasts.show(outcome);
		}
	}

	function handleSheetClose() {
		toDelete = undefined;
		if (afterClose) toasts.show(afterClose);
		afterClose = undefined;
	}

	/** Signs out and comes back here after the next sign in, with a fresh session. */
	async function signInAgain() {
		reauthing = true;
		const to = `/login?redirectTo=${encodeURIComponent('/settings/security')}`;
		if (!(await signOutOrWarn(to))) reauthing = false;
	}

	async function handleSignOut() {
		signingOut = true;
		if (!(await signOutOrWarn())) signingOut = false;
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
		{#if reauthMessage}
			<div class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
				<p role="alert" class="text-base text-pretty text-text">{reauthMessage}</p>
				<Button icon={LogIn} loading={reauthing} onclick={signInAgain}>Sign in again</Button>
			</div>
		{/if}
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
