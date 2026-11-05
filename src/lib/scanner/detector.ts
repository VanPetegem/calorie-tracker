import type { ZXingModuleOverrides } from 'zxing-wasm/reader';
import type { BarcodeFormat } from '#lib/domain/barcode.ts';

/** The product barcode formats the scanner reads. */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

export type DetectedCode = { rawValue: string; format: string };

export type Detector = {
	detect(source: CanvasImageSource): Promise<DetectedCode[]>;
};

type DetectorConstructor = {
	new (options: { formats: readonly string[] }): {
		detect(source: CanvasImageSource): Promise<DetectedCode[]>;
	};
	getSupportedFormats?: () => Promise<readonly string[]>;
};

/** The formats the native detector must read at least; a browser without EAN-13 gets the ponyfill instead. */
const REQUIRED_NATIVE_FORMAT = 'ean_13';

/**
 * Maps a format string from the detector to the formats the lookup knows. Anything else (a QR code, Code 128, ...)
 * is `undefined`, so the server decides by length.
 */
export function toBarcodeFormat(format: string): BarcodeFormat | undefined {
	return (FORMATS as readonly string[]).includes(format) ? (format as BarcodeFormat) : undefined;
}

/**
 * The native detector constructor when the browser has one that reads EAN-13 (Chrome on Android; Chrome on
 * macOS lacks the API and some builds report no formats), else null. Only the formats it supports are requested.
 */
async function nativeDetector(): Promise<(() => Detector) | null> {
	const native = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
	if (!native) return null;
	try {
		const supported = await native.getSupportedFormats?.();
		if (!supported?.includes(REQUIRED_NATIVE_FORMAT)) return null;
		const formats = FORMATS.filter((format) => supported.includes(format));
		return () => new native({ formats });
	} catch {
		return null;
	}
}

// One overrides object for the whole page: zxing-wasm caches the compiled module by it, so the wasm is fetched
// and compiled once, not on every Scan open.
let overrides: ZXingModuleOverrides | undefined;

/**
 * Creates the barcode detector. The browser's own `BarcodeDetector` is preferred when it reads EAN-13; otherwise the
 * `barcode-detector` ponyfill is imported here, on demand, so its zxing-wasm decoder never weighs on a page that does
 * not scan. The wasm file is served from the app itself, not from the ponyfill's default CDN, and is loaded before
 * this resolves: a wasm that fails to load rejects, and the scanner falls back to manual entry.
 */
export async function createDetector(): Promise<Detector> {
	const create = await nativeDetector();
	if (create) return create();

	const [{ BarcodeDetector, prepareZXingModule, purgeZXingModule }, { default: wasmUrl }] =
		await Promise.all([
			import('barcode-detector/ponyfill'),
			import('zxing-wasm/reader/zxing_reader.wasm?url')
		]);
	overrides ??= {
		locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path)
	};
	try {
		await prepareZXingModule({ overrides, fireImmediately: true });
	} catch (error) {
		// zxing-wasm caches the failed load; drop it so opening Scan again retries.
		purgeZXingModule();
		throw error;
	}
	return new BarcodeDetector({ formats: [...FORMATS] }) as Detector;
}
