# Phase 2: Foods, Scanner, Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log every real meal (library, BLV, Open Food Facts by search or barcode, custom foods, quick estimates) on a working Today screen, delivered as two PRs.

**Architecture:** Pure nutrition, date and barcode math in `src/lib/domain/`. Server repositories over Drizzle/D1 in `src/lib/server/foods/` and `src/lib/server/log/`; an OFF client in `src/lib/server/off/` behind Workers Rate Limiting. Pages load data in `+page.server.ts` (so the service worker caches it); writes and sheet searches use SvelteKit remote functions (`query`, `command`) validated with Valibot schemas shared with forms.

**Tech Stack:** existing phase 1 stack, plus `valibot`, `uuidv7`, `barcode-detector` (zxing-wasm), `exceljs` (dev, BLV script only).

**Spec:** `docs/superpowers/specs/2026-11-05-phase-2-foods-logging-design.md` (phase 2 design, wins for phase 2) and `docs/superpowers/specs/2026-11-04-calorie-tracker-design.md` (sections 3, 5, 6.8, 7, 9, 10). Repo rules: `AGENTS.md`.

## Global Constraints

- Domain math lives in `src/lib/domain/` as pure functions with unit tests. No I/O there. Constants in `src/lib/domain/constants.ts`.
- Semantic design tokens only; no raw hex or arbitrary Tailwind values. Touch targets at least 44 px. Respect `prefers-reduced-motion`.
- Every new UI component gets a `/design` section showing all its states.
- Log entries store nutrition snapshots; never recompute history from current foods. Snapshots are computed on the server from the food row, never taken from the client.
- All OFF calls go through the server with User-Agent `kcal-avp/<package version> (<OFF_CONTACT_EMAIL>)`, never filtered by country, cached in `foods`.
- Validation limits: kcal per 100 between 0 and 900; protein, carbs, fat, fiber per 100 between 0 and 100; amount greater than 0 and at most 5000 (g/ml) or 50 (serving); quick kcal 0 to 10000; dates `YYYY-MM-DD` and not later than tomorrow in the settings timezone.
- Ids are UUIDv7 text (`newId()` from `src/lib/server/id.ts`). Times UTC ISO; `date` is the local date in `settings.timezone` (default `Europe/Zurich`).
- Number inputs accept `72,5` and `72.5` (reuse `parseDecimal` from `src/lib/utils/decimal.ts`).
- Schema changes: edit `src/lib/server/db/schema.ts`, `pnpm db:generate`, commit the migration. Migrations stay backward compatible for one release.
- Run `pnpm gen` after any `wrangler.jsonc` change.
- Verification gate after every task: `pnpm check && pnpm lint && pnpm test && pnpm test:e2e`.
- Never deploy or migrate remotely; the user does that.

## Review Focus

1. A meal logged at 00:30 in Zurich (23:30 UTC the previous day) must land on the Zurich date, and `/` must show it. Test in Task 6 (`localDate`).
2. A tampered client command (negative or huge amount, a kcal value sent along, a date two days ahead, an unknown food id) is rejected and writes nothing. Test in Task 6.
3. Open Food Facts hanging or answering 503 must not stop library search or logging: the OFF row shows "Product database unreachable" within 5 s. Test in Task 5 (client timeout) and Task 8 (e2e with the stub returning 503).
4. Tapping Undo twice, or Undo after the entry was already restored, must not create a duplicate or error. Test in Task 6 (`restoreEntry` idempotent).
5. A search for `100%` or `a_b` must match literally, not as LIKE wildcards. Test in Task 3.

## Execution table

| Task | PR | Deliverable | Model | Effort |
| ---- | -- | ----------- | ----- | ------ |
| 1 | 2a | Domain: nutrition, targets, search text, dates | haiku | xhigh |
| 2 | 2a | Schema, migration, ids, Valibot schemas, D1 test helper | opus | high |
| 3 | 2a | Food repository (search, upsert rules, recents, frequents) | sonnet | high |
| 4 | 2a | BLV import script and data migration | sonnet | high |
| 5 | 2a | OFF client, rate limits, env, e2e OFF stub | sonnet | high |
| 6 | 2a | Log and settings repositories, log remote commands | opus | high |
| 7 | 2a | Today screen | sonnet | high |
| 8 | 2a | Add sheet: search, amount step, add button, ⌘K | sonnet | high |
| 9 | 2a | Food form, quick add, manual target, docs; final 2a review | sonnet | high |
| 10 | 2b | Barcode normalization | haiku | high |
| 11 | 2b | Barcode lookup service and remote query | sonnet | high |
| 12 | 2b | Scanner view and miss flow; docs; final 2b review | sonnet | high |

Final branch review after Task 9 and after Task 12: opus, xhigh. Branches: `phase-2a-foods-logging`, then `phase-2b-scanner` from `main` after 2a merges.

## File Structure

```
src/lib/domain/
  constants.ts        limits, macro rules, OFF refresh age, recents sizes
  nutrition.ts        Per100, Nutrients, toGrams, snapshotFor, scaleSnapshot, perServingToPer100, sumNutrients
  targets.ts          macroTargets
  search-text.ts      normalizeSearchText, searchTokens
  dates.ts            localDate, addDays, isAllowedLogDate, loggedAtFor
  barcode.ts          normalizeBarcode (2b)
src/lib/schemas/      Valibot: food.ts, log.ts, settings.ts (shared by forms and server)
src/lib/server/
  id.ts               newId()
  db/schema.ts        + foods, log_entries, settings
  test/d1.ts          createTestDb() for server tests
  foods/repo.ts       food queries and writes
  foods/service.ts    OFF pick, refresh, barcode lookup (2b)
  off/client.ts       createOffClient, OffResult
  off/map.ts          mapOffProduct
  off/fixtures/       recorded OFF JSON
  log/repo.ts         entries
  settings/repo.ts    settings row
src/routes/(app)/
  +page.server.ts, +page.svelte              today
  day/[date]/+page.server.ts, +page.svelte   other days (shared DayView)
  log.remote.ts       log commands
  foods.remote.ts     search query, OFF search, food create/update, barcode lookup (2b)
  settings/target.remote.ts
src/lib/components/log/  DayView, DayHero, DateSwitcher, EntryRow, AddSheet, FoodSearch, FoodRow,
                         AmountStep, QuickAddForm, FoodForm, ScannerView (2b)
scripts/import-blv.ts, scripts/blv-map.ts
e2e/off-stub.mjs, e2e/log.e2e.ts, e2e/scan.e2e.ts
```

---

## PR 2a

### Task 1: Domain math

**Files:**
- Create: `src/lib/domain/{constants,nutrition,targets,search-text,dates}.ts` with `*.spec.ts` beside each.

**Interfaces:**
- Produces:
  - `type Per100 = { kcal: number; protein: number; carbs: number; fat: number; fiber: number | null }`
  - `type Nutrients = Per100` (totals for an amount)
  - `type Unit = 'g' | 'ml' | 'serving' | 'portion'`
  - `toGrams(amount: number, unit: Unit, servingG: number | null): number` (throws `RangeError` for `serving` without `servingG` and for `portion`, which phase 3 handles)
  - `snapshotFor(per100: Per100, grams: number): Nutrients` (rounded to 1 decimal; fiber stays null if null)
  - `scaleSnapshot(s: Nutrients, oldGrams: number, newGrams: number): Nutrients`
  - `perServingToPer100(perServing: Per100, servingG: number): Per100`
  - `sumNutrients(list: Nutrients[]): Nutrients` (null fiber counts as 0; result fiber is a number)
  - `macroTargets(kcal: number, weightKg: number, rules?: MacroRules): { proteinG: number; fatG: number; carbsG: number; carbsFloored: boolean }` with `MacroRules = { proteinGPerKg: 1.8; fatPct: 0.25; fatMinGPerKg: 0.6 }` defaults in constants; whole grams, rounded at the end
  - `normalizeSearchText(...parts: (string | null | undefined)[]): string` (lowercase, NFD with diacritics removed, `ß` to `ss`, non alphanumerics to single spaces, trimmed)
  - `searchTokens(query: string): string[]` (normalized words, empty words dropped)
  - `localDate(now: Date, timeZone: string): string`, `addDays(date: string, n: number): string`, `isAllowedLogDate(date: string, today: string): boolean` (valid calendar date, at most `addDays(today, 1)`), `loggedAtFor(date: string, today: string, now: Date, timeZone: string): string` (now as ISO when `date === today`, else that date at the current local time of day, as UTC ISO)

- [ ] **Step 1: Write failing tests**, including:
  - `snapshotFor({kcal:350,protein:13,carbs:60,fat:7,fiber:10}, 200)` equals `{kcal:700,protein:26,carbs:120,fat:14,fiber:20}`
  - `toGrams(1.5,'serving',40) === 60`; `toGrams(250,'ml',null) === 250`; `toGrams(1,'serving',null)` throws
  - `scaleSnapshot({kcal:700,...}, 200, 300).kcal === 1050`
  - `perServingToPer100({kcal:120,protein:6,carbs:15,fat:4,fiber:null}, 40).kcal === 300`
  - `macroTargets(3000, 70)` equals `{proteinG:126, fatG:83, carbsG:437, carbsFloored:false}`; `macroTargets(1000, 120)` has `carbsG:0, carbsFloored:true`
  - `normalizeSearchText('Hähnchenbrust', 'Migros Bio')` equals `'hahnchenbrust migros bio'`; `normalizeSearchText('Weißbrot')` equals `'weissbrot'`
  - `localDate(new Date('2026-11-04T23:30:00Z'), 'Europe/Zurich') === '2026-11-05'`; same for a summer date `2026-07-01T22:30:00Z` giving `2026-07-02`
  - `isAllowedLogDate('2026-11-06','2026-11-05')` true, `'2026-11-07'` false, `'2026-02-30'` false
  - `loggedAtFor('2026-11-03','2026-11-05', new Date('2026-11-05T11:15:00Z'), 'Europe/Zurich') === '2026-11-03T11:15:00.000Z'`
- [ ] **Step 2: Run** `pnpm vitest --run src/lib/domain` and confirm the failures.
- [ ] **Step 3: Implement.** Dates use `Intl.DateTimeFormat` with `timeZone`; no date library.
- [ ] **Step 4: Run** the tests and the gate; all pass.
- [ ] **Step 5: Commit** `feat(domain): nutrition, macro targets, search text, dates`.

### Task 2: Schema, migration, ids, schemas, test DB

**Files:**
- Modify: `src/lib/server/db/schema.ts`, `package.json` (add `valibot`, `uuidv7`)
- Create: `drizzle/0002_*.sql` (generated), `src/lib/server/id.ts`, `src/lib/schemas/{food,log,settings}.ts`, `src/lib/server/test/d1.ts`, `src/lib/server/db/schema.spec.ts`, `src/lib/schemas/schemas.spec.ts`

**Interfaces:**
- Consumes: constants from Task 1.
- Produces:
  - Drizzle tables `foods`, `logEntries`, `settings` with columns from parent spec section 5 plus phase 2 design section 3: `foods.search_text`, `foods.nutrition_basis ('g'|'ml', default 'g')`, `foods.edited_at`, `log_entries.grams` (nullable real), `log_entries.unit ('g'|'ml'|'portion'|'serving')`, `log_entries.batch_id` (plain text), `log_entries.food_id` references `foods.id` (no cascade). `settings`: `id` (integer pk, always 1), `timezone` default `'Europe/Zurich'`, `manual_target_kcal`, `manual_weight_kg`, plus a CHECK that both are null or both set.
  - Indexes: `log_entries(date)`, `log_entries(food_id, logged_at)`, unique `foods(barcode)`, unique `foods(source, source_ref)`, `foods(search_text)`.
  - Types `Food = typeof foods.$inferSelect`, `LogEntry = typeof logEntries.$inferSelect`.
  - `newId(): string` (UUIDv7).
  - Valibot: `FoodInput` (name, brand?, barcode?, nutritionBasis, kcal, protein, carbs, fat, fiber?, servingG?), `LogFoodInput` ({ date, foodId, amount, unit }), `QuickInput` ({ date, label?, kcal, protein?, carbs?, fat? }), `EditAmountInput` ({ id, amount, unit }), `ManualTargetInput` ({ kcal, weightKg } | both null). All limits from Global Constraints. Numeric fields accept strings with comma decimals via `parseDecimal`.
  - `createTestDb(): Promise<{ db: Db; dispose(): Promise<void> }>`: Miniflare D1 in memory with every `drizzle/*.sql` applied in order; `Db` is the return type of `getDb`.
- [ ] **Step 1: Write failing tests**: `schema.spec.ts` (with `createTestDb`) proves a second food with the same barcode fails, the same `(source, source_ref)` fails, and settings with only `manual_target_kcal` set fails. `schemas.spec.ts` proves `FoodInput` rejects kcal 901 and accepts `"12,5"` protein as 12.5; `LogFoodInput` rejects amount 0 and 5001 g.
- [ ] **Step 2: Run** them; they fail.
- [ ] **Step 3: Implement** the schema, run `pnpm db:generate`, add the CHECK by hand if drizzle-kit cannot express it, write `id.ts`, the schemas and `createTestDb` (add `miniflare` as a dev dependency if it is not already reachable through wrangler).
- [ ] **Step 4: Run** `pnpm db:migrate:local` and the gate; `scripts/e2e-db-reset.sh` must still find the `user_single_account` trigger.
- [ ] **Step 5: Commit** `feat(db): foods, log entries, settings`.

### Task 3: Food repository

**Files:**
- Create: `src/lib/server/foods/repo.ts`, `src/lib/server/foods/repo.spec.ts`

**Interfaces:**
- Consumes: `Db`, `Food`, `newId`, `normalizeSearchText`, `searchTokens`, `createTestDb`.
- Produces (all take `db: Db` first):
  - `searchLibrary(db, query: string, limit = 20): Promise<FoodHit[]>` where `FoodHit = Food & { logCount: number }`; non archived only; every token must appear in `search_text` (LIKE with `%`, `_`, `\` escaped, `ESCAPE '\'`); order: name starts with the first token, then `logCount` desc, then name.
  - `getFood(db, id): Promise<Food | null>`; `getFoodByBarcode(db, barcode): Promise<Food | null>` (includes archived)
  - `createFood(db, input: FoodInsert): Promise<Food>` (computes `search_text`; `source` defaults to `custom`)
  - `updateFood(db, id, input: FoodInput): Promise<Food>` (sets `edited_at` when source is not `custom`; recomputes `search_text`)
  - `upsertOffFood(db, product: MappedProduct): Promise<Food>`: if a food with that barcode exists from any source, returns it unchanged unless it is `source = off`, `edited_at` null, and `fetched_at` is older than 180 days, in which case it refreshes nutrition and `fetched_at`. Otherwise inserts with `source = off`, `source_ref = barcode`.
  - `unarchiveFood(db, id): Promise<void>`
  - `recents(db, limit = 10): Promise<RecentFood[]>` (`RecentFood = Food & { lastAmount: number; lastUnit: Unit }`), distinct foods by latest `logged_at`
  - `frequents(db, today: string, limit = 10, exclude: string[] = []): Promise<RecentFood[]>`, by entry count over `date > addDays(today, -30)`
  - `MappedProduct` type is defined here and produced by Task 5: `{ barcode, name, brand, nutritionBasis, per100: Per100, servingG: number | null }`.
- [ ] **Step 1: Write failing tests** for: token AND matching across name and brand; accent insensitive (`hahnchen` finds `Hähnchen`); `100%` and `a_b` match literally; archived foods hidden from search but found by barcode; library wins (custom food with barcode X is returned unchanged by `upsertOffFood` for X); edited OFF food is not refreshed; stale unedited OFF food is refreshed; recents distinct and ordered with last amount; frequents excludes recents and entries older than 30 days.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the gate; pass.
- [ ] **Step 5: Commit** `feat(foods): food repository`.

### Task 4: BLV import

**Files:**
- Create: `scripts/blv-map.ts`, `scripts/blv-map.spec.ts`, `scripts/import-blv.ts`, `drizzle/0003_blv_foods.sql` (via `pnpm drizzle-kit generate --custom --name blv_foods`, then filled by the script)
- Modify: `.gitignore` (`data/blv/`), `package.json` (`exceljs` dev dependency, script `blv:import`), `vite.config.ts` server test include for `scripts/**/*.spec.ts` if needed, `src/routes/(app)/settings/+page.svelte` (attribution section for BLV and OFF)

**Interfaces:**
- Consumes: `normalizeSearchText`, constants limits.
- Produces: `mapBlvRow(row: Record<string, unknown>, columns: BlvColumns): FoodInsert | null` (null when kcal, protein, carbs or fat is missing or out of range); `source = 'blv'`, `source_ref` = BLV id, `name` English if present else German, `search_text` from English, German and French names.
- [ ] **Step 1: Download** the current BLV generic foods xlsx from naehrwertdaten.ch into `data/blv/`; note version and date. Inspect its header rows and define `BlvColumns`.
- [ ] **Step 2: Write failing tests** for `mapBlvRow` with three hand written rows: complete (maps kcal, macros, fiber, names into `search_text` so `poulet`, `huhn` and `chicken` tokens are present when given), missing fat (null), kcal 950 (null).
- [ ] **Step 3: Implement** the mapper, then `import-blv.ts` (run with `node --experimental-strip-types`), which writes one `INSERT ... ON CONFLICT(source, source_ref) DO UPDATE SET ... WHERE foods.edited_at IS NULL` per row, ids via `uuidv7`, with a header comment naming source, version and licence note.
- [ ] **Step 4: Run** `pnpm blv:import`, `pnpm db:migrate:local`, then check `SELECT count(*) FROM foods WHERE source='blv'` is above 1000. Run the gate.
- [ ] **Step 5: Commit** `feat(foods): import BLV generic foods`.

### Task 5: OFF client

**Files:**
- Create: `src/lib/server/off/client.ts`, `src/lib/server/off/map.ts`, `src/lib/server/off/{client,map}.spec.ts`, `src/lib/server/off/fixtures/*.json`, `e2e/off-stub.mjs`
- Modify: `src/env.ts` (`OFF_CONTACT_EMAIL`, `OFF_BASE_URL`), `wrangler.jsonc` (`OFF_PRODUCT_LIMITER` namespace 1002 limit 12/60, `OFF_SEARCH_LIMITER` namespace 1003 limit 8/60, var `OFF_BASE_URL: "https://world.openfoodfacts.org"`, `secrets.required` adds `OFF_CONTACT_EMAIL`), `worker-configuration.d.ts` (`pnpm gen`), `.env.example`, `scripts/e2e-db-reset.sh` (write `OFF_CONTACT_EMAIL=e2e@example.invalid` to `.dev.vars`), `playwright.config.ts` (second `webServer` for the stub on port 4174; `--var OFF_BASE_URL:http://localhost:4174`), `.github/workflows/ci.yml` (placeholder `OFF_CONTACT_EMAIL` for build), `docs/decisions.md`

**Interfaces:**
- Produces:
  - `type OffResult<T> = { ok: true; value: T } | { ok: false; reason: 'rate_limited' | 'unavailable' }`
  - `createOffClient(deps: { fetch: typeof fetch; baseUrl: string; contactEmail: string; version: string; productLimiter: RateLimit; searchLimiter: RateLimit }): OffClient`
  - `OffClient.getProduct(barcode: string): Promise<OffResult<OffProductResult>>` where `OffProductResult = { kind: 'found'; product: MappedProduct } | { kind: 'incomplete'; barcode: string; prefill: Partial<FoodInput> } | { kind: 'not_found' }`
  - `OffClient.search(query: string): Promise<OffResult<MappedProduct[]>>` (at most 20, only complete products)
  - `mapOffProduct(raw: unknown): OffProductResult` (prefers `_100g` fields; converts `_serving` with `serving_quantity` in g; `nutritionBasis = 'ml'` when OFF reports per 100 ml; out of range values give `incomplete`)
  - Stub: `e2e/off-stub.mjs` serves fixtures by barcode and search term; a request with barcode `0000000000000` or search `outage` returns 503.
- [ ] **Step 1: Verify** which OFF endpoint gives usable full text search today (v2 search vs search-a-licious), record the choice and date in `docs/decisions.md`, and record fixtures: a full product, a per serving only product, a not found response, a search result page.
- [ ] **Step 2: Write failing tests**: User-Agent header exact; requested `fields` limited; limiter `success: false` gives `rate_limited` without calling fetch; HTTP 429 gives `rate_limited`; 503 and a fetch that never resolves (5 s `AbortSignal.timeout`, use fake timers) give `unavailable`; mapper cases for each fixture plus kcal 1200 giving `incomplete`.
- [ ] **Step 3: Implement**, `pnpm gen`, wire env and wrangler.
- [ ] **Step 4: Run** the gate (e2e must start both servers).
- [ ] **Step 5: Commit** `feat(off): Open Food Facts client with rate limits`.

### Task 6: Log and settings repositories, log commands

**Files:**
- Create: `src/lib/server/log/repo.ts`, `src/lib/server/log/repo.spec.ts`, `src/lib/server/settings/repo.ts`, `src/lib/server/settings/repo.spec.ts`, `src/lib/server/foods/service.ts`, `src/lib/server/foods/service.spec.ts`, `src/routes/(app)/log.remote.ts`, `src/lib/server/context.ts` (gets `db`, `off`, `settings`, `today` from the request event)

**Interfaces:**
- Consumes: Tasks 1, 2, 3, 5.
- Produces:
  - `getSettings(db): Promise<Settings>` (creates the row on first read); `saveManualTarget(db, v: { kcal: number; weightKg: number } | null): Promise<void>`
  - `dayEntries(db, date): Promise<LogEntry[]>` ordered by `logged_at`; `dayTotals(entries): Nutrients` (via `sumNutrients`)
  - `addFoodEntry(db, input: LogFoodInput, ctx: { today: string; now: Date; timeZone: string }): Promise<LogEntry>`: loads the food (404 if missing), computes `grams` with `toGrams` and the snapshot with `snapshotFor`, `label` = food name, `kind = 'food'`, unarchives the food
  - `addQuickEntry(db, input: QuickInput, ctx): Promise<LogEntry>`; `updateQuickEntry(db, id, input): Promise<LogEntry>`
  - `updateEntryAmount(db, input: EditAmountInput): Promise<LogEntry>` (scales the stored snapshot by new grams / stored grams; needs the food only for `serving_g` when the new unit is `serving`)
  - `deleteEntry(db, id): Promise<LogEntry | null>`; `restoreEntry(db, entry: LogEntry): Promise<void>` (`INSERT ... ON CONFLICT(id) DO NOTHING`)
  - `resolveOffPick(db, off, barcode): Promise<Food | { unavailable: true }>` (library first, else `getProduct` then `upsertOffFood`)
  - Remote commands in `log.remote.ts`: `logFood`, `logQuick`, `editAmount`, `editQuick`, `removeEntry` (returns the deleted entry for undo), `restoreEntry`. Each validates with its Valibot schema, rejects dates failing `isAllowedLogDate`, and refreshes the page's load data.
- [ ] **Step 1: Write failing tests** for: snapshot computed from the food, not from any client number (a `LogFoodInput` with an extra `kcal` field is rejected by the schema); unknown food id errors and writes nothing; date `addDays(today, 2)` rejected; `loggedAt` for a past day; unit switch g to serving rescales correctly (200 g at serving 40 g edited to 2 servings gives 80 g worth); `restoreEntry` twice leaves one row; logging an archived food unarchives it; `saveManualTarget(null)` clears both; `resolveOffPick` returns the library row without calling OFF when the barcode exists.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the gate.
- [ ] **Step 5: Commit** `feat(log): log entries, settings, log commands`.

### Task 7: Today screen

**Files:**
- Create: `src/lib/components/log/{DayView,DayHero,DateSwitcher,EntryRow}.svelte`, `src/routes/(app)/+page.server.ts`, `src/routes/(app)/day/[date]/+page.server.ts`, `src/routes/(app)/day/[date]/+page.svelte`, browser component specs for DayHero and DateSwitcher, `e2e/log.e2e.ts` (started here)
- Modify: `src/routes/(app)/+page.svelte`, `src/routes/(app)/design/+page.svelte`, `src/lib/components/ui/names.ts` if it lists components

**Interfaces:**
- Consumes: `getSettings`, `dayEntries`, `dayTotals`, `macroTargets`, `localDate`, `recents`, `frequents`, log commands.
- Produces: load data `{ date: string; today: string; entries: LogEntry[]; totals: Nutrients; target: { kcal: number; proteinG: number; fatG: number; carbsG: number; carbsFloored: boolean } | null; recents: RecentFood[]; frequents: RecentFood[] }` for both routes; `/day/[date]` with `date === today` redirects to `/`; invalid or too late dates give 404.
- Behaviour: hero as design section 6 (no target: eaten kcal and grams; target: remaining kcal, ProgressBar, three MacroBars; over target: "over by N kcal" in a neutral or success token). Entries list with tap to edit (opens AmountStep from Task 8, or QuickAddForm for quick entries), delete from a row menu and by swipe left, toast with Undo calling `restoreEntry`. Optimistic remove with rollback and a Retry toast on failure. Prev/next IconButtons and horizontal swipe; next is disabled on tomorrow with an explanation.
- [ ] **Step 1: Write failing tests**: component specs for DayHero states (no target, under, over) and DateSwitcher (disabled next on tomorrow); e2e: empty day shows empty state; delete with undo restores the row; switching to yesterday changes URL to `/day/<date>` and back.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement**, with `/design` sections for the new components. Seed e2e data through the remote commands or a test helper, not by hand SQL.
- [ ] **Step 4: Run** the gate.
- [ ] **Step 5: Commit** `feat(today): day view with entries and hero`.

### Task 8: Add sheet

**Files:**
- Create: `src/lib/components/log/{AddSheet,FoodSearch,FoodRow,AmountStep}.svelte`, `src/routes/(app)/foods.remote.ts`, component specs for AmountStep
- Modify: `src/lib/components/shell/TabBar.svelte`, `src/lib/components/shell/Sidebar.svelte` (center add button / sidebar add button, 44 px), `src/routes/(app)/+layout.svelte` (⌘K / Ctrl+K opens the sheet), `e2e/log.e2e.ts`, `/design`

**Interfaces:**
- Consumes: `searchLibrary`, `resolveOffPick`, `OffClient.search`, `getFood`, log commands, `toGrams`, `snapshotFor`.
- Produces: remote `searchFoods(q: string): FoodHit[]` (query), `searchOff(q: string): OffResult<MappedProduct[]>` (command), `pickOff(barcode: string): Food | { unavailable: true }` (command). Add sheet state is shared with Task 9 (QuickAddForm, FoodForm) and Task 12 (Scan) through `AddSheet` props or a small store; the implementer picks one and documents it in the component header.
- Behaviour: design section 5. Library search debounced 200 ms; a "Search Open Food Facts" row runs `searchOff` only on Enter or tap; unavailable shows "Product database unreachable" and keeps library results. AmountStep: SegmentedControl for g (or ml) / serving, default amount = last used, else one serving, else 100; live preview through `snapshotFor` (display only; server recomputes).
- [ ] **Step 1: Write failing tests**: AmountStep preview for `"1,5"` servings of a 40 g serving food shows 60 g worth of kcal; default amount rules; e2e: search `poulet` finds a BLV food, log 200 g, Today total updates; OFF search with the stub returns a product, picking and logging it works; search `outage` shows the unreachable message while library results stay; ⌘K opens the sheet on desktop.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement**, with `/design` sections.
- [ ] **Step 4: Run** the gate.
- [ ] **Step 5: Commit** `feat(log): add sheet with search and amount step`.

### Task 9: Food form, quick add, manual target, docs

**Files:**
- Create: `src/lib/components/log/{FoodForm,QuickAddForm}.svelte`, `src/routes/(app)/settings/target.remote.ts`, component specs
- Modify: `foods.remote.ts` (`createFood`, `updateFood` commands), `src/routes/(app)/settings/+page.svelte` and a `+page.server.ts` for it, `AddSheet`, `AmountStep` (menu: Edit food), `e2e/log.e2e.ts`, `/design`, `docs/architecture.md` (data flow, OFF, rate limits, BLV migration, directory map), `docs/decisions.md` (calls from the phase 2 design), `AGENTS.md` if a rule changed, parent spec section 5 (`grams`, `ml`, `edited_at`, `search_text`, `nutrition_basis`, settings columns for now)

**Interfaces:**
- Consumes: `createFood`, `updateFood`, `addQuickEntry`, `updateQuickEntry`, `saveManualTarget`, `FoodInput`, `QuickInput`, `ManualTargetInput`.
- Produces: `FoodForm` props `{ initial?: Partial<FoodInput>; foodId?: string; onsaved(food: Food): void }` (Task 12 reuses it for the miss flow with `initial.barcode` set). `QuickAddForm` props `{ entry?: LogEntry; date: string; ondone(): void }`.
- Behaviour: validation on blur; FoodForm explains that edits do not change past days. Settings "Daily target (temporary)" with kcal and body weight, both or neither, a Clear action, the derived macros shown live, copy saying weight tracking replaces it later.
- [ ] **Step 1: Write failing tests**: FoodForm rejects kcal 901 on blur and accepts `12,5`; e2e: create a custom food and log it; quick add 650 kcal "Restaurant" then edit it to 700; set target 3000 / 70 in Settings, Today shows remaining kcal and protein target 126 g; clear it and the hero returns to eaten only.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement** and update the docs.
- [ ] **Step 4: Run** the full gate.
- [ ] **Step 5: Commit** `feat(log): custom foods, quick add, manual target`.
- [ ] **Step 6: Final 2a branch review** (opus, xhigh), fix findings, open the PR. Remind the user to run `pnpm wrangler secret put OFF_CONTACT_EMAIL` before merging.

---

## PR 2b

### Task 10: Barcode normalization

**Files:**
- Create: `src/lib/domain/barcode.ts`, `src/lib/domain/barcode.spec.ts`

**Interfaces:**
- Produces: `type BarcodeFormat = 'ean_13' | 'ean_8' | 'upc_a' | 'upc_e'`; `normalizeBarcode(raw: string, format?: BarcodeFormat): string | null`: trims, digits only; returns EAN-13 (or EAN-8 kept as is) with a valid check digit, else null. Without `format` (manual entry) the length decides: 13 EAN-13, 12 UPC-A (prefix `'0'`), 8 EAN-8. With `format: 'upc_e'` the 8 digits expand to UPC-A, then EAN-13.
- [ ] **Step 1: Write failing tests**: `'4006381333931'` stays; `'4006381333932'` is null; `'036000291452'` gives `'0036000291452'`; `'96385074'` stays; `normalizeBarcode('04252614', 'upc_e')` gives `'0042100005264'`; `' 4006381333931 '` gives the trimmed code; `'abc'` is null.
- [ ] **Step 2: Run**; fail. **Step 3: Implement.** **Step 4: Run** the gate.
- [ ] **Step 5: Commit** `feat(domain): barcode normalization`.

### Task 11: Barcode lookup

**Files:**
- Modify: `src/lib/server/foods/service.ts` and its spec, `src/routes/(app)/foods.remote.ts`

**Interfaces:**
- Consumes: `normalizeBarcode`, `getFoodByBarcode`, `OffClient.getProduct`, `upsertOffFood`.
- Produces: `lookupBarcode(db, off, raw: string, format?: BarcodeFormat): Promise<BarcodeLookup>` with `BarcodeLookup = { kind: 'hit'; food: Food } | { kind: 'miss'; barcode: string; prefill: Partial<FoodInput> } | { kind: 'unavailable'; barcode: string } | { kind: 'invalid' }`; remote query `lookupBarcode`. A hit on a stale unedited OFF food returns at once and refreshes through `platform.context.waitUntil`.
- [ ] **Step 1: Write failing tests**: library hit (archived included) without calling OFF; OFF found is stored and a second lookup does not call OFF; OFF incomplete gives `miss` with prefill and barcode; OFF not found gives `miss` with only the barcode; rate limited or unavailable gives `unavailable`; invalid check digit gives `invalid`.
- [ ] **Step 2: Run**; fail. **Step 3: Implement.** **Step 4: Run** the gate.
- [ ] **Step 5: Commit** `feat(foods): barcode lookup`.

### Task 12: Scanner and miss flow

**Files:**
- Create: `src/lib/components/log/ScannerView.svelte`, `src/lib/scanner/detector.ts` (lazy `barcode-detector` import, formats `ean_13, ean_8, upc_a, upc_e`), `e2e/scan.e2e.ts`
- Modify: `package.json` (`barcode-detector`), `AddSheet` (Scan action), `/design` (static scanner states: starting, scanning, denied, unsupported, unavailable), `docs/architecture.md`, `docs/decisions.md`

**Interfaces:**
- Consumes: `lookupBarcode` remote, `FoodForm`, `AmountStep`.
- Produces: `createDetector(): Promise<{ detect(source: CanvasImageSource): Promise<{ rawValue: string; format: string }[]> }>`. E2E replaces `getUserMedia` and the detector through `page.addInitScript` (a fake `MediaStream` from a canvas and a global `BarcodeDetector` stub returning a chosen code); the module prefers `globalThis.BarcodeDetector` when present so the stub is used.
- Behaviour: design section 8. Camera starts only after the tap; torch toggle when the track reports `torch`; manual EAN field always visible; `navigator.vibrate?.(50)` on success; stop the stream on close. Hit opens AmountStep; miss opens FoodForm with the barcode and prefill, then AmountStep; unavailable shows the message with manual food entry, barcode kept; invalid asks to rescan.
- [ ] **Step 1: Write failing e2e tests**: scan hit (stub product) logs; scan miss creates a custom food, logs it, and a second scan of the same code goes straight to AmountStep; camera denied shows the explanation and manual entry; manual EAN entry works; outage barcode `0000000000000` shows unreachable with the barcode prefilled in FoodForm.
- [ ] **Step 2: Run**; fail. **Step 3: Implement**, checking that Today's JS does not include zxing-wasm (the import is dynamic). **Step 4: Run** the full gate.
- [ ] **Step 5: Commit** `feat(scan): barcode scanner with miss flow`.
- [ ] **Step 6: Final 2b branch review** (opus, xhigh), fix findings, open the PR.
