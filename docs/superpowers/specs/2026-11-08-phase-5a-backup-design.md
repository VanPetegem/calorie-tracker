# Phase 5a: Weekly R2 Backup

Date: 2026-11-08. Status: approved.

## Goal

A weekly JSON export of every app table to R2, kept 12 weeks, with a tested restore path. Complements D1 Time
Travel (30 days, same account) with an independent copy.

## Non goals

- Auth tables (`user`, `session`, `account`, `verification`, `passkey`). A restore into the existing database leaves
  them alone, so the passkey keeps working; only a recreated database needs a new passkey via `/setup`. No session
  tokens are stored in R2.
- A restore UI, backup status in Settings, encryption beyond R2's default at rest encryption.

## Approach

The SvelteKit Cloudflare adapter (8.0.2) emits a Worker with only `fetch`. A wrapper entry, `worker/index.ts`,
re-exports that `fetch` and adds `scheduled`; `wrangler.jsonc` `main` points at the wrapper. One Worker, one deploy,
no new secrets. Rejected: a separate backup Worker (two configs and deploys) and a GitHub Actions `wrangler d1
export` (a CI token that can export production data, SQL instead of JSON).

## Behaviour

- Cron `0 3 * * 1` (Monday 03:00 UTC) calls `runBackup(d1, bucket, scheduledTime)`.
- It reads every app table with raw `SELECT *` (real column names and stored SQLite values, no Drizzle mapping) in
  one D1 `batch`, so the snapshot is consistent, and writes `backups/YYYY-MM-DD.json` (UTC date of the scheduled
  time):
  `{ version: 1, createdAt: ISO string, migration: "<newest d1_migrations name>", tables: { <table>: rows[] } }`.
- `migration` is `SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1`, read in the same batch (wrangler stores
  the file name, e.g. `0022_targets.sql`). It is the database's own state, so it is right even when the deployed code
  is ahead of the last migration. An empty table fails the export.
- A failure throws and shows only as a failed cron event in the dashboard. Running twice on one day overwrites the
  object. The free plan allows 10 ms of CPU per cron run; the export is about 586 KB and about 2 ms.
- An R2 lifecycle rule (set once by the user) deletes objects after 90 days.
- `pnpm backup:restore <backup.json> <restore.sql>` writes SQL to the second path itself (a redirect would capture
  pnpm's banner; an existing file is overwritten): `PRAGMA defer_foreign_keys = true`, deletes in reverse table
  order, inserts in table order. It refuses a file whose `version` is unknown or whose `migration` differs from the
  repo's latest journal tag plus `.sql`. The user then runs `pnpm wrangler d1 execute DB --remote --file
  .backups/restore.sql`, after checking the target's newest `d1_migrations` name equals the backup's and noting a
  Time Travel bookmark (a remote file import may not roll back on an error halfway). Downloads and the SQL live in
  `.backups/`, which is gitignored: the repo is public and the data is health data.
- Restore into the existing database keeps the passkey. A recreated database needs: create D1, update `database_id`,
  migrate at the backup's commit, restore, then register a passkey via `/setup`.

## Data and interface

- `src/lib/server/backup/format.ts`: `BACKUP_VERSION`, `BACKUP_TABLES` (insertion order), `BackupFile`,
  `BackupRow`, `backupKey(date)`.
- `src/lib/server/backup/export.ts`: `readBackup(d1, now): Promise<BackupFile>`,
  `runBackup(d1, bucket, now): Promise<string>` (returns the key).
- `src/lib/server/backup/restore.ts`: `restoreStatements(file, migration): string[]`, pure.
- `src/lib/server/backup/scheduled.ts`: the `scheduled` handler.
- `worker/index.ts`: the wrapper entry. `scripts/backup-restore.ts`: the CLI.
- `wrangler.jsonc`: `r2_buckets` binding `BACKUPS` (bucket `kcal-backups`), `triggers.crons`. `pnpm gen`.
- No schema change.

## Edge cases

- Empty tables export as `[]`.
- A new table in `schema.ts` fails a test until it is added to `BACKUP_TABLES`.
- Strings with quotes, newlines and unicode survive the round trip; `null` stays `null`; reals stay exact.

## Tests (unit, no new e2e)

- Export against the Miniflare test D1 with a fake bucket: object key, body shape, every table present.
- `BACKUP_TABLES` equals the set of tables in `schema.ts`; its order puts every referenced table first.
- Round trip: seed rows in all tables, export, run `restoreStatements` against a second migrated test D1 (which
  already has rows that must be replaced), rows equal.
- Restore refuses a wrong `version` or `migration`.
- `scheduled` calls `runBackup` with the bindings and the scheduled time, through `waitUntil`.
- `readBackup` takes `migration` from the newest `d1_migrations` row and throws when the table is empty; the test D1
  mirrors wrangler's table. A `worker/index.ts` test checks `fetch` and `scheduled` are exported; a test keeps
  `assets` of `wrangler.jsonc` and `wrangler.adapter.jsonc` equal; `BACKUP_TABLES` must contain every foreign key
  target.
- The existing e2e run serves the wrapper entry, which proves `fetch` still works.

## One time setup (user)

Enable R2 in the dashboard first (a payment method is needed even on the free tier) and add Account "Workers R2
Storage: Edit" to the deploy token.

```sh
pnpm wrangler r2 bucket create kcal-backups
pnpm wrangler r2 bucket lifecycle add kcal-backups expire-90d backups/ --expire-days 90
```

The bucket must exist before the merge deploys, or `wrangler deploy` fails.
