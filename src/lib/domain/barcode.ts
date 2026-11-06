export type BarcodeFormat = 'ean_13' | 'ean_8' | 'upc_a' | 'upc_e';

const GTIN_14_LENGTH = 14;
const EAN_13_LENGTH = 13;
const EAN_8_LENGTH = 8;
const UPC_A_LENGTH = 12;
const UPC_E_LENGTH = 8;

/**
 * Trims a scanned or typed code and returns it as EAN-13 (EAN-8 stays as is) when the check digit is valid,
 * else null. Without a format the length decides: 14 with a leading zero is a GTIN-14 of an EAN-13, 13 is EAN-13,
 * 12 is UPC-A, and 8 is EAN-8 or, when that check digit fails, UPC-E.
 */
export function normalizeBarcode(raw: string, format?: BarcodeFormat): string | null {
	const code = raw.trim();
	if (!/^\d+$/.test(code)) return null;
	if (format === undefined) {
		if (code.length === GTIN_14_LENGTH)
			return code.startsWith('0') ? normalizeBarcode(code.slice(1), 'ean_13') : null;
		if (code.length === EAN_8_LENGTH)
			return normalizeBarcode(code, 'ean_8') ?? normalizeBarcode(code, 'upc_e');
	}

	switch (format ?? formatForLength(code.length)) {
		case 'ean_13':
			return isValidEan(code, EAN_13_LENGTH) ? code : null;
		case 'ean_8':
			return isValidEan(code, EAN_8_LENGTH) ? code : null;
		case 'upc_a':
			return isValidEan(code, UPC_A_LENGTH) ? `0${code}` : null;
		case 'upc_e': {
			const upcA = expandUpcE(code);
			return upcA !== null && isValidEan(upcA, UPC_A_LENGTH) ? `0${upcA}` : null;
		}
		default:
			return null;
	}
}

function formatForLength(length: number): BarcodeFormat | undefined {
	switch (length) {
		case EAN_13_LENGTH:
			return 'ean_13';
		case UPC_A_LENGTH:
			return 'upc_a';
		case EAN_8_LENGTH:
			return 'ean_8';
		default:
			return undefined;
	}
}

function isValidEan(code: string, length: number): boolean {
	return code.length === length && checkDigit(code.slice(0, -1)) === Number(code.slice(-1));
}

/** GS1 check digit for the digits before it: weight 3 from the right, then alternating 1 and 3. */
function checkDigit(body: string): number {
	let sum = 0;
	for (let i = 0; i < body.length; i++) {
		const weight = i % 2 === 0 ? 3 : 1;
		sum += Number(body.charAt(body.length - 1 - i)) * weight;
	}
	return (10 - (sum % 10)) % 10;
}

/**
 * Expands an 8-digit UPC-E (number system 0 or 1) to a 12-digit UPC-A. The UPC-E check digit is carried over
 * unchecked; the caller validates the result as UPC-A.
 */
function expandUpcE(code: string): string | null {
	if (code.length !== UPC_E_LENGTH) return null;
	const numberSystem = code.slice(0, 1);
	if (numberSystem !== '0' && numberSystem !== '1') return null;

	const body = code.slice(1, 7);
	const lastDigit = body.slice(5, 6);
	let manufacturer: string;
	let product: string;
	if (lastDigit === '0' || lastDigit === '1' || lastDigit === '2') {
		manufacturer = body.slice(0, 2) + lastDigit + '00';
		product = '00' + body.slice(2, 5);
	} else if (lastDigit === '3') {
		manufacturer = body.slice(0, 3) + '00';
		product = '000' + body.slice(3, 5);
	} else if (lastDigit === '4') {
		manufacturer = body.slice(0, 4) + '0';
		product = '0000' + body.slice(4, 5);
	} else {
		manufacturer = body.slice(0, 5);
		product = '0000' + lastDigit;
	}
	return numberSystem + manufacturer + product + code.slice(7);
}
