import { describe, expect, it } from 'vitest';
import { normalizeSearchText, searchTokens } from './search-text';

describe('normalizeSearchText', () => {
	it('lowercases, drops diacritics and joins the parts', () => {
		expect(normalizeSearchText('Hähnchenbrust', 'Migros Bio')).toBe('hahnchenbrust migros bio');
	});

	it('turns ß into ss', () => {
		expect(normalizeSearchText('Weißbrot')).toBe('weissbrot');
	});

	it('turns punctuation into single spaces and trims', () => {
		expect(normalizeSearchText('  Müesli, "Bio"-Mix!  ')).toBe('muesli bio mix');
	});

	it('skips missing parts', () => {
		expect(normalizeSearchText(null, 'Quark', undefined)).toBe('quark');
	});

	it('returns an empty string when there is no text', () => {
		expect(normalizeSearchText('', ' ', null)).toBe('');
	});

	it('keeps letters from other scripts', () => {
		expect(normalizeSearchText('Kéfir 牛乳')).toBe('kefir 牛乳');
	});
});

describe('searchTokens', () => {
	it('splits the normalized query into words', () => {
		expect(searchTokens('  Hähnchen-Brust ')).toEqual(['hahnchen', 'brust']);
	});

	it('returns no tokens for a query without words', () => {
		expect(searchTokens(' - ! ')).toEqual([]);
	});
});
