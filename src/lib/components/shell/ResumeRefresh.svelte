<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	/**
	 * Reloads the page data when the installed app comes back to the foreground. The day pages fix their date when
	 * they load, so an app resumed the next morning would otherwise still log to yesterday; on `/` the reload also
	 * moves the view to the new today. Renders nothing.
	 */
	async function onvisibilitychange() {
		if (document.visibilityState !== 'visible') return;
		// A failed refresh (offline on resume) leaves the old data on screen, which is what the person had.
		try {
			await invalidateAll();
		} catch {
			// ignored on purpose
		}
	}
</script>

<svelte:document {onvisibilitychange} />
