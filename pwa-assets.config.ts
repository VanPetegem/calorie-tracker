import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

/**
 * Generates the PNG icons in static/ from static/icon.svg (run `pnpm icons`, commit the output).
 * icon.svg is already full bleed on the brand color, so the maskable and Apple icons need no extra padding.
 */
export default defineConfig({
	headLinkOptions: { preset: '2023' },
	preset: {
		...minimal2023Preset,
		maskable: { ...minimal2023Preset.maskable, padding: 0 },
		apple: { ...minimal2023Preset.apple, padding: 0 }
	},
	images: ['static/icon.svg']
});
