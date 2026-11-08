import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';
import { getDb, type Db } from '../db/index.ts';

const MIGRATIONS_DIR = new URL('../../../../drizzle/', import.meta.url);
const CONFIG_PATH = fileURLToPath(new URL('wrangler.test.jsonc', import.meta.url));

export type TestDb = {
	db: Db;
	/** The raw binding, for SQL that must not go through the current Drizzle schema. */
	d1: D1Database;
	/** Applies the migrations left out by `through`, or those up to and including `options.through`. */
	migrateRest(options?: { through?: string }): Promise<void>;
	dispose(): Promise<void>;
};

/** The table `wrangler d1 migrations apply` keeps, with the same DDL, so tests see what production has. */
const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS "d1_migrations"(
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	name       TEXT UNIQUE,
	applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

/**
 * Applies one migration file the way `wrangler d1 migrations apply` does: its statements and the
 * `d1_migrations` row (named like the file, `.sql` included) in one `batch`, which D1 runs as a single
 * transaction with foreign keys enforced.
 */
async function applyMigration(d1: D1Database, file: string): Promise<void> {
	const sql = await readFile(new URL(file, MIGRATIONS_DIR), 'utf8');
	const statements = sql
		.split('--> statement-breakpoint')
		.map((statement) => statement.trim())
		.filter(Boolean);
	await d1.batch([
		...statements.map((statement) => d1.prepare(statement)),
		d1.prepare('INSERT INTO d1_migrations (name) VALUES (?)').bind(file)
	]);
}

/** The number of `files` up to and including migration `through`; all of them without `through`. */
function splitAt(files: string[], through: string | undefined): number {
	if (through === undefined) return files.length;
	const index = files.findIndex((file) => file.startsWith(`${through}_`));
	if (index === -1) throw new Error(`No migration ${through}`);
	return index + 1;
}

/**
 * A fresh in memory D1 database (Miniflare, through Wrangler's platform proxy) with every migration in `drizzle/`
 * applied in order, for server tests. `through` (a migration number such as `'0019'`) stops after that migration;
 * `migrateRest` applies the others. Call `dispose` when done; it stops the local workerd process.
 */
export async function createTestDb(options: { through?: string } = {}): Promise<TestDb> {
	const proxy = await getPlatformProxy<{ DB: D1Database }>({
		configPath: CONFIG_PATH,
		envFiles: [],
		persist: false,
		remoteBindings: false
	});
	try {
		const d1 = proxy.env.DB;
		await d1.prepare(CREATE_MIGRATIONS_TABLE).run();
		const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
		const { through } = options;
		const split = splitAt(files, through);
		for (const file of files.slice(0, split)) await applyMigration(d1, file);
		let rest = files.slice(split);
		return {
			db: getDb(d1),
			d1,
			async migrateRest(options = {}) {
				const end = splitAt(rest, options.through);
				for (const file of rest.slice(0, end)) await applyMigration(d1, file);
				rest = rest.slice(end);
			},
			dispose: proxy.dispose
		};
	} catch (error) {
		await proxy.dispose();
		throw error;
	}
}
