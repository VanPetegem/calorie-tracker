import { describe, expect, it, vi } from 'vitest';
import { scheduled } from '../src/lib/server/backup/scheduled.ts';
import worker from './index.ts';

// The adapter's output exists only after `vite build`, so the test stands one in.
const fetch = vi.hoisted(() => vi.fn());
vi.mock('../.svelte-kit/cloudflare/_worker.js', () => ({ default: { fetch } }));

describe('worker entry', () => {
	it('serves the adapter fetch and runs the backup on the cron', () => {
		expect(worker.fetch).toBe(fetch);
		expect(worker.scheduled).toBe(scheduled);
	});
});
