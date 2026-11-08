import { describe, expect, it, vi } from 'vitest';
import { runBackup } from './export.ts';
import { scheduled } from './scheduled.ts';

vi.mock('./export.ts', () => ({ runBackup: vi.fn() }));

describe('scheduled', () => {
	it('backs up the bindings at the scheduled time through waitUntil', async () => {
		const db = {} as D1Database;
		const bucket = {} as R2Bucket;
		const time = Date.UTC(2026, 10, 9, 3);
		const pending = Promise.resolve('backups/2026-11-09.json');
		vi.mocked(runBackup).mockReturnValue(pending);
		const waitUntil = vi.fn();

		await scheduled(
			{ scheduledTime: time, cron: '0 3 * * 1', noRetry() {} },
			{ DB: db, BACKUPS: bucket } as Env,
			{ waitUntil } as unknown as ExecutionContext
		);

		expect(runBackup).toHaveBeenCalledWith(db, bucket, new Date(time));
		expect(waitUntil).toHaveBeenCalledWith(pending);
	});
});
