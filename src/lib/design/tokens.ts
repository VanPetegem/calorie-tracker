/**
 * Semantic color tokens. Keep identical to the `--kc-*` variables in
 * `src/routes/layout.css` (tokens.spec.ts enforces this).
 */
export type ColorToken =
	| 'bg'
	| 'surface'
	| 'surface-raised'
	| 'border'
	| 'border-strong'
	| 'text'
	| 'text-muted'
	| 'brand'
	| 'brand-solid'
	| 'on-brand'
	| 'success'
	| 'warning'
	| 'danger'
	| 'protein'
	| 'carbs'
	| 'fat'
	| 'scrim';

export const themes: Record<'dark' | 'light', Record<ColorToken, string>> = {
	dark: {
		bg: '#09090B',
		surface: '#131316',
		'surface-raised': '#1C1C21',
		border: '#27272A',
		'border-strong': '#71717A',
		text: '#FAFAFA',
		'text-muted': '#A1A1AA',
		brand: '#818CF8',
		'brand-solid': '#4F46E5',
		'on-brand': '#FFFFFF',
		success: '#22C55E',
		warning: '#F59E0B',
		danger: '#EF4444',
		protein: '#38BDF8',
		carbs: '#FBBF24',
		fat: '#F472B6',
		scrim: '#000000B3'
	},
	light: {
		bg: '#FAFAFA',
		surface: '#FFFFFF',
		'surface-raised': '#FFFFFF',
		border: '#E4E4E7',
		'border-strong': '#85858F',
		text: '#09090B',
		'text-muted': '#52525B',
		brand: '#4F46E5',
		'brand-solid': '#4F46E5',
		'on-brand': '#FFFFFF',
		success: '#15803D',
		warning: '#B45309',
		danger: '#DC2626',
		protein: '#0369A1',
		carbs: '#B45309',
		fat: '#BE185D',
		scrim: '#09090B73'
	}
};
