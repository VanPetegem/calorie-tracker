const DECIMAL = /^(\d+([.,]\d*)?|[.,]\d+)$/;

/**
 * Parses a number typed by a person. A Swiss iPhone keypad types `,`, so both `,` and `.` work as the
 * single decimal separator. Thousands separators, letters, empty input and repeated separators give null.
 */
export function parseDecimal(
	input: string,
	options: { allowNegative?: boolean } = {}
): number | null {
	let text = input.trim();
	let sign = 1;
	if (options.allowNegative && text.startsWith('-')) {
		sign = -1;
		text = text.slice(1);
	}
	if (!DECIMAL.test(text)) return null;
	const value = Number(text.replace(',', '.'));
	return Number.isFinite(value) ? sign * value : null;
}
