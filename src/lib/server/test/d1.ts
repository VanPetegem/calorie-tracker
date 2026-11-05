import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';
import { getDb, type Db } from '../db/index.ts';

const MIGRATIONS_DIR = new URL('../../../../drizzle/', import.meta.url);
const CONFIG_PATH = fileURLToPath(new URL('wrangler.test.jsonc', import.meta.url));

/**
 * A fresh in memory D1 database (Miniflare, through Wrangler's platform proxy) with every migration in `drizzle/`
 * applied in order, for server tests. Call `dispose` when done; it stops the local workerd process.
 */
export async function createTestDb(): Promise<{ db: Db; dispose(): Promise<void> }> {
	const proxy = await getPlatformProxy<{ DB: D1Database }>({
		configPath: CONFIG_PATH,
		envFiles: [],
		persist: false,
		remoteBindings: false
	});
	try {
		const d1 = proxy.env.DB;
		const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
		for (const file of files) {
			const sql = await readFile(new URL(file, MIGRATIONS_DIR), 'utf8');
			const statements = sql
				.split('--> statement-breakpoint')
				.map((statement) => statement.trim())
				.filter(Boolean);
			await d1.batch(statements.map((statement) => d1.prepare(statement)));
		}
		return { db: getDb(d1), dispose: proxy.dispose };
	} catch (error) {
		await proxy.dispose();
		throw error;
	}
}
