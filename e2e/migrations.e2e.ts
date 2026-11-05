import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

// One run against the shared database file is enough.
test.skip(({ browserName }) => browserName !== 'chromium', 'chromium only');

/**
 * drizzle/0001_single_account.sql is hand written SQL. If drizzle-kit ever rebuilds the `user` table in a
 * later migration (SQLite drops triggers with the table), the database level single account backstop would
 * vanish without any other test noticing. Reads the e2e database that scripts/e2e-db-reset.sh just migrated.
 */
test('the single account trigger exists after migrations', () => {
	const out = execFileSync(
		'pnpm',
		[
			'--silent',
			'wrangler',
			'd1',
			'execute',
			'DB',
			'--local',
			'--persist-to',
			'.wrangler/e2e',
			'--json',
			'--command',
			"SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'user'"
		],
		{ encoding: 'utf8' }
	);
	const [{ results }] = JSON.parse(out.slice(out.indexOf('['))) as [
		{ results: { name: string }[] }
	];
	expect(results.map((row) => row.name)).toContain('user_single_account');
});
