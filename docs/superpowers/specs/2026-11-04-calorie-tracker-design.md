# Calorie Tracker: Design Spec

Date: 2026-11-04. Status: approved.

## 1. Intent

A personal calorie tracker for one user whose only goal is healthy weight gain (lean bulk), used daily
for months and years. It replaces ad-filled, clunky trackers. Success means:

- Logging a meal prep portion takes seconds: "1.5 portions" or "200 g" of a cooked batch fills in
  kcal and macros automatically.
- Scanning a Swiss supermarket barcode (mainly Lidl, also Aldi Suisse and Migros) usually finds the
  product. A miss is resolved once, quickly, and never again.
- Daily calorie and macro targets are evidence based and adapt to the real weight trend.
- The UI is consistent, fast and pleasant on iPhone (installed PWA) and Mac.

Out of scope: meal slots (the log is chronological), micronutrients beyond fiber, exercise logging,
social features, multiple users, full offline logging.

## 2. Platform and stack

| Concern  | Decision |
| -------- | -------- |
| App      | SvelteKit 3.1, Svelte 5 (runes), Vite 8, TypeScript 6 strict, Node >= 22.17 |
| Styling  | Tailwind CSS 4 with semantic tokens in `@theme` |
| Data     | Cloudflare D1 (SQLite) via Drizzle ORM; migrations with drizzle-kit, applied with wrangler |
| Hosting  | Cloudflare Workers (adapter-cloudflare 8, static assets), free plan |
| Domain   | `kcal.avp.software` (custom domain on the Worker) |
| Auth     | Better Auth with passkey plugin, 1 year sessions, sign up closed once the account exists |
| Scanner  | `barcode-detector` (zxing-wasm polyfill), formats ean_13, ean_8, upc_a, upc_e |
| Icons    | Lucide (`@lucide/svelte`) |
| Tests    | Vitest (domain + server), Playwright (WebKit iPhone profile + desktop Chromium) |
| CI/CD    | GitHub Actions: lint, typecheck, unit, e2e; deploy on `main` with wrangler |
| Backups  | D1 Time Travel plus a weekly cron Worker export of all tables as JSON to R2 |
| Optional | Workers AI vision model (free tier) for nutrition label photos |

Why Cloudflare: the free plan (100k requests/day, 5 GB D1) is roughly 1000x the needs of one user, so
the overloaded Hetzner box is not used. Why Better Auth instead of Cloudflare Access: Access logs in on
an external domain, which iOS opens outside an installed PWA and which causes lost sessions.

Offline: the service worker caches the app shell, the last loaded day, and recent foods so the app opens
instantly without signal. Writes require a connection; a failed write shows a clear retry state and is
never silently dropped.

## 3. Food data

Lookup order for search: own library (custom + cached), BLV generics, then Open Food Facts.
Lookup order for a barcode: `foods` table by barcode, then OFF live.

| Source | Use | Licence |
| ------ | --- | ------- |
| Open Food Facts (OFF) v3 API | Branded products by barcode, text search via v2 search | ODbL / DbCL; attribution in Settings |
| Swiss Food Composition Database (BLV, naehrwertdaten.ch v7.1) | ~1,250 generic foods (raw chicken, rice, oats), imported once from xlsx via a script | Free with source reference |
| Own entries | Products not in OFF | Own |

foodrepo.org was checked on 2026-11-04: it only redirects to Open Food Facts, which absorbed its data.

OFF rules: User-Agent `kcal-avp/<version> (<contact email from env>)`; limits are 15 product reads and
10 searches per minute per IP, so all OFF calls go through the server, request only needed fields, and
every hit is stored in `foods` permanently (refresh when older than 180 days on access).

Lidl coverage: OFF holds about 9,700 products tagged Lidl and about 4,000 Milbona products worldwide,
but only 485 tagged as sold in Switzerland. Barcode lookup is global, so shared EANs still match. Test on 2026-11-04 with 5 real Lidl Switzerland
products (photos decoded with zxing-wasm): 5 of 5 found with full macros, but only 1 tagged Switzerland.
Therefore lookups must never filter by country.

Barcode miss flow: a bottom sheet opens with the barcode prefilled. The user enters name and kcal,
protein, carbs, fat (fiber optional) per 100 g, optionally a serving size. Phase 5 adds "photograph
label": Workers AI extracts the per 100 g values for confirmation. An optional toggle contributes the
product to OFF.

Nutrition is stored per 100 g as real numbers. A food with only per serving data from OFF is accepted
if serving size in grams is known (converted), otherwise it goes through the miss flow with values
prefilled where available.

## 4. Meal prep model

- **Recipe**: a template. Name, default portion count, notes, ingredients as (food, amount and unit: g, ml or serving, as entered; the gram equivalent is stored).
- **Batch**: one cooking session. "Cook batch" on a recipe creates a batch prefilled from the recipe;
  the user can change amounts, add or remove ingredients, set the portion count, and optionally enter
  the total cooked weight (with a saved container tare). Ingredient nutrition is snapshotted into the
  batch, so later edits to foods or the recipe never change it.
- **Logging a batch**: by portions (any decimal, e.g. 1.5) or, if cooked weight is known, by grams.
  - per portion = batch totals / portions
  - per gram = batch totals / cooked weight
- Batches show "7 of 10 portions left" (portions logged so far versus portion count) and appear at the
  top of the add sheet until finished. A batch stays active at 0 portions left; finishing is the user's call.
  Auto finish: a batch with no activity (created, edited or logged) for 7 days is finished the next time active
  batches are loaded, and can be reopened. Logging more than the remaining portions is allowed (the counter shows
  0 left), since portion sizes are rarely exact.
- A batch without a recipe is allowed ("one-off batch") for meals cooked once.

## 5. Data model (D1)

All ids are text (UUIDv7). Times are UTC ISO strings; `date` columns are the user's local calendar date
(`YYYY-MM-DD`, timezone from settings, default `Europe/Zurich`).

| Table | Columns (main) |
| ----- | -------------- |
| Better Auth: `user`, `session`, `account`, `verification`, `passkey` | as generated by Better Auth |
| `foods` | id, source (`custom` / `blv` / `off`), barcode (unique, nullable), name, brand, nutrition_basis (`g` / `ml`), kcal, protein, carbs, fat, fiber (per 100 of the basis), serving_g, source_ref (unique with source), search_text, fetched_at, edited_at, archived_at, created_at, updated_at |
| `recipes` | id, name, default_portions, notes, archived_at, created_at, updated_at |
| `recipe_ingredients` | id, recipe_id, food_id, amount, unit (`g` / `ml` / `serving`, as entered), grams (gram equivalent), position |
| `containers` | id, name, tare_g (saved pot/box weights), created_at |
| `batches` | id, recipe_id (nullable), name, cooked_on (date), portions, cooked_weight_g (nullable, net of the container), kcal, protein, carbs, fat, fiber (totals), finished_at, created_at, updated_at |
| `batch_ingredients` | id, batch_id, food_id (nullable), name, amount, unit (`g` / `ml` / `serving`, as entered), grams (gram equivalent), kcal, protein, carbs, fat, fiber (per 100 g snapshot), position |
| `log_entries` | id, date, logged_at, kind (`food` / `batch` / `quick`), food_id, batch_id, amount, unit (`g` / `ml` / `portion` / `serving`), grams (nullable gram equivalent), label, kcal, protein, carbs, fat, fiber (snapshot of this entry), deleted_at (soft delete for Undo) |
| `weights` | date (pk), kg, created_at, updated_at |
| `settings` | single row: sex, birth_date, height_cm, activity_level, goal_rate_pct, protein_g_per_kg, fat_pct, energy_density_kcal_per_kg, timezone, theme. Phase 2 has only timezone, manual_target_kcal and manual_weight_kg; phase 4 adds the rest |
| `weekly_targets` | week_start (pk, Monday), tdee_formula, tdee_adaptive (nullable), tdee_used, target_kcal, protein_g, carbs_g, fat_g, trend_kg, rate_kg_per_week, data_days |

`quick` entries are manual kcal and macros without a food (e.g. restaurant estimate).

## 6. Calculations

All in `src/lib/domain/`, pure functions, no I/O, fully unit tested. Constants live in one file.

1. **BMR** (Mifflin St Jeor): `10W + 6.25H - 5A + 5` (male) or `- 161` (female). W kg, H cm, A years.
2. **Formula TDEE** = BMR x PAL. Levels: 1.2, 1.375, 1.55, 1.725, 1.9. Onboarding copy recommends
   choosing one level lower than it feels.
3. **Weight trend** (exponential moving average): `T_t = T_(t-1) + a (w_t - T_(t-1))`, a = 0.1,
   T_0 = mean of first up to 3 weigh-ins. For a gap of g days, `a_eff = 1 - 0.9^g`.
   Weekly rate = 7 x (T_today - T_(today-14)) / 14; shown in kg and percent of trend weight.
4. **Goal rate**: presets 0.25, 0.35 (default), 0.5 percent bodyweight per week (Iraki et al. 2019).
   `goal_kg_per_week = trend_kg x pct / 100`.
5. **Energy density** rho = 5000 kcal/kg (mixed lean and fat gain; configurable, Hall 2011 basis).
6. **Adaptive TDEE**, recomputed when a week starts (on first app load of the week, server side):
   - Window: last 21 days (excluding today). Valid days: intake logged and at least 50 percent of the
     median logged intake of the window.
   - Gate: at least 14 valid days and at least 6 weigh-ins in the window; otherwise use formula TDEE.
   - `tdee_obs = mean_valid_intake - (T_end - T_start) x rho / window_days`.
   - Blend: `(n x tdee_obs + 7 x tdee_formula) / (n + 7)`, n = valid days.
   - Smooth: `0.7 x previous_tdee_used + 0.3 x blended`, then clamp change to +/-150 kcal per week.
7. **Target kcal** = `tdee_used + goal_kg_per_week x rho / 7`, clamped to 1.05 to 1.20 x tdee_used,
   rounded to 10 kcal.
8. **Macros**: protein = 1.8 g/kg trend weight (Morton et al. 2018), fat = max(25 percent of kcal / 9,
   0.6 g/kg), carbs = remainder / 4 (floored at 0, with a warning if hit).

Sources: Mifflin 1990 (PMID 2305711), Iraki et al. 2019 (PMC6680710), Hall 2011 (PMID 21872750),
Morton et al. 2018 (PMID 28698222), MacroFactor expenditure method, The Hacker's Diet trend.

## 7. Screens

Navigation: bottom tab bar on mobile (Today, Recipes, Weight, Settings) with a center add button;
left sidebar on desktop (>= 1024 px). Content max width 640 px on desktop, two columns on Today.

- **Today**: date switcher (swipe or arrows), remaining kcal as the hero number, kcal progress, three
  macro bars, chronological entries (tap to edit amount, swipe or menu to delete with 5 s undo).
- **Add sheet** (bottom sheet on mobile, dialog on desktop, ⌘K on Mac): active batches first, then
  recents and frequents, search field across all sources, scan button, quick add. Choosing an item
  opens an amount step with unit switch (g / portion / serving) and live kcal and macro preview.
- **Scanner**: full screen camera, started from a user tap, torch toggle if supported, manual EAN entry
  fallback, haptic feedback (where supported) and immediate result sheet.
- **Recipes**: list with kcal per portion; editor (ingredients with amount and unit, default portions); "Cook
  batch" flow; batch detail with remaining portions and finish action.
- **Weight**: one tap entry for today (prefilled with last value, stepper +/-0.1), trend chart
  (raw dots, trend line, goal slope), weekly rate, history list with edit.
- **Settings**: profile, goal rate, macro rules, energy density (advanced), targets history, theme,
  containers, passkeys, data export (JSON), attributions (OFF, BLV).
- **Onboarding**: first run after passkey registration: sex, birth date, height, weight, activity,
  goal rate; shows initial target with a short explanation.

## 8. Design system

Based on the user's Design System Blueprint (PDF, kept local, not committed: third party content) and
designmotionhq patterns. Documented on a `/design` route that renders every component in every state.

- **Color**: semantic tokens only (`bg`, `surface`, `surface-raised`, `border`, `text`, `text-muted`,
  `brand`, `success`, `warning`, `danger`, `protein`, `carbs`, `fat`). Dark theme from the PDF (bg
  `#09090B`, surface `#131316`, border `#27272A`, text `#FAFAFA`, muted `#A1A1AA`, brand `#6366F1`),
  plus a light theme; system preference by default, override in Settings. All text pairs meet WCAG AA.
- **Type**: system font stack (SF Pro on Apple devices), scale 11/13/15/18/22/28/36/48 px with the
  PDF weights and line heights; `font-variant-numeric: tabular-nums` for all numbers.
- **Spacing**: 4 px base (1, 2, 3, 4, 6, 8, 12, 16 steps). Touch targets at least 44 x 44 px.
- **Radius and elevation**: small set of radii (6, 10, 16, full) and three shadow levels.
- **Icons**: Lucide, 2 px stroke, 20 px default, 24 px navigation.
- **Motion**: durations 100/200/300 ms; ease-out to enter, ease-in to exit, ease-in-out to move;
  everything respects `prefers-reduced-motion`.
- **Components**: Button (primary, secondary, ghost, destructive; sm/md/lg; all states), IconButton,
  Input, NumberInput (decimal keypad, unit suffix), Select, SegmentedControl, Card, Badge, ProgressBar,
  MacroBar, BottomSheet, Dialog, Toast (with undo), EmptyState, Skeleton, ListItem, TabBar, Sidebar,
  Chart (weight).
- **Patterns applied**: optimistic UI with rollback, undo instead of confirm for deletes, validation on
  blur, explained disabled states, designed empty/loading/error states, response under 400 ms for
  local interactions, safe area insets for iPhone, no hover-only affordances.

## 9. Error handling

- OFF unavailable or rate limited: show "Product database unreachable", offer manual entry; never
  block logging of library foods or batches.
- Write failure: optimistic item reverts and a toast offers retry.
- Camera denied or unsupported: explain and show manual EAN entry.
- Server validates all inputs with Valibot schemas shared with forms; numeric limits (e.g. kcal per
  100 g between 0 and 900, macros per 100 g between 0 and 100).

## 10. Testing

- Unit (Vitest): every domain function with literature based fixtures (BMR examples, EMA with gaps,
  adaptive TDEE gate and clamps, batch per portion and per gram math, unit conversions).
- Server (Vitest with D1 via Miniflare): repositories and endpoints, OFF client with recorded fixtures.
- E2E (Playwright): add food, scan miss to custom product (camera mocked), cook batch and log 200 g,
  log weight, target recalculation; run on WebKit iPhone and desktop Chromium.
- Verification gate for every change: `pnpm check && pnpm lint && pnpm test && pnpm test:e2e`.

## 11. Repository

Public GitHub repo `calorie-tracker`. `.env` is gitignored (secrets: Better Auth secret, Cloudflare
token, OFF contact), `.env.example` documents keys. `AGENTS.md` is the single file for agent
instructions (no `CLAUDE.md`). `docs/` contains this spec, `docs/decisions.md` (living decision log); `docs/architecture.md` is added in phase 1.

## 12. Build phases

1. Scaffold, design system tokens and components, auth, deploy pipeline.
2. Foods (BLV import, OFF client, custom foods), scanner, logging, Today screen.
3. Recipes and batches.
4. Weight tracking, targets, adaptive TDEE, onboarding.
5. Nutrition label photo fallback, OFF contribution, weekly R2 backup.

