import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDetector, toBarcodeFormat } from './detector.ts';

describe('toBarcodeFormat', () => {
	it.each(['ean_13', 'ean_8', 'upc_a', 'upc_e'])('passes %s through', (format) => {
		expect(toBarcodeFormat(format)).toBe(format);
	});

	it.each(['qr_code', 'code_128', 'unknown', ''])('maps %s to undefined', (format) => {
		expect(toBarcodeFormat(format)).toBeUndefined();
	});
});

describe('createDetector', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('uses the browser BarcodeDetector when there is one, asking for the product formats', async () => {
		const detect = vi.fn(async () => [{ rawValue: '3017620422003', format: 'ean_13' }]);
		const Native = vi.fn(function () {
			return { detect };
		});
		vi.stubGlobal('BarcodeDetector', Native);

		const detector = await createDetector();
		const found = await detector.detect({} as CanvasImageSource);

		expect(Native).toHaveBeenCalledWith({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
		expect(found).toEqual([{ rawValue: '3017620422003', format: 'ean_13' }]);
	});
});
