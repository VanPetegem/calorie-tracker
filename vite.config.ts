import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// A separate config, so the adapter does not overwrite worker/index.ts (see wrangler.adapter.jsonc). Dev
			// bindings still come from wrangler.jsonc.
			adapter: adapter({
				config: 'wrangler.adapter.jsonc',
				platformProxy: { configPath: 'wrangler.jsonc' }
			}),
			// Remote functions (`*.remote.ts`) are still experimental in SvelteKit 3. Commands need only this flag;
			// `compilerOptions.experimental.async` is only for `await` in component markup.
			experimental: { remoteFunctions: true }
		})
	],
	// Svelte component libraries must not be pre-bundled, or they get a second copy of the Svelte runtime
	// (seen as "Cannot read properties of undefined (reading 'call')" in browser component tests).
	optimizeDeps: { exclude: ['@lucide/svelte'] },
	test: {
		passWithNoTests: true,
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					setupFiles: ['src/vitest-setup-client.ts'],
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					hookTimeout: 30000,
					include: [
						'src/**/*.{test,spec}.{js,ts}',
						'scripts/**/*.{test,spec}.ts',
						'worker/**/*.{test,spec}.ts'
					],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
