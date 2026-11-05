import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { themes, type ColorToken } from './tokens';

const themeNames = ['dark', 'light'] as const;
const textTokens: ColorToken[] = ['text', 'text-muted', 'brand', 'danger'];
const textBackgrounds: ColorToken[] = ['bg', 'surface', 'surface-raised'];
const graphicTokens: ColorToken[] = ['protein', 'carbs', 'fat', 'success', 'warning', 'brand'];

const css = readFileSync(new URL('../../routes/layout.css', import.meta.url), 'utf8');

function themeBlock(name: string): string {
	const start = css.indexOf(`:root[data-theme='${name}']`);
	expect(start).toBeGreaterThan(-1);
	const open = css.indexOf('{', start);
	const close = css.indexOf('}', open);
	return css.slice(open + 1, close);
}

describe.each(themeNames)('%s theme', (name) => {
	const theme = themes[name];

	describe.each(textTokens)('text token %s', (fg) => {
		it.each(textBackgrounds)('is at least 4.5:1 on %s', (bg) => {
			expect(contrastRatio(theme[fg], theme[bg])).toBeGreaterThanOrEqual(4.5);
		});
	});

	it('on-brand is at least 4.5:1 on brand-solid', () => {
		expect(contrastRatio(theme['on-brand'], theme['brand-solid'])).toBeGreaterThanOrEqual(4.5);
	});

	it.each(graphicTokens)('%s is at least 3:1 on surface', (token) => {
		expect(contrastRatio(theme[token], theme.surface)).toBeGreaterThanOrEqual(3);
	});

	// WCAG 1.4.11: the boundary of an input or control must reach 3:1 against what it sits on.
	it.each(textBackgrounds)('border-strong is at least 3:1 on %s', (bg) => {
		expect(contrastRatio(theme['border-strong'], theme[bg])).toBeGreaterThanOrEqual(3);
	});

	it('matches the values in layout.css', () => {
		// Prettier lowercases hex in CSS, so compare case-insensitively.
		const block = themeBlock(name).toLowerCase();
		for (const [token, value] of Object.entries(theme)) {
			expect(block).toContain(`--kc-${token}: ${value.toLowerCase()};`);
		}
	});
});
