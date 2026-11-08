/**
 * Writes the SQL that restores a weekly R2 backup: `pnpm backup:restore .backups/backup.json .backups/restore.sql`,
 * then `pnpm wrangler d1 execute DB --remote --file .backups/restore.sql`. The script writes the file itself
 * (an existing one is overwritten), so pnpm's banner never lands in the SQL.
 *
 * Download the file first, e.g. `pnpm wrangler r2 object get kcal-backups/backups/2026-11-09.json --remote
 * --file .backups/backup.json`. It refuses a backup made at another migration than the repo's latest.
 *
 * Run with `node --experimental-strip-types`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { restoreStatements } from '../src/lib/server/backup/restore.ts';

const [input, output] = process.argv.slice(2);
try {
	if (!input || !output) {
		throw new Error('Usage: pnpm backup:restore <backup.json> <restore.sql>');
	}
	const journal = JSON.parse(
		readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')
	) as { entries: { tag: string }[] };
	const latest = journal.entries.at(-1)?.tag;
	if (!latest) throw new Error('drizzle/meta/_journal.json has no migrations');
	// d1_migrations stores the file name, so the backup's tag is `<journal tag>.sql`.
	const statements = restoreStatements(JSON.parse(readFileSync(input, 'utf8')), `${latest}.sql`);
	mkdirSync(dirname(output), { recursive: true });
	writeFileSync(output, `${statements.join(';\n')};\n`);
	console.log(`Wrote ${statements.length} statements to ${output}`);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
