/** Lowercases, drops diacritics and turns any run of non-letters or digits into one space. */
export function normalizeSearchText(...parts: (string | null | undefined)[]): string {
	return parts
		.filter((part): part is string => part != null)
		.join(' ')
		.toLowerCase()
		.replaceAll('ß', 'ss')
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

/** Normalized words of a query, with empty words dropped. */
export function searchTokens(query: string): string[] {
	return normalizeSearchText(query).split(' ').filter(Boolean);
}
