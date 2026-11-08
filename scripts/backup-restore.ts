/**
 * Prints the SQL that restores a weekly R2 backup: `pnpm backup:restore backup.json > restore.sql`, then
 * `pnpm wrangler d1 execute DB --remote --file restore.sql`.
 *
 * Download the file first, e.g. `pnpm wrangler r2 object get kcal-backups/backups/2026-11-09.json --remote
 * --file backup.json`. It refuses a backup made at another migration than the repo's latest.
 *
 * Run with `node --experimental-strip-types`.
 */
import { readFileSync } from 'node:fs';
import { restoreStatements } from '../src/lib/server/backup/restore.ts';

const path = process.argv[2];
try {
	if (!path) throw new Error('Usage: pnpm backup:restore <backup.json> > restore.sql');
	const journal = JSON.parse(
		readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')
	) as { entries: { tag: string }[] };
	const latest = journal.entries.at(-1)?.tag;
	if (!latest) throw new Error('drizzle/meta/_journal.json has no migrations');
	const statements = restoreStatements(JSON.parse(readFileSync(path, 'utf8')), latest);
	process.stdout.write(`${statements.join(';\n')};\n`);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
