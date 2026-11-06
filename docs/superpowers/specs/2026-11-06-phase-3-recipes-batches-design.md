# Phase 3: Recipes and Batches

Date: 2026-11-06. Status: approved. Parent spec: `2026-11-04-calorie-tracker-design.md` (sections 4, 5, 7, 10).
This document only adds what the parent spec leaves open for phase 3. Where they disagree, this one wins for
phase 3 and the parent spec is updated in the same PR.

## 1. Intent

After phase 3 meal prep is logged in seconds: cook a batch from a recipe (or one-off), then log "1.5 portions" or
"200 g" of it from the add sheet, with kcal and macros filled in.

Success: logging a portion of an active batch takes under 5 seconds from opening the app; cooking a batch from a
saved recipe takes under a minute including weighing.

Non-goals: nested recipes (a recipe as an ingredient), recipe import from URLs, per ingredient cooking yield
factors, sharing, recipe photos, offline writes.

Anti-goals: a past day's numbers changing after a recipe, batch or food is edited; a batch disappearing while food
is still in the fridge; losing an unsaved recipe or batch edit by navigating away without a warning.

## 2. Delivery

Two PRs, each passing the full gate and deployable alone (user's call):

- **3a Recipes**: `recipes`, `recipe_ingredients`; Recipes tab list; recipe editor page with the shared
  ingredient list; live totals and kcal per portion.
- **3b Batches**: `containers`, `batches`, `batch_ingredients`, `log_entries.batch_id` reference; Cook batch and
  one-off batch; batch page; containers (inline and in Settings); batches in the add sheet; logging and editing
  batch entries; auto finish.

## 3. Schema

All ids UUIDv7 text, times UTC ISO, `date` columns local calendar dates, as in the parent spec.

**3a**

- `recipes`: id, name, default_portions (real, > 0), notes (nullable), archived_at, created_at, updated_at.
- `recipe_ingredients`: id, recipe_id (references `recipes`, cascade delete), food_id (references `foods`, no
  cascade), amount, unit (`g` / `ml` / `serving`), grams (gram equivalent), position. Index on
  `(recipe_id, position)`. Parent spec listed only grams; amount and unit are added so "2 eggs" stays "2 servings"
  in the editor (user's call).

**3b**

- `containers`: id, name, tare_g (> 0), created_at. Hard deleted: batches store the net weight, not the container.
- `batches`: id, recipe_id (nullable, references `recipes`), name, cooked_on (date), portions (real, > 0),
  cooked_weight_g (nullable, net), kcal, protein, carbs, fat, fiber (totals), finished_at, created_at, updated_at.
  Index on `finished_at`.
- `batch_ingredients`: id, batch_id (references `batches`, cascade delete), food_id (nullable, references
  `foods`), name, amount, unit, grams, kcal, protein, carbs, fat, fiber (per 100 snapshot), position.
- `log_entries.batch_id` becomes a reference to `batches`. SQLite needs a table rebuild for this; the generated
  migration is checked by a server test that applies all migrations to a database holding log entries and confirms
  every row survives. If the rebuild is unsafe on D1, the builder keeps the plain column, enforces the link in the
  repo and records why in `docs/decisions.md`.

## 4. Domain (`src/lib/domain/batch.ts`, pure, unit tested)

- `ingredientNutrients(per100, grams)`: reuses `snapshotFor`.
- `totals(ingredients)`: sum of ingredient snapshots (reuses `sumNutrients`).
- `perPortion(totals, portions)` and `per100g(totals, cookedWeightG)`.
- `batchEntrySnapshot(batch, amount, unit)`: `portion` scales by amount / portions; `g` scales by amount /
  cooked weight and needs a cooked weight.
- `portionsLeft(batch, entries)`: portions minus logged portions; gram entries count as grams / (cooked weight /
  portions) using the batch's current values. Display clamps at 0; the raw value may go negative.
- `netWeight(gross, tare)`: must be > 0, else a validation error.
- `isStale(lastActivity, now)`: true after `BATCH_AUTO_FINISH_DAYS` (7) without activity.
- New constants in `constants.ts`: `BATCH_AUTO_FINISH_DAYS`, `MAX_PORTIONS` (100), `MAX_COOKED_WEIGHT_G` (20000),
  `MAX_TARE_G` (10000).

## 5. Recipes (3a)

- **Recipes tab** (`/recipes`): in 3b an "Active batches" section first; then recipes sorted by name, each with
  kcal per portion and portion count; "New recipe" button. Empty state as today.
- **Recipe page** (`/recipes/new`, `/recipes/[id]`): name, default portions, notes, the ingredient list, and a
  live summary (totals, per portion kcal and macros). One Save writes the whole recipe (fields and ingredients
  replaced in one D1 batch). Unsaved changes warn on navigation (`beforeNavigate` plus `beforeunload`). At least one
  ingredient is required.
- Recipe kcal is computed live from the current foods: a recipe is a template, not history. Editing a food changes
  recipe totals and future batches only.
- **Archive** instead of delete (batches reference recipes), with a 5 s Undo toast. Archived recipes are hidden.
- **Ingredient list** (`IngredientList`, shared with batches): rows show name, amount with unit, kcal; tap a row
  to change the amount; reorder by up and down buttons in the row menu; remove with Undo. "Add ingredient" opens a
  sheet with `FoodSearch` (library, OFF, scan, New food; no Quick add) followed by `AmountStep` with units g or ml,
  and serving when the food has one. The same food may appear twice.

## 6. Batches (3b)

- **Cook batch** on a recipe opens `/recipes/batches/new?recipe=<id>`, prefilled: name from the recipe, cooked on
  today, portions = default portions, ingredients copied. **New batch** on the Recipes tab opens the same page
  empty (one-off). Batch routes live under `/recipes` so the Recipes tab stays active.
- **Batch page** (`/recipes/batches/[id]`): the same form as creation plus a header with "7 of 10 portions left",
  kcal and macros per portion and, with a cooked weight, per 100 g. Actions: Log (opens the add sheet at this
  batch's amount step), Finish or Reopen, Delete.
- **Editable, future only** (user's call): every field and ingredient stays editable. Existing ingredients keep
  their per 100 snapshot when their amount changes; a newly added ingredient is snapshotted from the food at save
  time. Totals are recomputed from the snapshots on every save. Logged entries never change.
- **Snapshot rule**: the client sends ingredients as `{ id?, foodId, amount, unit }`; the server snapshots
  nutrition. A batch ingredient whose food was later archived or edited keeps its snapshot.
- **Cooked weight**: a weight field with a container picker (none or a saved container). With a container the
  person types the gross weight and sees the net; the batch stores the net. "New container" creates one inline
  (name, tare). Without a cooked weight, the batch logs by portion only and the UI says why grams are disabled.
- **Finish**: Finish sets `finished_at`; Reopen clears it. A batch stays active at 0 portions left until finished
  (user's call). Auto finish: when active batches are loaded, any batch with no activity (created, updated or
  logged) for 7 days gets `finished_at` set in the same request. The Recipes tab lists finished batches in a
  collapsed "Finished" section (latest 20) with Reopen.
- **Delete**: allowed only when no live (not soft deleted) entry references the batch; soft deleted entries that
  reference it are hard deleted with it. Otherwise the menu explains "Logged batches can be finished, not deleted".
- **Containers in Settings**: list with rename, change tare and delete.

## 7. Logging batches (3b)

- **Add sheet**: active batches sit at the top of the search step (above quick actions, recents and frequents)
  while the search field is empty, newest cooked first, each with portions left and kcal per portion. They also
  appear in the fetched suggestions for pages without a day.
- **Batch amount step**: units `portion` and `g` (g only with a cooked weight). Default: 1 portion. Live preview
  via `batchEntrySnapshot`. Log writes a `batch` entry: batch_id, amount, unit, grams (gram equivalent when the
  cooked weight is known, else null), label = batch name, snapshot from the server.
- **Editing a batch entry**: same step in edit mode. The snapshot rescales by new amount over old amount in the
  same unit; a unit switch converts through the stored gram equivalent and is offered only when it exists. Never
  re-read from the batch.
- **Logging a finished batch** is possible from the batch page (Log) and reopens nothing; the add sheet only lists
  active batches.

## 8. Remote functions and schemas

New schemas in `src/lib/schemas/recipe.ts` and `batch.ts`: `RecipeInput`, `BatchInput` (with
`cookedWeightG` net, nullable), `ContainerInput`, `LogBatchInput`, and `EditAmountInput` extended to `portion`.
Commands in `src/routes/(app)/recipes/recipes.remote.ts` and `batches.remote.ts`, followed by
`await invalidateAll()`. Page data from `load` so the service worker caches recipe and batch pages for reading
offline. Forms validate on blur with the same schemas.

## 9. New UI components (each on `/design` with all states)

`IngredientList`, `IngredientRow`, `RecipeRow`, `BatchRow` (portions left, finished, stale), `NutritionSummary`
(totals and per portion), `WeightField` (container picker, gross and net), `ContainerForm`, batch variant of
`AmountStep`. Containers that call remote functions follow the existing rule: their parts are shown, not the
container.

## 10. Tests

- **Domain**: totals, per portion, per 100 g, batch entry snapshot (portion and g, missing cooked weight),
  portions left (mixed units, negative), net weight validation, staleness boundary at exactly 7 days.
- **Server (Miniflare D1)**: recipe save replaces ingredients atomically; archive hides; batch create snapshots
  from foods; batch edit keeps existing snapshots and snapshots new ones; editing a food leaves batches unchanged;
  auto finish; delete rules; log batch entry and edit; migration keeps existing log entries (3b).
- **E2E (WebKit iPhone and desktop Chromium)**: 3a create a recipe with a BLV food and a serving based food, see
  kcal per portion, edit and archive with Undo. 3b cook a batch from that recipe with a container and gross weight,
  log 1.5 portions and 200 g from the add sheet, totals on Today match; edit the entry; finish hides it from the add
  sheet; unsaved changes warning.

## 11. Parent spec updates (same PR)

Section 4: batches stay active until finished, auto finish after 7 days without activity. Section 5: amount and
unit on `recipe_ingredients` and `batch_ingredients`, `updated_at` on `batches`, `containers.created_at`.

## 12. Left to the builder

Exact component boundaries, remote file layout within the routes above, copy wording, the order and look of the
Finished section, how the row menu reorders on desktop (keyboard), and the migration check outcome (recorded).
