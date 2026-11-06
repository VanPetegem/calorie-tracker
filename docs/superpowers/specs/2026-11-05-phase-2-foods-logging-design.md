# Phase 2: Foods, Scanner, Logging, Today

Date: 2026-11-05. Status: approved. Parent spec: `2026-11-04-calorie-tracker-design.md` (sections 3, 5, 7, 9, 10).
This document only adds what the parent spec leaves open for phase 2. Where they disagree, this one wins for
phase 2 and the parent spec is updated in the same PR.

## 1. Intent

After phase 2 the user logs every real meal: library foods, BLV generics, Open Food Facts products found by search
or barcode, custom products, and quick estimates. Logging starts on day one because phase 4's adaptive TDEE needs
21 days of intake history; every day logged now shortens the wait for adaptive targets.

Success: a known food is logged in under 10 seconds from opening the app; a scanned Lidl product is found or turned
into a custom food in under a minute and is instant on every later scan.

Non-goals (later phases): recipes and batches (phase 3), weight, onboarding, formula and adaptive targets
(phase 4), label photos and OFF contribution (phase 5), offline writes, meal slots.

Anti-goals: an OFF outage or rate limit that blocks logging of library foods; a past day's numbers changing after a
food is edited; a scan flow that loses the barcode on a miss.

## 2. Delivery

Two PRs, each passing the full gate and deployable alone (all user calls; Claude's call on the split):

- **2a Foods and logging**: schema, BLV import, OFF client and search, custom foods, add sheet (without scan),
  amount step, quick add, Today screen, manual target in Settings.
- **2b Scanner**: barcode lookup (library then OFF), camera scanner, manual EAN entry, miss flow to custom food.

## 3. Schema (2a)

Tables `foods` and `log_entries` exactly as parent spec section 5, plus:

- `foods.search_text`: lowercased, diacritics stripped concatenation of name, brand and alternate names; indexed.
  Search is `LIKE` on it (all words must match). Library size stays in the low thousands, so FTS5 is not needed.
- `foods.nutrition_basis`: `g` or `ml`. Values are always per 100 of that unit; `ml` is logged as if 1 ml = 1 g
  and the UI shows "ml". (Claude's call: avoids a density model.)
- `log_entries.unit` allows `g`, `ml`, `portion`, `serving`; `log_entries.grams` (nullable) stores the gram
  equivalent of the amount for food entries, so an edit that switches unit still scales correctly.
- `foods.edited_at` (nullable): set when the user edits an OFF or BLV food; refreshes and BLV re-imports skip
  rows where it is set.
- `log_entries.logged_at` is the real time when logging for today; for another day it is that date at the
  current local time of day, so backfilled entries sort sensibly within their day.
- `log_entries.batch_id` is a plain nullable text column now; phase 3 adds the `batches` table and the reference.
- `log_entries.food_id` references `foods` with no cascade; foods are archived, never deleted, once logged.
- Indexes: `log_entries(date)`, `log_entries(food_id, logged_at)`, unique `foods(barcode)`, unique
  `foods(source, source_ref)`.
- `settings` single row with only what phase 2 needs: `timezone` (default `Europe/Zurich`), `manual_target_kcal`
  (nullable), `manual_weight_kg` (nullable). Phase 4 adds the remaining columns from the parent spec. Theme stays
  where phase 1 put it.

`containers`, `recipes`, `batches`, `weights`, `weekly_targets` are not created in phase 2.

## 4. Food sources

**BLV generics.** A script `scripts/import-blv.ts` reads the BLV xlsx (downloaded by hand from
naehrwertdaten.ch, not committed) and writes a hand written migration `drizzle/NNNN_blv_foods.sql` of
`INSERT ... ON CONFLICT(source, source_ref) DO UPDATE` rows, which is committed and applied by the normal migration
step. Re-running the script for a new BLV version produces a new migration. Name: English if the file has it,
otherwise German; German and French names go into `search_text` so "Poulet", "Huhn" and "chicken" all match.
Only foods with kcal, protein, carbs and fat are imported; fiber may be null. Attribution text goes into Settings.

**Open Food Facts.** Server only module `src/lib/server/off/` with the User-Agent from the parent spec
(`OFF_CONTACT_EMAIL` declared in `src/env.ts`). Requests ask only for needed fields. A second Workers Rate Limiting
binding `OFF_LIMITER` caps outgoing calls below OFF's limits (12 product reads, 8 searches a minute); when the cap
or OFF fails, the caller gets a typed "unavailable" result, never an exception that breaks the sheet. Every
product returned (by barcode or by a search result the user picks) is upserted into `foods` with `source = off`,
`source_ref` = barcode, `fetched_at`; refreshed in the background of a read when older than 180 days. Products
lacking per 100 g values follow parent spec section 3 (convert from serving, otherwise miss flow prefilled).
The builder verifies which OFF endpoint gives usable full text search today and records it in
`docs/decisions.md`.

**Custom foods.** Created from the add sheet ("New food") or the miss flow. Any food (custom, OFF, BLV) is
editable from the amount step's menu; editing an OFF or BLV food sets `edited_at` so refreshes keep the fix.
Editing never touches past log entries.

**Collision and validation rules.** The library wins: an OFF result whose barcode already exists in `foods` uses
the existing row and is not overwritten. OFF values outside the parent spec limits (kcal over 900 per 100,
macros over 100) are not stored; that product goes through the miss flow prefilled with what is plausible.
Barcode lookup includes archived foods and logging one unarchives it.

**BLV file and licence.** The builder downloads the current xlsx from naehrwertdaten.ch into a gitignored
folder. Committing the derived rows is allowed under the BLV terms (free use with source reference); the
migration header and Settings attribution name the source and version.

**OFF in tests and deploy.** `OFF_BASE_URL` (var, defaults to the real API) lets e2e point the Worker at a local
fixture server, so no test touches the network. `OFF_CONTACT_EMAIL` is a Worker secret listed in
`secrets.required`; the user sets it with `wrangler secret put` before 2a merges. `OFF_LIMITER` uses
`namespace_id` 1002.

## 5. Search and the add sheet (2a)

Order inside the sheet, top to bottom: search field, quick actions (Scan in 2b, Quick add, New food), recents,
frequents. Active batches join the top in phase 3.

- **Recents**: the 10 foods most recently logged (distinct), with the last used amount and unit.
- **Frequents**: the 10 foods logged most often in the last 30 days, minus those already in recents.
- **Search** while typing (debounced 200 ms) covers the library only: custom, cached OFF, BLV, ranked by prefix
  match, then logged count. OFF search runs only when the user submits (Enter or a "Search Open Food Facts" row),
  so typing never burns the OFF quota. OFF results show brand and kcal per 100 and are stored on pick.
- ⌘K / Ctrl+K opens the sheet on desktop.

**Amount step.** Unit switch g (or ml) / serving (only if `serving_g`). Default amount is the last one used for that
food, otherwise one serving, otherwise 100 g. Live kcal and macro preview. "Log" writes the entry with a snapshot
of kcal, protein, carbs, fat, fiber for that amount. The log date is the day being viewed.

**Quick add.** Label (optional), kcal (required), protein, carbs, fat (optional, 0 if empty).

## 6. Today (2a)

- Routes: `/` is today in the settings timezone; `/day/[date]` any other day. Prev/next arrows and horizontal
  swipe. No future days beyond tomorrow.
- **Hero**: with no manual target, kcal eaten and grams of protein, carbs, fat eaten (no bars toward a fake goal).
  With a manual target, remaining kcal, a kcal progress bar and three MacroBars. Over target shows a positive
  "over by" state, not a warning colour (weight gain is the goal).
- **Entries**: chronological. Tap opens the amount step to edit; the snapshot scales by new grams / old grams
  (unit switches convert through the stored gram equivalent), never re-read from the food. Quick entries open
  the quick add form prefilled instead. Delete via menu or swipe: the row is deleted on the server at once and the toast's
  Undo re-inserts the same row (same id). (Claude's call: nothing is lost if the app closes during the 5 s.)
- Page data (entries, totals, recents, frequents) comes from the page `load`, so the service worker's cached
  navigation shows the last loaded day and recents offline. Writes use remote `command`s with shared Valibot
  schemas; failures revert the optimistic change and toast "Retry".

## 7. Manual target (2a)

Settings section "Daily target (temporary)": kcal and body weight, saved together (both or neither). Macros come from a pure domain function
`macroTargets(kcal, weightKg, rules)` in `src/lib/domain/` using parent spec section 6.8 (protein 1.8 g/kg, fat
max(25 % kcal / 9, 0.6 g/kg), carbs remainder, warning if floored). Phase 4 reuses the function and replaces the
manual inputs with `weekly_targets`. Copy explains it is temporary until weight tracking arrives.

## 8. Scanner (2b)

- "Scan" opens a full screen camera view after the tap (`barcode-detector` with zxing-wasm, formats ean_13,
  ean_8, upc_a, upc_e). Torch toggle when supported, manual EAN entry always visible, haptic on success where
  supported. Camera denied or unsupported: explanation plus manual entry.
- Normalize codes before lookup (UPC-A to EAN-13 with leading zero, validate check digit). Lookup: `foods` by
  barcode, then OFF. A hit goes straight to the amount step.
- **Miss**: the custom food sheet opens with the barcode prefilled and any partial OFF values filled in; saving
  creates the food and continues to the amount step. Next scan finds it in the library.
- OFF unavailable: "Product database unreachable" with manual entry; the barcode stays prefilled.
- Tests mock the camera; zxing-wasm is loaded lazily so it never weighs on Today.

## 9. New UI components

Per AGENTS.md each gets a `/design` section with all states: Select (if used), DateSwitcher, FoodRow, AmountStep
preview, Dialog variant of Sheet if needed, Scanner overlay (static states). The builder decides exact component
boundaries.

## 10. Tests

Domain unit tests: amount to snapshot math (g, ml, serving), snapshot scaling on edit, macro targets, barcode
normalization and check digit, search text normalization, serving to per 100 g conversion. Server tests (Miniflare
D1): food repository upsert rules, recents and frequents queries, OFF client against recorded fixtures (hit,
miss, per serving only, 429, timeout). E2E on WebKit iPhone and desktop Chromium: search a BLV food and log
200 g; quick add; edit and delete with undo; date switching; manual target changes the hero; (2b) scan hit with
mocked camera, scan miss to custom food then rescan hits library.

## 11. Left to the builder

Component boundaries, remote function file layout, exact ranking weights, the BLV column mapping, the OFF search
endpoint (verified and recorded), swipe implementation details, copy wording within the design system's voice.
