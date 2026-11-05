import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DRIZZLE = new URL('../drizzle/', import.meta.url);
/** `wrangler d1 migrations apply --remote` sends a migration file as one request; D1 rejects bodies near 100 KB. */
const MAX_MIGRATION_BYTES = 80_000;

const files = readdirSync(DRIZZLE)
	.filter((name) => name.endsWith('.sql'))
	.sort();
const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', DRIZZLE), 'utf8')) as {
	entries: { idx: number; tag: string }[];
};

describe('drizzle migrations', () => {
	it('keeps every migration file small enough to apply to remote D1 in one request', () => {
		for (const file of files) {
			expect(statSync(new URL(file, DRIZZLE)).size, file).toBeLessThan(MAX_MIGRATION_BYTES);
		}
	});

	it('lists every migration file in the journal, in order, with a snapshot each', () => {
		expect(journal.entries.map((entry) => entry.tag)).toEqual(
			files.map((f) => f.replace('.sql', ''))
		);
		journal.entries.forEach((entry, position) => {
			expect(entry.idx).toBe(position);
			expect(entry.tag.startsWith(String(position).padStart(4, '0'))).toBe(true);
			expect(
				statSync(new URL(`meta/${entry.tag.slice(0, 4)}_snapshot.json`, DRIZZLE)).isFile()
			).toBe(true);
		});
	});

	it('chains the snapshots, each pointing at the one before', () => {
		let previous: string | null = null;
		for (const entry of journal.entries) {
			const snapshot = JSON.parse(
				readFileSync(new URL(`meta/${entry.tag.slice(0, 4)}_snapshot.json`, DRIZZLE), 'utf8')
			) as { id: string; prevId: string };
			if (previous !== null) expect(snapshot.prevId, entry.tag).toBe(previous);
			previous = snapshot.id;
		}
	});
});
