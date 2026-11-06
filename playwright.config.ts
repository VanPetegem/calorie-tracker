import { defineConfig, devices } from '@playwright/test';
import { AUTH_FILE } from './e2e/helpers.ts';

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	retries: process.env.CI ? 1 : 0,
	use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
	webServer: [
		{
			// Every run starts from an empty database, so the setup project can create the one account.
			command:
				'bash scripts/e2e-db-reset.sh && pnpm build && pnpm preview --persist-to .wrangler/e2e --var ORIGIN:http://localhost:4173 --var OFF_BASE_URL:http://localhost:4174 --var OFF_SEARCH_URL:http://localhost:4174',
			port: 4173,
			reuseExistingServer: false,
			timeout: 180_000
		},
		{
			// Serves recorded Open Food Facts fixtures, so no e2e test touches the network.
			command: 'node e2e/off-stub.mjs',
			port: 4174,
			reuseExistingServer: false
		}
	],
	projects: [
		// Creates the account through /setup and saves its session for the projects below.
		{ name: 'setup', testMatch: /auth\.setup\.ts/ },
		{
			name: 'chromium-desktop',
			use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
			dependencies: ['setup']
		},
		{
			name: 'webkit-iphone',
			use: { ...devices['iPhone 15'], storageState: AUTH_FILE },
			dependencies: ['setup']
		}
	]
});
