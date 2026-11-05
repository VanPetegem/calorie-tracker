import type { BarcodeFormat } from '#lib/domain/barcode.ts';

/** The product barcode formats the scanner reads. */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

export type DetectedCode = { rawValue: string; format: string };

export type Detector = {
	detect(source: CanvasImageSource): Promise<DetectedCode[]>;
};

type DetectorConstructor = new (options: { formats: readonly string[] }) => {
	detect(source: CanvasImageSource): Promise<DetectedCode[]>;
};

/**
 * Maps a format string from the detector to the formats the lookup knows. Anything else (a QR code, Code 128, ...)
 * is `undefined`, so the server decides by length.
 */
export function toBarcodeFormat(format: string): BarcodeFormat | undefined {
	return (FORMATS as readonly string[]).includes(format) ? (format as BarcodeFormat) : undefined;
}

/**
 * Creates the barcode detector. The browser's own `BarcodeDetector` is preferred (Chrome on Android); otherwise the
 * `barcode-detector` ponyfill is imported here, on demand, so its zxing-wasm decoder never weighs on a page that does
 * not scan. The wasm file is served from the app itself, not from the ponyfill's default CDN.
 */
export async function createDetector(): Promise<Detector> {
	const native = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
	if (native) {
		try {
			return new native({ formats: FORMATS });
		} catch {
			// The browser has the API but not these formats: use the ponyfill.
		}
	}
	const [{ BarcodeDetector, setZXingModuleOverrides }, { default: wasmUrl }] = await Promise.all([
		import('barcode-detector/ponyfill'),
		import('zxing-wasm/reader/zxing_reader.wasm?url')
	]);
	setZXingModuleOverrides({
		locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path)
	});
	return new BarcodeDetector({ formats: [...FORMATS] }) as Detector;
}
