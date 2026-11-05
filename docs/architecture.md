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
- `/api/*` and anything that is not a same origin GET is never touched.
- Caches are named `kcal-<version>`; old versions are deleted on activate.
- Sign out (`src/lib/auth-client.ts`) deletes every `kcal-*` cache so pages rendered for the session cannot be
  reopened afterwards.

## Foods and logging

Data flow of the log screens:

```
page load (src/routes/(app)/+page.server.ts, day/[date]) -> loadDay -> entries, totals, target, recents, frequents
add sheet / forms / edit sheet -> remote command (foods.remote.ts, log.remote.ts, settings/target.remote.ts)
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
- Today's hero shows eaten kcal and macros; with a manual target (settings columns `manual_target_kcal`,
  `manual_weight_kg`, set in Settings) it shows remaining kcal and macro bars from `macroTargets`.

### Open Food Facts

All OFF calls go through the server (`src/lib/server/off/client.ts`) with the User-Agent
`kcal-avp/<version> (<OFF_CONTACT_EMAIL>)`, a 5 second timeout and no exceptions: the client returns
`{ ok: false, reason: 'rate_limited' | 'unavailable' }`. Product reads use `OFF_BASE_URL` (v2 API); text search uses
`OFF_SEARCH_URL` (search-a-licious). Results that pass validation are upserted into `foods` (`source = off`,
`fetched_at`). The library wins when a barcode already exists: `resolveOffPick` returns that food without calling
OFF. `upsertOffFood` can refresh an unedited OFF food older than 180 days, but in phase 2a nothing reaches that
branch, because the library lookup comes first; the refresh arrives with the barcode lookup in 2b. Typing searches
the library only; OFF is searched when the person submits.

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

## Directory map

| Path                           | Contents                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `src/hooks.server.ts`          | Request guard (rate limit, session, access)                                                                     |
| `src/routes/(app)`             | Signed in pages inside the app shell (tab bar, sidebar)                                                         |
| `src/routes/(auth)`            | `/login` and `/setup` without the shell                                                                         |
| `src/lib/server`               | Better Auth setup, guard rules, rate limits, Drizzle schema, `off/` client, `foods/`, `log/`, `settings/` repos |
| `src/lib/schemas`              | Valibot schemas shared by forms and remote commands                                                             |
| `src/lib/domain`               | Pure domain math: nutrition, targets, dates, search text, limits                                                |
| `src/lib/components`           | `shell/` (navigation), `ui/` (design system) and `log/` (add sheet, forms, day view)                            |
| `src/lib/stores`               | Shared client state (add sheet, toasts)                                                                         |
| `src/routes/(app)/*.remote.ts` | Remote commands and queries: `foods`, `log`, `settings/target`                                                  |
| `scripts/import-blv.ts`        | Generates the BLV foods migration                                                                               |
| `src/service-worker`           | Offline app shell                                                                                               |
| `drizzle/`                     | Generated SQL migrations, applied with wrangler                                                                 |
| `e2e/`                         | Playwright tests (Chromium desktop, WebKit iPhone)                                                              |
| `scripts/e2e-db-reset.sh`      | Fresh migrated local D1 and a `BETTER_AUTH_SECRET` for e2e                                                      |
| `e2e/off-stub.mjs`             | Local Open Food Facts stand in (port 4174) serving recorded fixtures                                            |
| `wrangler.jsonc`               | Worker config: D1, rate limit bindings, custom domain, production vars                                          |
| `worker-configuration.d.ts`    | Generated by `pnpm gen`; `pnpm check` and `pnpm build` fail when it is stale                                    |

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
`--var OFF_SEARCH_URL` pointing at it. `scripts/e2e-db-reset.sh` creates `.dev.vars` from `.env` locally, or with a random
secret when `CI` is set. `vite build` validates the variables declared in `src/env.ts` without bundling them, so
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

`drizzle/0001_single_account.sql` is hand written: a trigger on `user` that aborts a second insert (the database
level backstop for single account sign up). SQLite drops a table's triggers when the table is rebuilt, which
drizzle-kit does for some column changes. After any migration that touches `user`, re-create the trigger in that
migration; `scripts/e2e-db-reset.sh` fails the e2e run if it is missing.

## Deploy

Pushes to `main` deploy automatically (`.github/workflows/ci.yml`): the `verify` job runs the full gate, then the
`deploy` job runs `pnpm build`, `pnpm db:migrate:remote` and `pnpm wrangler deploy`. Pull requests and other
branches only run `verify`.

`verify` stops after 5 minutes: run `pnpm verify` locally before pushing, CI only confirms it. `deploy` keeps 10
minutes, so a timeout never lands between the remote migration and `wrangler deploy`. `verify` runs in the
`mcr.microsoft.com/playwright` image, which ships the browsers and their system packages, so nothing is installed
with apt. Its tag and digest must match the Playwright version in `pnpm-lock.yaml`: bump them together. A CI step
fails with that message when they drift.

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
