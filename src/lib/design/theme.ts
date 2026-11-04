import { themes } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'kcal-theme';

/** Must stay in sync with the inline script in src/app.html. */
export function resolveTheme(p: ThemePreference, prefersDark: boolean): 'light' | 'dark' {
	if (p === 'system') return prefersDark ? 'dark' : 'light';
	return p;
}

export function getThemePreference(): ThemePreference {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
	} catch {
		// storage unavailable (private mode, blocked): fall through
	}
	return 'system';
}

export function setThemePreference(p: ThemePreference): void {
	try {
		localStorage.setItem(STORAGE_KEY, p);
	} catch {
		// storage unavailable: the preference applies for this page view only
	}
	const resolved = resolveTheme(p, matchMedia('(prefers-color-scheme: dark)').matches);
	document.documentElement.dataset.theme = resolved;
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themes[resolved].bg);
}
