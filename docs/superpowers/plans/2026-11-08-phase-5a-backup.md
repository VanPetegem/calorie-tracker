# Phase 5a Plan: Weekly R2 Backup

Spec: `docs/superpowers/specs/2026-11-08-phase-5a-backup-design.md`. Branch: `phase-5a-backup`.
Shared interface, committed before the tasks: `src/lib/server/backup/format.ts`.

Tasks A and B run in parallel (separate worktrees) and touch disjoint files, except `package.json` (A adds
`backup:restore`, B edits `preview`). Per task gate: `pnpm check && pnpm lint && pnpm test`. Full gate with e2e once
before the PR.

## Task A: export, restore, CLI (sonnet, high)

Files: `src/lib/server/backup/{export,restore}.ts` with `export.spec.ts`, `restore.spec.ts`, `format.spec.ts`;
`scripts/backup-restore.ts`; `package.json` script `backup:restore`.

- `export.ts`
  - `readBackup(d1: D1Database, migration: string, now: Date): Promise<BackupFile>`: one `d1.batch` of
    `SELECT * FROM "<table>"` for each of `BACKUP_TABLES`.
  - `runBackup(d1: D1Database, bucket: R2Bucket, now: Date): Promise<string>`: reads with the latest tag from
    `drizzle/meta/_journal.json` (JSON import; export `LATEST_MIGRATION`), `bucket.put(backupKey(now), JSON, {
httpMetadata: { contentType: 'application/json' } })`, returns the key.
- `restore.ts`: `restoreStatements(file: unknown, migration: string): string[]`. Validates `version`, `migration`,
  and that `tables` has exactly `BACKUP_TABLES` with array values (throw `Error` with a clear message otherwise).
  Returns `PRAGMA defer_foreign_keys = true`, `DELETE FROM` in reverse order, then one `INSERT` per row in order
  with quoted identifiers and literals: `NULL`, finite numbers via `String` (reject non finite), strings with `'`
  doubled. No imports beyond `format.ts`.
- `scripts/backup-restore.ts` (run like `blv:import`: `node --experimental-strip-types`): reads the file argument and
  the journal, prints statements joined by `;\n` plus a trailing `;`, exits 1 with the message on error.
- Tests (Miniflare via `createTestDb`):
  - `format.spec.ts`: `BACKUP_TABLES` equals the `getTableName` of every `SQLiteTable` export of `schema.ts`; for
    each table, every foreign key target appears earlier (use drizzle `getTableConfig(...).foreignKeys`).
  - `export.spec.ts`: seed one row per table (empty tables export `[]` too), fake bucket records `put`; checks key,
    content type, body `version`, `migration`, `createdAt`, the seeded rows with snake_case columns.
  - `restore.spec.ts`: round trip into a second test DB that already holds different rows (run the statements with
    `d1.batch(statements.map(s => d1.prepare(s)))`); every table equal. Include a string with `'`, a newline and an
    emoji, a null, and a real like `0.1 + 0.2`. Refusals: wrong version, wrong migration, missing table.

## Task B: wrapper entry, scheduled, config, docs (sonnet, high)

Files: `src/lib/server/backup/scheduled.ts` + `scheduled.spec.ts`, `worker/index.ts`, `wrangler.jsonc`,
`worker-configuration.d.ts` (via `pnpm gen`), `scripts/worker-types.mjs`, `package.json` (`preview`), tsconfig or
eslint config if needed, `docs/architecture.md`, `docs/decisions.md`, `AGENTS.md` deploy section.

- `scheduled.ts`: `scheduled: ExportedHandlerScheduledHandler<Env>` calling
  `ctx.waitUntil(runBackup(env.DB, env.BACKUPS, new Date(controller.scheduledTime)))`. Import `runBackup` from
  `./export.ts` (Task A writes it; until merge, test with `vi.mock('./export.ts')`).
- `worker/index.ts`: default export `{ fetch: app.fetch, scheduled }` where `app` is the default export of
  `../.svelte-kit/cloudflare/_worker.js`. Make `pnpm check` pass on a fresh checkout without a build (the existing
  `worker-types.mjs` stub exists for exactly this; extend it as needed so `wrangler types --check` and svelte-check
  are stable with and without a build).
- `wrangler.jsonc`: `main: "worker/index.ts"`, `r2_buckets: [{ binding: "BACKUPS", bucket_name: "kcal-backups" }]`,
  `triggers: { crons: ["0 3 * * 1"] }`, comments like the existing ones. Run `pnpm gen`.
- `package.json` `preview`: serve the wrapper (`wrangler dev` with the config's `main`), keeping the other flags.
- Prove locally: `pnpm build && pnpm preview`, then `curl "http://localhost:4173/cdn-cgi/handler/scheduled"` (needs
  `--test-scheduled`; add it to a one off command, not the script) and confirm a backup object in local R2 (e.g.
  `pnpm wrangler r2 object get kcal-backups/backups/<date>.json --local --pipe`). Quote the output.
- Docs: architecture (backup section, restore steps, one time bucket and lifecycle commands from the spec), decisions
  (newest first under 2026-11-08: wrapper entry, app tables only, journal tag, 90 day lifecycle), AGENTS.md (bucket
  must exist before deploy).

## After merge of A and B

1. Full gate `pnpm verify`; quote output.
2. Final branch review (opus, xhigh) in a fresh context.
3. PR. The user creates the bucket and lifecycle rule before merging.
