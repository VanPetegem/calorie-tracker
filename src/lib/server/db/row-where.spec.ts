import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../test/d1.ts';
import { rowWhere } from './row-where.ts';

const notes = sqliteTable('row_where_notes', {
	id: integer('id').primaryKey(),
	body: text('body').notNull(),
	note: text('note'),
	tag: text('tag')
		.notNull()
		.$defaultFn(() => 'made'),
	kind: text('kind').notNull().default('plain')
});

describe('rowWhere', () => {
	let test: TestDb;
	beforeAll(async () => {
		test = await createTestDb();
		await test.d1.exec(
			"CREATE TABLE row_where_notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL, note TEXT, tag TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'plain')"
		);
	});
	afterAll(async () => {
		await test.dispose();
	});

	it('fills an omitted column from its default, its default function or NULL', async () => {
		await test.db.insert(notes).select(rowWhere(notes, { id: 1, body: 'a' }, sql`1`));

		expect(await test.db.select().from(notes)).toEqual([
			{ id: 1, body: 'a', note: null, tag: 'made', kind: 'plain' }
		]);
	});

	it('refuses an omitted required column without a default', () => {
		expect(() => rowWhere(notes, { id: 2 }, sql`1`)).toThrow('No value or default for body');
	});
});
