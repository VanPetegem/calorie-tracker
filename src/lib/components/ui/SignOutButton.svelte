<script lang="ts">
	import LogOut from '@lucide/svelte/icons/log-out';
	import { signOutOrWarn } from '#lib/auth-client.ts';
	import Button from './Button.svelte';

	// Stays busy while the sign out runs. A success navigates away, so only a failed attempt turns the button back on.
	let signingOut = $state(false);

	async function handleSignOut() {
		signingOut = true;
		if (!(await signOutOrWarn())) signingOut = false;
	}
</script>

<Button variant="secondary" icon={LogOut} loading={signingOut} onclick={handleSignOut}>
	Sign out
</Button>
