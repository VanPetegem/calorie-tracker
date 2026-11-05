import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/**
 * A distinct client IP per test (and per retry), sent as `cf-connecting-ip`. The hook throttles sign in and
 * sign up per IP (10 a minute); locally `wrangler dev` passes the header through, so without this every test
 * would share one bucket and the suite would trip the limiter. In production Cloudflare sets the header itself.
 */
export const test = base.extend({
	extraHTTPHeaders: async ({ extraHTTPHeaders }, use, testInfo) => {
		let hash = 0;
		for (const char of `${testInfo.testId}:${testInfo.retry}`) {
			hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
		}
		const ip = `198.18.${(hash >>> 8) & 255}.${hash & 255}`;
		await use({ 'cf-connecting-ip': ip, ...extraHTTPHeaders });
	}
});
