# Phase 5a: Weekly R2 Backup

Date: 2026-11-08. Status: approved.

## Goal

A weekly JSON export of every app table to R2, kept 12 weeks, with a tested restore path. Complements D1 Time
Travel (30 days, same account) with an independent copy.

## Non goals

- Auth tables (`user`, `session`, `account`, `verification`, `passkey`). After a restore the user registers a new
  passkey via `/setup`. No session tokens are stored in R2.
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
  `{ version: 1, createdAt: ISO string, migration: "<latest drizzle journal tag>", tables: { <table>: rows[] } }`.
- `migration` comes from `drizzle/meta/_journal.json` bundled into the Worker; CI migrates before deploying, so it
  matches production.
- A failure throws, so it shows in Workers Logs and the cron's status. Running twice on one day overwrites the object.
- An R2 lifecycle rule (set once by the user) deletes objects after 90 days.
- `pnpm backup:restore <file.json> > restore.sql` prints SQL: `PRAGMA defer_foreign_keys = true`, deletes in reverse
  table order, inserts in table order. It refuses a file whose `version` is unknown or whose `migration` differs from
  the repo's latest journal tag. The user then runs `pnpm wrangler d1 execute DB --remote --file restore.sql`.

## Data and interface

- `src/lib/server/backup/format.ts`: `BACKUP_VERSION`, `BACKUP_TABLES` (insertion order), `BackupFile`,
  `BackupRow`, `backupKey(date)`.
- `src/lib/server/backup/export.ts`: `readBackup(d1, migration, now): Promise<BackupFile>`,
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
- The existing e2e run serves the wrapper entry, which proves `fetch` still works.

## One time setup (user)

```sh
pnpm wrangler r2 bucket create kcal-backups
pnpm wrangler r2 bucket lifecycle add kcal-backups expire-90d backups/ --expire-days 90
```

The bucket must exist before the merge deploys, or `wrangler deploy` fails.
