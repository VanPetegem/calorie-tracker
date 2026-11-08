# Architecture

kcal is a single user SvelteKit 3 PWA served by one Cloudflare Worker, with D1 (SQLite) for data. Production
runs at `https://kcal.avp.software`.

## Request flow

```
browser -> Cloudflare (custom domain) -> Worker (.svelte-kit/cloudflare/_worker.js)
  static files   -> ASSETS binding (served before the Worker runs)
  everything else -> src/hooks.server.ts -> route load / action / endpoint -> D1 (DB binding)
```

`src/hooks.server.ts` guards every request that reaches SvelteKit, in this order:

1. **Rate limit.** `isRateLimitedPath` (`src/lib/server/rate-limit.ts`) picks POSTs that try a credential or create
   the account: `/login`, `/setup`, `/api/auth/sign-in/*`, `/api/auth/sign-up/*` and
   `/api/auth/passkey/verify-authentication`. They are counted per `cf-connecting-ip` in the `AUTH_LIMITER`
   binding (10 a minute). API paths get a 429 at once; form actions get `locals.rateLimited` and answer 429
   themselves.
2. **Session.** If a Better Auth session cookie is present, `auth.api.getSession` loads the session into
   `locals.session` and `locals.user`. An invalid, expired or revoked session is treated as none; a lookup
   error throws (fail closed).
3. **Access.** `decideAccess` (`src/lib/server/guard.ts`, pure and unit tested) allows public paths (`/login`,
   `/setup`, `/api/auth/*`, `/_app/*` except remote functions, manifest, service worker, icons). Without a
   session a page navigation gets a 303 to `/login?redirectTo=...`; any other request gets a 401.
4. **Handler.** `svelteKitHandler` serves Better Auth's endpoints under `/api/auth` and hands the rest to
   SvelteKit.

Auth is Better Auth with passkeys, one account only: sign up is closed in a `user.create.before` hook and a D1
trigger (`user_single_account`). Sessions last a year and slide daily.

## Service worker

`src/service-worker/index.ts` makes the installed app open offline:

- Build files and static files are precached and served cache first.
- Page navigations go network first. Each good (OK, not redirected) response is cached per URL. When the
  network fails, that URL's cached page is used; only `/` falls back to the cached home page; any other
  uncached URL gets a small 503 "This page is unavailable offline" page.
- Client side navigations fetch `<path>/__data.json`. Those go network first into the same cache, one copy per path. The
  worker drops `x-sveltekit-invalidated` (the server then loads every node, so one copy fits any request). Only load
  results are stored, never a redirect. With no copy offline it answers 503; SvelteKit turns that into a full navigation
  only because the root layout has a server load (`src/routes/+layout.server.ts`, keep it). See `docs/decisions.md`
  (2026-11-08).
- `/api/*` and anything that is not a same origin GET is never touched.
- Caches are named `kcal-<version>`; old versions are deleted on activate.
- Sign out (`src/lib/auth-client.ts`) deletes every `kcal-*` cache so pages rendered for the session cannot be
  reopened afterwards.

## Foods and logging

Data flow of the log screens:

```
page load (src/routes/(app)/+page.server.ts, day/[date]) -> loadDay -> entries, totals, target, recents, frequents
add sheet / forms / edit sheet -> remote command (foods.remote.ts, log.remote.ts)
                               -> Valibot schema (src/lib/schemas) -> repo (src/lib/server/*/repo.ts) -> D1
                               -> await invalidateAll() -> the page load runs again
```

- Reads for the page come from `load`, so the service worker's cached navigation shows the last loaded day and its
  recents offline. Writes are remote `command`s (experimental remote functions, enabled in `vite.config.ts`);
  a command cannot refresh `load`, so the caller invalidates. Search while typing is a `query` (`searchFoods`);
  Open Food Facts calls are commands, because a query result is cached by argument.
- `src/lib/server/context.ts` builds the per request context: database, OFF client, settings row, `today` in the
  settings timezone. Log dates are checked against it (no later than tomorrow).
- Log entries store nutrition snapshots (kcal, protein, carbs, fat, fiber) and the gram equivalent of the amount;
  editing an amount rescales the snapshot by new grams over old grams, never from the food. Deleting an entry sets
  `deleted_at`; Undo clears it by id.
- Foods: `custom`, `blv` (generics) and `off` (cached products), unique on barcode and on `(source, source_ref)`.
  Library search is `LIKE` over `search_text` (lowercased, diacritics stripped, German and French names included).
  Values are per 100 g or per 100 ml (`nutrition_basis`). Foods are archived, never deleted, once logged.
- Today's hero shows the remaining kcal and macro bars against the target of its week (see Targets below), and
  flags carbs when protein and fat already use the whole target (`carbs_floored`).

### Open Food Facts

All OFF calls go through the server (`src/lib/server/off/client.ts`) with the User-Agent
`kcal-avp/<version> (<OFF_CONTACT_EMAIL>)`, a 5 second timeout and no exceptions: the client returns
`{ ok: false, reason: 'rate_limited' | 'unavailable' }`. Product reads use `OFF_BASE_URL` (v2 API); text search uses
`OFF_SEARCH_URL` (search-a-licious). Results that pass validation are upserted into `foods` (`source = off`,
`fetched_at`). The library wins when a barcode already exists: `resolveOffPick` returns that food without calling
OFF. `upsertOffFood` can refresh an unedited OFF food older than 180 days, but in phase 2a nothing reaches that
branch, because the library lookup comes first; the refresh arrives with the barcode lookup in 2b. Typing searches
the library only; OFF is searched when the person submits.

### Barcode scanner

Scan is an action in the search step of the add sheet (`FoodSearch.svelte`) and opens the `scan` step
(`ScannerView.svelte`, presented by `ScannerPanel.svelte`, which `/design` renders without a camera). The camera
starts when the step mounts, that is after the tap, and every track is stopped when it unmounts, which closing the
sheet does. Detection runs every 250 ms on the video element and stops after the first code, until "Scan again".
The code goes to the `lookupBarcode` command (normalization, library, then OFF): a hit opens the amount step, a
miss opens `FoodForm` with the barcode and any partial OFF values and then the amount step, an outage shows
"Product database unreachable" with a way into the same form. The manual barcode field is always visible.

`src/lib/scanner/detector.ts` creates the detector. It prefers the browser's `BarcodeDetector` (Chrome on Android)
and otherwise dynamically imports the `barcode-detector` ponyfill, whose zxing-wasm decoder is a separate chunk
plus a 0.9 MB `.wasm` asset that no route imports statically, so it never loads with Today. The wasm is bundled
(`zxing-wasm` is a direct dependency, pinned to the version `barcode-detector` uses, loaded through `?url`) instead
of fetched from the ponyfill's default CDN. The service worker precaches build files but filters out `.wasm`, so the
wasm is fetched on the first scan and then served by the browser's HTTP cache (the file is hashed and immutable).
Scanning needs a connection, because the lookup is a server command. To check a build, walk the
static `imports` of every entry in `.svelte-kit/output/client/.vite/manifest.json` and confirm that the zxing
chunks are not among them. e2e replaces `getUserMedia` and `BarcodeDetector` in the page (`e2e/scan.e2e.ts`).

### Rate limits

| Binding               | Namespace | Limit    | Counts                                                     |
| --------------------- | --------- | -------- | ---------------------------------------------------------- |
| `AUTH_LIMITER`        | 1001      | 10 a min | credential POSTs per `cf-connecting-ip` (see request flow) |
| `OFF_PRODUCT_LIMITER` | 1002      | 12 a min | outgoing OFF product reads, one shared key (OFF allows 15) |
| `OFF_SEARCH_LIMITER`  | 1003      | 8 a min  | outgoing OFF searches, one shared key (OFF allows 10)      |

All three count per Cloudflare location and are eventually consistent, so the caps are approximate. The OFF ones
are shared by the whole Worker, because OFF limits our egress, not our user. e2e keeps to two OFF searches per
browser project for that reason.

### BLV generics migration

`scripts/import-blv.ts` (`pnpm blv:import [--dir data/blv] [--out-dir drizzle] [--chunk-bytes 60000]`) reads the
English, German and French BLV Swiss Food Composition Database xlsx files (downloaded by hand from naehrwertdaten.ch
into the gitignored `data/blv/`) and writes one
`INSERT ... ON CONFLICT(source, source_ref) DO UPDATE` per food, skipping rows the user edited. The statements are
split over several migrations of about 60 KB each, `drizzle/0003_blv_foods_01.sql` to `0017_blv_foods_15.sql`
(version 7.1), because `wrangler d1 migrations apply --remote` sends a file as one request and D1 limits that to
about 100 KB. Each needs its own journal entry and snapshot, so the script fills existing empty custom migrations
(`pnpm drizzle-kit generate --custom --name blv_foods_NN`) and, when their number does not match, stops and prints
the commands. The migrations are committed and applied by the normal migration step. A new BLV version means
re-running the script, which produces new migrations. `scripts/migrations.spec.ts` fails if any migration file
grows past 80 KB. Only foods with kcal, protein, carbs and fat in range are imported; attribution is in Settings.

## Recipes

Recipes are templates: ingredients name library foods, and nutrition is computed from the current foods whenever a
recipe is read. Editing a food changes recipe totals and future batches, never a logged entry. Batches and log
entries are the snapshots.

```
/recipes, /recipes/[id]  page load (+page.server.ts) -> listRecipes / getRecipe (src/lib/server/recipes/repo.ts)
RecipeForm               -> saveRecipe / archiveRecipe / restoreRecipe (recipes.remote.ts, shared schema in
                            src/lib/schemas/recipe.ts) -> saveRecipeResult -> repo -> D1
                         -> await invalidateAll() -> the page loads run again
```

- A save sends only food id, amount and unit per line. The repository reads every food, checks that the unit fits
  (g or ml must match the food's basis, a serving needs a serving size) and computes `grams`; nothing is written until
  every line passed. `recipe_ingredients` keeps `amount` and `unit` as entered next to `grams`, so "2 servings"
  stays "2 servings".
- A serving line follows the food's current serving size at read time; when the food has none any more, the grams
  stored at the last save stand. `recipeDraft` carries those grams into the editor so its totals match the list.
- A save is one `db.batch`: the recipe row (insert or update), the delete of the old lines and the inserts of the new
  ones. D1 binds at most 100 values per statement and a line binds 7, so the lines are inserted 14 rows per statement
  (50 ingredients are four inserts). A failed batch leaves the old recipe intact.
- The repository throws typed errors with user facing messages and no HTTP knowledge. `saveRecipeResult` turns a
  refused line into `{ ok: false, reason, message, index }` for the form to mark and a missing recipe into a 404.
- Recipes are archived, never deleted (batches reference them); `archivedAt` hides them from the list, and Undo
  restores. The editor guards unsaved changes with `UnsavedGuard` (`src/lib/stores/unsaved.svelte.ts`).
- The ingredient list (`IngredientList`, shared with batches) and its add sheet reuse `FoodSearch` and
  `AmountStep`; `/design` shows each part.

## Batches

A batch is one cooking session, from a recipe or one off. Its ingredients are snapshots: `batch_ingredients` keeps
the food's values per 100 at the time, and the batch totals are the sum of them. Editing a food or a recipe never
changes a batch, and editing a batch never changes a log entry (entries hold their own snapshot).

```
/recipes                 page load -> activeBatches (auto finish), listRecipes, finishedBatches
/recipes/batches/new     page load -> listContainers, and with ?recipe=<id> draftFromRecipe + getRecipe (404 if unknown)
/recipes/batches/[id]    page load -> getBatch, listContainers (404 if unknown)
BatchForm                -> saveBatch / finishBatch / reopenBatch / deleteBatch / saveContainer (batches.remote.ts,
                            shared schema in src/lib/schemas/batch.ts) -> saveBatchResult -> repo -> D1
                         -> await invalidateAll() -> the page loads run again
```

- A save sends `{ id?, foodId, amount, unit }` per line. A line with an id is an existing line of that batch: it keeps
  its per 100 snapshot and takes the new amount and unit; a line without one is snapshotted from its food at save
  time; lines left out are removed. `batchDraft` gives the editor each line's id, its own name and values
  (`snapshot`) and its serving weight (`grams / amount` of a serving line), so `IngredientList` prices the line as
  the server will and keeps the id through reorder, amount edits and remove with Undo.
- The cooked weight is the net weight. `WeightField` takes a container (none or a saved one) and the weight on the
  scale and shows the net (`netWeight`); the batch stores only the net, so deleting or changing a container never
  changes a batch. A weight at or below the tare, or over the limit, keeps Save off. Containers are made inline
  (`ContainerForm`, saved at once by `saveContainer`) or renamed, re-tared and deleted in Settings.
- The batch page header shows portions left (clamped at 0), per portion and, with a cooked weight, per 100 g. Actions:
  Log (`addSheet.openBatch`, logs on today from a page without a day), Finish or Reopen, and Delete, which is off with
  the reason while the batch has live log entries (the repository refuses it too).
- Batches stay active until finished. `activeBatches` finishes those without activity for 7 days (created, edited,
  or a live entry logged) in the same request; Reopen counts as activity. It runs wherever active batches load: the
  Recipes tab, Today and the day pages, and `loadSuggestions`. The finishing UPDATE itself requires `created_at`,
  `updated_at` and the latest live entry to be before the cutoff, so activity landing after the read keeps a batch
  active. The Recipes tab lists active batches, the
  recipes, and a collapsed Finished section (latest 20) with Reopen.
- `BatchForm` guards unsaved changes like `RecipeForm`. It is inert while a save runs, and the batch page remounts it
  when a save changed the lines' ids, so the form always starts from the stored lines.

## Weight

The Weight tab (`/weight`) holds weigh-ins, one per local calendar date, with the trend on each.

```
/weight page load -> loadWeight -> listWeights -> trendSeries (domain/trend.ts) -> series, todayKg, lastKg, trendKg, rate
WeightEntry / EditWeightSheet / WeightRow -> callbacks into the page
page -> saveWeight / deleteWeight (weight.remote.ts, shared schema src/lib/schemas/weight.ts)
     -> saveWeightOn / deleteWeightOn (server/weights/commands.ts) -> assertLogDate -> weights repo -> D1
     -> await invalidateAll() -> the page load runs again
```

- Saving is an upsert by date, so saving a date again replaces its weight (`updated_at` moves, `created_at` stays).
  Undo of a delete is the same `saveWeight` with the old values.
- The repository does not know today, so the commands check the date window themselves with `assertLogDate` (no later
  than tomorrow, else 400), like the log commands. `WeightInput` checks the calendar date and the 20 to 400 kg limits.
- The components send nothing: they take callbacks, and the page owns the write, the toast ("Logged" for a new day,
  "Updated" for a day that had a weigh-in, "Deleted ..." with a 5 second Undo) and the refresh. A failed refresh after
  a successful write is ignored; a failed write reaches the component, which keeps the value and offers Retry.
- The trend and weekly rate are pure functions (`trendSeries`, `trendOn`, `weeklyRate`), computed on every load from
  the weigh-ins; nothing derived is stored. `lastKg` is the latest weigh-in up to today (the entry's prefill); a weigh-in
  for tomorrow is kept but is not part of today's trend.
- `WeightChart` is inline SVG without a library; its range (30 days, 90 days, 1 year, All) is stored per device in
  `localStorage`. `/design` shows each component in its states.
- The history lists the newest `WEIGHT_HISTORY_PAGE` (30) weigh-ins; "Show more" adds 30 over the loaded series. The shown
  count is page state, so a refresh after a write keeps it.

## Targets

Each week has one stored target row in `weekly_targets` (keyed by its Monday). Pure math is in `src/lib/domain/`
(`tdee.ts`, `targets.ts`); the repository is `src/lib/server/targets/repo.ts`.

```
any load that needs a target -> targetFor(ctx, date) -> this week's row, computed and inserted when missing (currentTarget)
settings write (saveGoal, saveMacroRules, profile) -> recomputeCurrentWeek -> one db.batch: settings + this week's row
```

- A row is built from the days before its Monday only: the trend and rate on the Sunday before, and the adaptive
  window of 21 days ending that Sunday. Weigh-ins and log edits never change a stored row, so the row is the same
  whichever day of the week builds it. Past rows never change.
- Adaptive TDEE is used only when the gate passes (14 valid days and 6 weigh-ins); otherwise the formula TDEE is used
  and `tdee_adaptive` is null. The target moves at most 150 kcal a week from the adaptive part.
- A day shows the row of its week, else the latest earlier row, else the earliest row. Weeks the app was not opened
  get no row, and nothing is backfilled.
- The Settings page lists the stored rows (`targetsHistory`), marking formula and adaptive weeks. The Weight tab shows
  this week's target and the goal slope on the chart.
- Settings writes that recompute the week answer 400 "Log a weigh-in first" when there is no weigh-in, and write nothing.

## Directory map

| Path                           | Contents                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks.server.ts`          | Request guard (rate limit, session, access)                                                                                                                     |
| `src/routes/(app)`             | Signed in pages inside the app shell (tab bar, sidebar)                                                                                                         |
| `src/routes/(auth)`            | `/login` and `/setup` without the shell                                                                                                                         |
| `src/lib/server`               | Better Auth setup, guard rules, rate limits, Drizzle schema, `off/` client, `foods/`, `log/`, `recipes/`, `batches/`, `weights/`, `targets/`, `settings/` repos |
| `src/lib/schemas`              | Valibot schemas shared by forms and remote commands                                                                                                             |
| `src/lib/domain`               | Pure domain math: nutrition, recipes (`batch.ts`), weight trend (`trend.ts`), targets, dates, search text, barcodes, limits                                     |
| `src/lib/scanner`              | Barcode detector factory (native API or lazy zxing-wasm ponyfill)                                                                                               |
| `src/lib/components`           | `shell/` (navigation), `ui/` (design system), `log/` (add sheet, forms, day view), `recipes/` (editors, ingredients, batches), `weight/` (entry, chart)         |
| `src/lib/stores`               | Shared client state (add sheet, toasts, unsaved changes guard)                                                                                                  |
| `src/routes/(app)/*.remote.ts` | Remote commands and queries: `foods`, `log`, `recipes/recipes`, `recipes/batches`, `weight/weight`, `settings/targets`, `settings/profile`                      |
| `scripts/import-blv.ts`        | Generates the BLV foods migration                                                                                                                               |
| `src/service-worker`           | Offline app shell                                                                                                                                               |
| `drizzle/`                     | Generated SQL migrations, applied with wrangler                                                                                                                 |
| `e2e/`                         | Playwright tests (Chromium desktop, WebKit iPhone)                                                                                                              |
| `scripts/e2e-db-reset.sh`      | Fresh migrated local D1 (plus the batches of `e2e/seed.sql`) and a `BETTER_AUTH_SECRET` for e2e                                                                 |
| `e2e/off-stub.mjs`             | Local Open Food Facts stand in (port 4174) serving recorded fixtures                                                                                            |
| `wrangler.jsonc`               | Worker config: D1, rate limit bindings, custom domain, production vars                                                                                          |
| `worker-configuration.d.ts`    | Generated by `pnpm gen`; `pnpm check` and `pnpm build` fail when it is stale                                                                                    |

## Run locally

```sh
cp .env.example .env     # fill ORIGIN and BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm install
pnpm db:migrate:local    # creates the local D1 database under .wrangler/
pnpm dev                 # http://localhost:5173
```

`pnpm dev` reads `ORIGIN` and `BETTER_AUTH_SECRET` from `.env`, so it uses `http://localhost:5173` even though
`wrangler.jsonc` sets the production `ORIGIN`. `pnpm preview` and the e2e run serve the built Worker with
`wrangler dev` (with `--infer-origin-from-routes=false`, otherwise the custom domain route makes the Worker see
`kcal.avp.software` as its host), which reads `BETTER_AUTH_SECRET` from `.dev.vars` and takes `--var ORIGIN:http://localhost:4173`
from `playwright.config.ts`, which also starts `e2e/off-stub.mjs` on port 4174 and passes `--var OFF_BASE_URL` and
`--var OFF_SEARCH_URL` pointing at it. `scripts/e2e-db-reset.sh` creates `.dev.vars` from `.env`, or with a random
secret when there is no `.env` (CI, a fresh worktree). `vite build` validates the variables declared in `src/env.ts` without bundling them, so
a build without `.env` (CI) needs placeholder `ORIGIN` and `BETTER_AUTH_SECRET` in the environment; the workflow
sets them.

Tests: `pnpm test` (Vitest), `pnpm test:e2e` (Playwright, needs `pnpm e2e:install` once), `pnpm verify` runs the
whole gate.

## Migrations

1. Edit `src/lib/server/db/schema.ts` (or run `pnpm auth:schema`, then `pnpm format`, after a Better Auth change;
   the CLI reads `src/lib/server/auth.cli.ts`, which stays out of the Worker bundle).
2. `pnpm db:generate` writes a SQL file to `drizzle/`. Commit it.
3. `pnpm db:migrate:local` applies it to the local database.
4. On merge to `main`, CI builds, runs `pnpm db:migrate:remote`, then deploys. Migrations must stay compatible with
   the previous Worker version, because the migration runs before the new code ships.

D1 applies each migration file as one transaction with foreign keys on, and SQLite ignores `PRAGMA foreign_keys`
inside a transaction. When drizzle-kit rebuilds a table it writes `PRAGMA foreign_keys=OFF` and `=ON`; replace them by
hand with `PRAGMA defer_foreign_keys = on` before the rebuild (see `drizzle/0020_batches.sql`), check that the copy
names every column and every index is recreated, and extend `src/lib/server/db/migrations.spec.ts`, which applies the
migrations to a database that already holds data. The test helper (`src/lib/server/test/d1.ts`) applies a file the
way `wrangler d1 migrations apply` does: its statements in one D1 `batch`.

`drizzle/0001_single_account.sql` is hand written: a trigger on `user` that aborts a second insert (the database
level backstop for single account sign up). SQLite drops a table's triggers when the table is rebuilt, which
drizzle-kit does for some column changes. After any migration that touches `user`, re-create the trigger in that
migration; `scripts/e2e-db-reset.sh` fails the e2e run if it is missing.

## Deploy

Pushes to `main` deploy automatically (`.github/workflows/ci.yml`). Four jobs run in parallel on every pull request
and on `main`: `static` (types, lint), `unit` (Vitest), `e2e` (Playwright) and `security` (`pnpm audit --audit-level
high`, gitleaks). On `main`, `deploy` needs all four, then runs `pnpm build`, `pnpm db:migrate:remote` and
`pnpm wrangler deploy`. A branch push without a pull request runs no CI. A newer push to a pull request cancels its
older run. CodeQL (`.github/workflows/codeql.yml`) runs on each push to `main` and weekly; its alerts are under
Security > Code scanning.

`pnpm install` sets `core.hooksPath` to `.githooks`, whose `pre-push` hook runs `pnpm verify` (skip once with
`git push --no-verify`). The check jobs stop after 4 minutes, `e2e` after 8. `deploy` keeps 10 minutes, so a timeout
never lands between the remote migration and `wrangler deploy`. `unit` and `e2e` run in the
`mcr.microsoft.com/playwright` image, which ships the browsers and their system packages, so nothing is installed
with apt. Its tag and digest must match the Playwright version in `pnpm-lock.yaml`: bump them together. A CI step
in `unit` fails with that message when they drift.

Manual deploy, from a machine with `CLOUDFLARE_API_TOKEN` in `.env`:

```sh
pnpm db:migrate:remote
pnpm build && pnpm wrangler deploy
```

`wrangler.jsonc` turns off `workers.dev` and preview URLs, so the only public address is the custom domain
`kcal.avp.software`. Logs are in the Cloudflare dashboard (Workers Logs, observability is enabled).

## Secrets

| Secret                  | Where it lives                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`    | Production: Worker secret, set once with `pnpm wrangler secret put BETTER_AUTH_SECRET`. Local: `.env` and `.dev.vars` (gitignored). |
| `OFF_CONTACT_EMAIL`     | Production: Worker secret, `pnpm wrangler secret put OFF_CONTACT_EMAIL`. Local: `.env`. e2e writes a fixed value to `.dev.vars`.    |
| `CLOUDFLARE_API_TOKEN`  | Local: `.env`, read by wrangler. CI: GitHub Actions secret.                                                                         |
| `CLOUDFLARE_ACCOUNT_ID` | CI: GitHub Actions secret. Local: optional in `.env`.                                                                               |

The `ORIGIN` variable is not secret; production sets it in `wrangler.jsonc`. The deploy token needs Account
Workers Scripts: Edit, Account D1: Edit and Zone Workers Routes: Edit for `avp.software`. Never commit `.env` or
`.dev.vars`.
