import { ZXING_WASM_VERSION as PONYFILL_ZXING_WASM_VERSION } from 'barcode-detector/ponyfill';
import { ZXING_WASM_VERSION } from 'zxing-wasm/reader';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toBarcodeFormat } from './detector.ts';

const ALL = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

describe('toBarcodeFormat', () => {
	it.each(ALL)('passes %s through', (format) => {
		expect(toBarcodeFormat(format)).toBe(format);
	});

	it.each(['qr_code', 'code_128', 'unknown', ''])('maps %s to undefined', (format) => {
		expect(toBarcodeFormat(format)).toBeUndefined();
	});
});

describe('the bundled wasm', () => {
	// The wasm file in the app comes from our zxing-wasm; the glue that loads it comes from the one barcode-detector
	// resolves. A mismatch breaks decoding on iPhone only, so the two must stay the same version.
	it('is the version the ponyfill expects', () => {
		expect(PONYFILL_ZXING_WASM_VERSION).toBe(ZXING_WASM_VERSION);
	});
});

describe('createDetector', () => {
	beforeEach(() => vi.resetModules());
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.doUnmock('barcode-detector/ponyfill');
		vi.doUnmock('zxing-wasm/reader/zxing_reader.wasm?url');
	});

	function stubNative(supported: string[] | undefined) {
		const detect = vi.fn(async () => [{ rawValue: '3017620422003', format: 'ean_13' }]);
		const Native = vi.fn(function () {
			return { detect };
		});
		if (supported) Object.assign(Native, { getSupportedFormats: async () => supported });
		vi.stubGlobal('BarcodeDetector', Native);
		return { Native, detect };
	}

	function mockPonyfill(
		prepare = vi.fn<(options?: unknown) => Promise<object>>(async () => ({})),
		purge = vi.fn()
	) {
		const ponyfillDetect = vi.fn(async () => []);
		const Ponyfill = vi.fn(function () {
			return { detect: ponyfillDetect };
		});
		vi.doMock('barcode-detector/ponyfill', () => ({
			BarcodeDetector: Ponyfill,
			prepareZXingModule: prepare,
			purgeZXingModule: purge
		}));
		vi.doMock('zxing-wasm/reader/zxing_reader.wasm?url', () => ({
			default: '/assets/zxing_reader.wasm'
		}));
		return { Ponyfill, prepare, purge };
	}

	it('uses the browser BarcodeDetector when it reads EAN-13, asking for the product formats', async () => {
		const { Native, detect } = stubNative(ALL);
		const { Ponyfill } = mockPonyfill();
		const { createDetector } = await import('./detector.ts');

		const detector = await createDetector();
		const found = await detector.detect({} as CanvasImageSource);

		expect(Native).toHaveBeenCalledWith({ formats: ALL });
		expect(Ponyfill).not.toHaveBeenCalled();
		expect(detect).toHaveBeenCalled();
		expect(found).toEqual([{ rawValue: '3017620422003', format: 'ean_13' }]);
	});

	it('asks the browser only for the formats it supports', async () => {
		const { Native } = stubNative(['ean_13', 'qr_code']);
		mockPonyfill();
		const { createDetector } = await import('./detector.ts');
		await createDetector();
		expect(Native).toHaveBeenCalledWith({ formats: ['ean_13'] });
	});

	it.each([
		['no EAN-13', ['qr_code', 'code_128']],
		['no format list', undefined]
	])('falls back to the ponyfill when the browser detector has %s', async (_name, supported) => {
		const { Native } = stubNative(supported);
		const { Ponyfill } = mockPonyfill();
		const { createDetector } = await import('./detector.ts');

		await createDetector();

		expect(Native).not.toHaveBeenCalled();
		expect(Ponyfill).toHaveBeenCalledWith({ formats: ALL });
	});

	it('loads the wasm from the bundled url before resolving, once for several detectors', async () => {
		const { Ponyfill, prepare } = mockPonyfill();
		const { createDetector } = await import('./detector.ts');

		await createDetector();
		await createDetector();

		expect(Ponyfill).toHaveBeenCalledTimes(2);
		expect(prepare).toHaveBeenCalledTimes(2);
		const [first, second] = prepare.mock.calls.map(
			([options]) => options as unknown as { overrides: object; fireImmediately: boolean }
		);
		expect(first.fireImmediately).toBe(true);
		// The same object both times, so zxing-wasm reuses the compiled module.
		expect(second.overrides).toBe(first.overrides);
		const { locateFile } = first.overrides as {
			locateFile: (path: string, prefix: string) => string;
		};
		expect(locateFile('zxing_reader.wasm', 'https://cdn.example/')).toBe(
			'/assets/zxing_reader.wasm'
		);
		expect(locateFile('other.js', 'https://cdn.example/')).toBe('https://cdn.example/other.js');
	});

	it('rejects when the wasm cannot be prepared, so the scanner shows manual entry', async () => {
		const { purge } = mockPonyfill(
			vi.fn(async () => {
				throw new Error('wasm failed');
			})
		);
		const { createDetector } = await import('./detector.ts');
		await expect(createDetector()).rejects.toThrow('wasm failed');
		// The failed load is not kept, so the next Scan open retries.
		expect(purge).toHaveBeenCalledTimes(1);
	});
});
