<script lang="ts">
	import Flashlight from '@lucide/svelte/icons/flashlight';
	import FlashlightOff from '@lucide/svelte/icons/flashlight-off';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { Button, IconButton, Input } from '#lib/components/ui/index.ts';

	/**
	 * What the scanner shows, without any camera logic: the viewfinder or the reason there is none, the outcome of
	 * the last lookup, and the manual barcode field, which is always there.
	 *
	 * `camera` is the state of the camera and `status` the outcome of the last lookup. `ScannerView` drives both;
	 * the /design route sets them by hand to show every state. `video` is the element the stream is attached to.
	 */
	export type ScannerCamera = 'starting' | 'scanning' | 'denied' | 'unsupported';
	export type ScannerStatus = 'idle' | 'looking' | 'invalid' | 'unavailable';

	type Props = {
		camera: ScannerCamera;
		status?: ScannerStatus;
		/** The code the last lookup was for; shown with the unreachable message. */
		barcode?: string;
		video?: HTMLVideoElement;
		torchAvailable?: boolean;
		torchOn?: boolean;
		ontorch?: () => void;
		/** Looks up a typed code. */
		onmanual: (code: string) => void;
		/** Opens the food form with the barcode, after the product database could not be reached. */
		onenter?: () => void;
		/** Clears a lookup outcome and scans again. */
		onrescan?: () => void;
		onback: () => void;
	};

	let {
		camera,
		status = 'idle',
		barcode,
		video = $bindable(),
		torchAvailable = false,
		torchOn = false,
		ontorch,
		onmanual,
		onenter,
		onrescan,
		onback
	}: Props = $props();

	let code = $state('');
	const hasCamera = $derived(camera === 'starting' || camera === 'scanning');
</script>

<div class="flex flex-col gap-4">
	{#if hasCamera}
		<div
			class="relative aspect-4/3 w-full overflow-hidden rounded-lg border border-border bg-surface-raised"
		>
			<video
				bind:this={video}
				class="size-full object-cover"
				playsinline
				muted
				aria-label="Camera view"
			></video>
			<div
				class="pointer-events-none absolute inset-x-6 inset-y-1/4 rounded-md border-2 border-brand"
				aria-hidden="true"
			></div>
			{#if camera === 'starting'}
				<div
					class="absolute inset-0 flex items-center justify-center gap-2 bg-scrim text-base text-text"
					role="status"
				>
					<LoaderCircle
						size={20}
						class="animate-spin motion-reduce:animate-none"
						aria-hidden="true"
					/>
					Starting camera
				</div>
			{/if}
			{#if torchAvailable}
				<div class="absolute top-2 right-2">
					<IconButton
						variant="secondary"
						icon={torchOn ? FlashlightOff : Flashlight}
						label={torchOn ? 'Turn torch off' : 'Turn torch on'}
						onclick={ontorch}
					/>
				</div>
			{/if}
		</div>
		{#if status === 'idle' && camera === 'scanning'}
			<p class="text-base text-text-muted">Point the camera at the barcode on the package.</p>
		{/if}
	{:else if camera === 'denied'}
		<p role="status" class="text-base text-text">
			Camera access was denied. Allow the camera for this site in your browser settings to scan, or
			type the barcode below.
		</p>
	{:else}
		<p role="status" class="text-base text-text">
			This browser cannot open the camera here. Type the barcode below instead.
		</p>
	{/if}

	{#if status === 'looking'}
		<p role="status" class="flex items-center gap-2 text-base text-text-muted">
			<LoaderCircle size={20} class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
			Looking up the barcode
		</p>
	{:else if status === 'invalid'}
		<div class="flex flex-col gap-3">
			<p role="alert" class="text-base text-danger">
				That is not a valid barcode.{hasCamera
					? ' Scan it again.'
					: ' Check the digits and try again.'}
			</p>
			{#if hasCamera && onrescan}
				<Button variant="secondary" onclick={onrescan}>Scan again</Button>
			{/if}
		</div>
	{:else if status === 'unavailable'}
		<div class="flex flex-col gap-3">
			<p role="alert" class="text-base text-danger">Product database unreachable</p>
			{#if barcode}
				<p class="text-sm text-text-muted">Barcode {barcode}</p>
			{/if}
			<div class="flex gap-2">
				{#if onenter}
					<Button onclick={onenter}>Enter the food manually</Button>
				{/if}
				{#if hasCamera && onrescan}
					<Button variant="secondary" onclick={onrescan}>Scan again</Button>
				{/if}
			</div>
		</div>
	{/if}

	<form
		class="flex flex-col gap-3"
		onsubmit={(event) => {
			event.preventDefault();
			if (code.trim() !== '') onmanual(code);
		}}
	>
		<Input
			label="Barcode number"
			bind:value={code}
			inputmode="numeric"
			autocomplete="off"
			hint="Accepts EAN-13, UPC-A or EAN-8. An 8 digit code is read as EAN-8."
		/>
		<Button type="submit" variant="secondary" loading={status === 'looking'}>Look up</Button>
	</form>

	<Button variant="ghost" onclick={onback}>Back to search</Button>
</div>
