import { describe, expect, it } from 'vitest';
import { normalizeBarcode } from './barcode';

describe('normalizeBarcode without a format', () => {
	it('keeps a valid EAN-13', () => {
		expect(normalizeBarcode('4006381333931')).toBe('4006381333931');
	});

	it('returns null for an EAN-13 with a wrong check digit', () => {
		expect(normalizeBarcode('4006381333932')).toBeNull();
	});

	it('pads a valid UPC-A to EAN-13 with a leading zero', () => {
		expect(normalizeBarcode('036000291452')).toBe('0036000291452');
	});

	it('keeps a valid EAN-8', () => {
		expect(normalizeBarcode('96385074')).toBe('96385074');
	});

	it('trims surrounding whitespace', () => {
		expect(normalizeBarcode(' 4006381333931 ')).toBe('4006381333931');
	});

	it('returns null for non-digit input', () => {
		expect(normalizeBarcode('abc')).toBeNull();
		expect(normalizeBarcode('')).toBeNull();
		expect(normalizeBarcode('4006 381333931')).toBeNull();
	});

	it('returns null for lengths that are not a barcode length', () => {
		expect(normalizeBarcode('40063813339')).toBeNull();
		expect(normalizeBarcode('40063813339312')).toBeNull();
	});

	it('reads an 8-digit code that is not a valid EAN-8 as UPC-E', () => {
		expect(normalizeBarcode('04252614')).toBe('0042100005264');
		expect(normalizeBarcode('04252615')).toBeNull();
	});

	it('strips the leading zero of a GTIN-14 to EAN-13', () => {
		expect(normalizeBarcode('04006381333931')).toBe('4006381333931');
		expect(normalizeBarcode('04006381333932')).toBeNull();
	});

	it('returns null for a 12-digit code with a wrong UPC-A check digit', () => {
		expect(normalizeBarcode('400638133393')).toBeNull();
	});
});

describe('normalizeBarcode with a format', () => {
	it('validates the length and check digit of ean_13', () => {
		expect(normalizeBarcode('4006381333931', 'ean_13')).toBe('4006381333931');
		expect(normalizeBarcode('4006381333932', 'ean_13')).toBeNull();
		expect(normalizeBarcode('96385074', 'ean_13')).toBeNull();
	});

	it('validates the length and check digit of ean_8', () => {
		expect(normalizeBarcode('96385074', 'ean_8')).toBe('96385074');
		expect(normalizeBarcode('96385075', 'ean_8')).toBeNull();
		expect(normalizeBarcode('4006381333931', 'ean_8')).toBeNull();
	});

	it('expands a valid upc_a to EAN-13', () => {
		expect(normalizeBarcode('036000291452', 'upc_a')).toBe('0036000291452');
		expect(normalizeBarcode('036000291453', 'upc_a')).toBeNull();
		expect(normalizeBarcode('0036000291452', 'upc_a')).toBeNull();
	});

	it('expands upc_e to UPC-A and then EAN-13', () => {
		expect(normalizeBarcode('04252614', 'upc_e')).toBe('0042100005264');
	});

	it('expands upc_e for each last-digit rule', () => {
		// last digit 0 to 2: manufacturer XX + last digit + 00, product 00 + XYZ
		expect(normalizeBarcode('04252614', 'upc_e')).toBe('0042100005264');
		// last digit 3: manufacturer XXX00, product 000 + YZ
		expect(normalizeBarcode('01234531', 'upc_e')).toBe('0012300000451');
		// last digit 4: manufacturer XXXX0, product 0000 + Y
		expect(normalizeBarcode('01234543', 'upc_e')).toBe('0012340000053');
		// last digit 5 to 9: manufacturer XXXXX, product 0000 + last digit
		expect(normalizeBarcode('01234572', 'upc_e')).toBe('0012345000072');
	});

	it('accepts number system 1 for upc_e', () => {
		expect(normalizeBarcode('11234579', 'upc_e')).toBe('0112345000079');
	});

	it('rejects upc_e with another number system, a wrong check digit or a wrong length', () => {
		expect(normalizeBarcode('21234572', 'upc_e')).toBeNull();
		expect(normalizeBarcode('01234573', 'upc_e')).toBeNull();
		expect(normalizeBarcode('0423456', 'upc_e')).toBeNull();
	});

	it('returns null for input with a wrong length for the format', () => {
		expect(normalizeBarcode('4006381333931', 'upc_a')).toBeNull();
		expect(normalizeBarcode('036000291452', 'upc_e')).toBeNull();
	});
});
