import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	retries: process.env.CI ? 1 : 0,
	use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
	webServer: {
		command: 'pnpm build && pnpm preview --var ORIGIN:http://localhost:4173',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	},
	projects: [
		{ name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'webkit-iphone', use: { ...devices['iPhone 15'] } }
	]
});
