/** WCAG 2.x contrast ratio between two hex colors (#rgb or #rrggbb). */

function parseHex(hex: string): [number, number, number] {
	let h = hex.trim().replace(/^#/, '');
	if (h.length === 3) h = [...h].map((c) => c + c).join('');
	if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Invalid hex color: ${hex}`);
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function channel(value: number): number {
	const c = value / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
	const [r, g, b] = parseHex(hex);
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
