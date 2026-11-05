<script lang="ts">
	import { normalizeBarcode, type BarcodeFormat } from '#lib/domain/barcode.ts';
	import type { FoodInput } from '#lib/schemas/food.ts';
	import type { Food } from '#lib/server/db/schema.ts';
	import type { BarcodeLookup } from '#lib/server/foods/service.ts';
	import { createDetector, toBarcodeFormat, type Detector } from '#lib/scanner/detector.ts';
	import { lookupBarcode } from '../../../routes/(app)/foods.remote.ts';
	import ScannerPanel, { type ScannerCamera, type ScannerStatus } from './ScannerPanel.svelte';

	/**
	 * The scanner step of the add sheet: opens the camera when it mounts (the person has just tapped Scan), reads
	 * the first barcode it sees and looks it up. A food found goes to `onhit`; an unknown product to `onmiss` with
	 * the barcode and what Open Food Facts knew; the product database being down shows a message with a way to
	 * enter the food by hand (`onmanual`). Detection stops after the first code until the person scans again.
	 * Every track of the stream is stopped when the view unmounts, which is also what closing the sheet does.
	 */
	type Props = {
		onhit: (food: Food) => void;
		onmiss: (barcode: string, prefill: Partial<FoodInput>) => void;
		/** Open the food form for this barcode without an Open Food Facts result. */
		onmanual: (barcode: string) => void;
		onback: () => void;
	};

	let { onhit, onmiss, onmanual, onback }: Props = $props();

	const DETECT_INTERVAL_MS = 250;
	const HAPTIC_MS = 50;
	const HAVE_CURRENT_DATA = 2;

	let camera = $state<ScannerCamera>('starting');
	let status = $state<ScannerStatus>('idle');
	let barcode = $state<string | undefined>();
	let video = $state<HTMLVideoElement>();
	let torchAvailable = $state(false);
	let torchOn = $state(false);

	let stream: MediaStream | null = null;
	let detector: Detector | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;
	// True while a lookup is running or its outcome is on screen: no detection until the person rescans.
	let paused = false;

	type TorchTrack = Omit<MediaStreamTrack, 'getCapabilities'> & {
		getCapabilities?: () => { torch?: boolean };
	};

	function stop() {
		disposed = true;
		clearTimeout(timer);
		for (const track of stream?.getTracks() ?? []) track.stop();
		stream = null;
		if (video) video.srcObject = null;
	}

	async function start() {
		if (!navigator.mediaDevices?.getUserMedia) {
			camera = 'unsupported';
			return;
		}
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } },
				audio: false
			});
		} catch (error) {
			camera =
				error instanceof DOMException && error.name === 'NotAllowedError'
					? 'denied'
					: 'unsupported';
			return;
		}
		if (disposed) return stop();
		try {
			detector = await createDetector();
		} catch {
			stop();
			camera = 'unsupported';
			return;
		}
		if (disposed) return stop();

		const [track] = stream.getVideoTracks() as unknown as TorchTrack[];
		torchAvailable = track?.getCapabilities?.().torch === true;
		if (video) {
			video.srcObject = stream;
			// Not awaited: `play()` settles only once frames arrive, and the loop below waits for them anyway.
			video.play().catch(() => {});
		}
		camera = 'scanning';
		schedule();
	}

	function schedule() {
		clearTimeout(timer);
		timer = setTimeout(scan, DETECT_INTERVAL_MS);
	}

	async function scan() {
		if (disposed || paused || !detector) return;
		if (video && video.readyState >= HAVE_CURRENT_DATA) {
			try {
				const found = (await detector.detect(video)).find((item) => item.rawValue.trim() !== '');
				if (disposed || paused) return;
				if (found) {
					navigator.vibrate?.(HAPTIC_MS);
					await lookup(found.rawValue, toBarcodeFormat(found.format));
					return;
				}
			} catch {
				// A frame that cannot be read is skipped.
			}
		}
		if (!disposed && !paused) schedule();
	}

	async function lookup(raw: string, format?: BarcodeFormat) {
		if (status === 'looking') return;
		paused = true;
		clearTimeout(timer);
		status = 'looking';
		const code = normalizeBarcode(raw, format) ?? raw.trim();
		barcode = code;
		let result: BarcodeLookup;
		try {
			result = await lookupBarcode({ raw, format });
		} catch {
			result = { kind: 'unavailable', barcode: code };
		}
		if (disposed) return;
		switch (result.kind) {
			case 'hit':
				return onhit(result.food);
			case 'miss':
				return onmiss(result.barcode, result.prefill);
			case 'unavailable':
				barcode = result.barcode;
				status = 'unavailable';
				return;
			case 'invalid':
				status = 'invalid';
				return;
		}
	}

	function rescan() {
		status = 'idle';
		paused = false;
		schedule();
	}

	async function toggleTorch() {
		const track = stream?.getVideoTracks()[0];
		if (!track) return;
		const next = !torchOn;
		try {
			await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
			torchOn = next;
		} catch {
			torchAvailable = false;
		}
	}

	// Starts the camera when the view mounts and stops every track when it unmounts.
	function run() {
		void start();
		return stop;
	}
</script>

<div {@attach run}>
	<ScannerPanel
		{camera}
		{status}
		{barcode}
		bind:video
		{torchAvailable}
		{torchOn}
		ontorch={toggleTorch}
		onmanual={(code) => void lookup(code)}
		onenter={() => barcode && onmanual(barcode)}
		onrescan={rescan}
		{onback}
	/>
</div>
