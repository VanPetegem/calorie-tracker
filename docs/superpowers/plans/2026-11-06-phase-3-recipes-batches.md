# Phase 3: Recipes and Batches Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. One implementer subagent per task, one review per task.

**Goal:** Recipes as templates (3a), then batches cooked from them or one-off, logged by portion or grams from the add sheet (3b).

**Architecture:** Pure recipe and batch math in `src/lib/domain/batch.ts`. Repositories in `src/lib/server/recipes/` and `src/lib/server/batches/`. Pages under `/recipes` load their data in `+page.server.ts` (cached by the service worker); writes are remote `command`s with shared Valibot schemas, followed by `await invalidateAll()`. Recipe and batch editors share one `IngredientList` component; adding an ingredient reuses `FoodSearch` and `AmountStep` inside a `Sheet`.

**Spec:** `docs/superpowers/specs/2026-11-06-phase-3-recipes-batches-design.md` (wins for phase 3) and parent spec sections 4, 5, 7, 10. Repo rules: `AGENTS.md`.

## Global Constraints

- Everything in the phase 2 plan's Global Constraints still holds (domain purity, tokens only, `/design` sections, 44 px targets, reduced motion, `newId()`, `parseDecimal`, gate after every task, no remote deploy or migration).
- Nutrition is never accepted from the client. Recipe totals are computed from current foods; batch ingredients and log entries hold snapshots computed on the server.
- Editing a food, recipe or batch never changes a logged entry. Editing a batch never changes an existing batch ingredient's per 100 snapshot.
- Limits: portions > 0 and at most `MAX_PORTIONS` (100); cooked weight > 0 and at most `MAX_COOKED_WEIGHT_G` (20000); tare > 0 and at most `MAX_TARE_G` (10000); ingredient amounts use the existing `amount` and `fitsUnit` limits; names 1 to 200 characters; notes at most 2000; at most 50 ingredients.
- Multi row writes (recipe save, batch save) run in one `db.batch([...])` so they are atomic on D1.
- Svelte work uses the Svelte MCP autofixer before the task is reported done.

## Review Focus

1. A tampered command (nutrition values sent along, unknown food id, 0 or 101 portions, 51 ingredients, an ingredient id that belongs to another batch) is rejected and writes nothing. Tests in Tasks 2 and 7.
2. Saving a batch after editing a food keeps the old snapshot for existing ingredients and uses the new values only for a newly added one. Test in Task 7.
3. Applying migrations to a database that already holds log entries (food, quick, soft deleted) keeps every row and value. Test in Task 6.
4. Auto finish never finishes a batch logged or edited within the last 7 days, and the boundary is exact. Tests in Tasks 5 and 7.
5. A recipe save that fails halfway (e.g. a bad food id in the third ingredient) leaves the old recipe intact. Test in Task 2.

## Execution table

| Task | PR | Deliverable | Model | Effort |
| ---- | -- | ----------- | ----- | ------ |
| 1 | 3a | Domain: ingredient and recipe totals, per portion | haiku | xhigh |
| 2 | 3a | Recipe schema, migration, Valibot schema, repository | opus | high |
| 3 | 3a | Ingredient list components and add ingredient sheet | sonnet | high |
| 4 | 3a | Recipes tab, recipe page, remote commands, e2e, docs; final 3a review | sonnet | high |
| 5 | 3b | Domain: batch entry snapshot, portions left, net weight, staleness | haiku | xhigh |
| 6 | 3b | Batch and container schema, `batch_id` reference, migration check | opus | high |
| 7 | 3b | Batch and container repositories, remote commands | opus | high |
| 8 | 3b | Logging batches: add sheet, batch amount step, entry edit | sonnet | high |
| 9 | 3b | Batch pages, containers UI, Recipes tab sections, e2e, docs; final 3b review | sonnet | high |

Per task review: sonnet high (sonnet xhigh for Tasks 2, 6, 7). Final branch review after Task 4 and after Task 9: opus, xhigh. Branches: `phase-3a-recipes`, then `phase-3b-batches` from `main` after 3a merges.

## File Structure

```
src/lib/domain/
  batch.ts              ingredient, recipe and batch math (3a part, 3b part)
  constants.ts          + MAX_PORTIONS, MAX_COOKED_WEIGHT_G, MAX_TARE_G, BATCH_AUTO_FINISH_DAYS, MAX_INGREDIENTS
src/lib/schemas/
  recipe.ts             IngredientInput, RecipeInput
  batch.ts              BatchInput, ContainerInput, LogBatchInput (3b)
src/lib/server/
  db/schema.ts          + recipes, recipe_ingredients (3a); containers, batches, batch_ingredients (3b)
  recipes/repo.ts       listRecipes, getRecipe, saveRecipe, archiveRecipe, restoreRecipe
  batches/repo.ts       batch and container queries and writes (3b)
src/lib/components/recipes/
  IngredientList.svelte, IngredientRow.svelte, AddIngredientSheet.svelte, NutritionSummary.svelte, RecipeRow.svelte
  RecipeForm.svelte     (shared fields + ingredient list for the recipe page)
  BatchRow.svelte, BatchForm.svelte, WeightField.svelte, ContainerForm.svelte (3b)
src/routes/(app)/recipes/
  +page.server.ts, +page.svelte                     list (3b adds batch sections)
  new/+page.server.ts, new/+page.svelte             new recipe
  [id]/+page.server.ts, [id]/+page.svelte           edit recipe
  recipes.remote.ts                                 saveRecipe, archiveRecipe, restoreRecipe
  batches/new/, batches/[id]/, batches.remote.ts    (3b)
e2e/recipes.e2e.ts (3a), e2e/batches.e2e.ts (3b)
```

---

## PR 3a

### Task 1: Domain, recipe math

**Files:**
- Create: `src/lib/domain/batch.ts`, `src/lib/domain/batch.spec.ts`
- Modify: `src/lib/domain/constants.ts`, `src/lib/domain/constants.spec.ts` if it lists constants

**Interfaces:**
- Consumes: `Per100`, `Nutrients`, `snapshotFor`, `sumNutrients` from `nutrition.ts`.
- Produces:
  - `type IngredientLine = { per100: Per100; grams: number }`
  - `ingredientNutrients(line: IngredientLine): Nutrients` (= `snapshotFor`)
  - `totals(lines: IngredientLine[]): Nutrients` (empty list gives zeros with fiber 0)
  - `perPortion(totals: Nutrients, portions: number): Nutrients` (RangeError if portions <= 0; rounded to one decimal)
  - Constants `MAX_PORTIONS = 100`, `MAX_COOKED_WEIGHT_G = 20000`, `MAX_TARE_G = 10000`, `BATCH_AUTO_FINISH_DAYS = 7`, `MAX_INGREDIENTS = 50`, `MAX_NOTES = 2000`.
- [ ] **Step 1: Write failing tests**: 200 g chicken (165 kcal/100) + 100 g rice (130/100) totals 460 kcal; fiber null on one line counts as 0; `perPortion` of 460 kcal over 4 is 115, over 1.5 is 306.7; 0 portions throws.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the gate.
- [ ] **Step 5: Commit** `feat(domain): recipe totals and per portion`.

### Task 2: Recipe schema, migration, repository

**Files:**
- Modify: `src/lib/server/db/schema.ts`, `src/lib/server/db/schema.spec.ts`
- Create: `drizzle/0019_*.sql` (generated), `src/lib/schemas/recipe.ts`, `src/lib/server/recipes/repo.ts`, `src/lib/server/recipes/repo.spec.ts`, cases in `src/lib/schemas/schemas.spec.ts`

**Interfaces:**
- Consumes: `Db`, `newId`, `getFood`, `toGrams`, `totals`, `perPortion`, `amount`, `fitsUnit`, `id`, `text`, `orNull`, `positiveUpTo`.
- Produces:
  - Tables `recipes` and `recipeIngredients` per spec section 3 (3a), `recipe_ingredients.unit` enum `g | ml | serving`; index `recipe_ingredients(recipe_id, position)`; types `Recipe`, `RecipeIngredient`.
  - Valibot `IngredientInput = { foodId, amount, unit }` (with `fitsUnit`), `RecipeInput = { id?: uuid, name: text(200), defaultPortions: positiveUpTo(MAX_PORTIONS), notes: orNull(text(MAX_NOTES)), ingredients: array(IngredientInput), 1 to MAX_INGREDIENTS }`, `ArchiveRecipeInput = { id }`.
  - `type RecipeSummary = Recipe & { totals: Nutrients; perPortion: Nutrients; ingredientCount: number }`
  - `type RecipeDetail = RecipeSummary & { ingredients: (RecipeIngredient & { food: Food; nutrients: Nutrients })[] }`
  - `listRecipes(db): Promise<RecipeSummary[]>` (not archived, by name, case insensitive)
  - `getRecipe(db, id): Promise<RecipeDetail | null>` (archived included, ingredients by position)
  - `saveRecipe(db, input: RecipeInput): Promise<Recipe>`: validates every food exists (throws a typed `UnknownFoodError` before writing), computes `grams` with `toGrams` (serving needs the food's `servingG`, else `UnitNotAvailableError`), then in one `db.batch`: upsert the recipe, delete its ingredients, insert the new ones with `position` = array index.
  - `archiveRecipe(db, id)`, `restoreRecipe(db, id)` (idempotent).
- [ ] **Step 1: Write failing tests**: schema rejects 0 and 101 portions, 0 and 51 ingredients, `serving` for a food without a serving (server side), extra keys such as `kcal` (strictObject); repo: totals and per portion from current foods; editing a food changes `getRecipe` totals; save replaces ingredients and keeps order; save with an unknown food id in the third ingredient leaves the stored recipe unchanged; archive hides from `listRecipes`, restore brings it back, both twice without error; cascade delete of ingredients at the SQL level.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement**, `pnpm db:generate`, `pnpm db:migrate:local`.
- [ ] **Step 4: Run** the gate.
- [ ] **Step 5: Commit** `feat(recipes): schema and repository`.

### Task 3: Ingredient list and add ingredient sheet

**Files:**
- Create: `src/lib/components/recipes/{IngredientList,IngredientRow,AddIngredientSheet,NutritionSummary,RecipeRow}.svelte`, component specs for `IngredientList` and `NutritionSummary`
- Modify: `src/lib/components/log/FoodSearch.svelte` (make `onquick` optional; hide Quick add without it), `src/routes/(app)/design/+page.svelte`

**Interfaces:**
- Consumes: `FoodSearch`, `AmountStep`, `Sheet`, `Toaster`/`toasts`, `ingredientNutrients`, `totals`, `perPortion`, `toGrams`, `loadSuggestions` (recents for the picker).
- Produces:
  - `type DraftIngredient = { key: string; food: Pick<Food, 'id' | 'name' | 'nutritionBasis' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'servingG'>; amount: number; unit: LogUnit }`. `key` is a client id for keyed `#each`.
  - `IngredientList` props `{ ingredients: DraftIngredient[] (bindable); per100?: (i: DraftIngredient) => Per100 }` (3b passes snapshots; default uses `i.food`). Rows show name, amount with unit, kcal; tap opens `AmountStep` in edit mode in a sheet; row menu: Move up, Move down, Remove (Undo toast restores at the same index). "Add ingredient" opens `AddIngredientSheet`.
  - `AddIngredientSheet` props `{ open (bindable); onadd(food: Food, value: AmountValue): void }`: `FoodSearch` without Quick add, then `AmountStep` with a button labelled "Add".
  - `NutritionSummary` props `{ totals: Nutrients; portions: number | null; per100g?: Nutrients | null }`: totals and per portion kcal and macros, tabular numbers; invalid portions shows totals only with "Enter portions to see per portion values".
  - `RecipeRow` props `{ recipe: RecipeSummary; href: string }`.
- Behaviour: empty list shows an EmptyState "Add the raw ingredients". Live totals update as amounts change. All rows and menus reachable by keyboard.
- [ ] **Step 1: Write failing tests**: IngredientList: adding, moving and removing with Undo keep order; NutritionSummary shows per portion for 1.5 portions and the hint for 0. FoodSearch spec: no Quick add without `onquick`.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement**, with `/design` sections (empty, filled, long list, menu open, summary with and without portions).
- [ ] **Step 4: Run** the gate.
- [ ] **Step 5: Commit** `feat(recipes): ingredient list and summary`.

### Task 4: Recipe pages, commands, e2e, docs

**Files:**
- Create: `src/routes/(app)/recipes/+page.server.ts`, `recipes/new/+page.{server.ts,svelte}`, `recipes/[id]/+page.{server.ts,svelte}`, `recipes/recipes.remote.ts`, `src/lib/components/recipes/RecipeForm.svelte`, `src/lib/stores/unsaved.svelte.ts` (or inline), `e2e/recipes.e2e.ts`, seed helper `seedRecipe` in `e2e/seed.ts` if needed
- Modify: `src/routes/(app)/recipes/+page.svelte`, `docs/architecture.md` (recipes section, directory map), `docs/decisions.md`, parent spec section 5 (`recipe_ingredients` amount and unit)

**Interfaces:**
- Consumes: Task 2 repo and schemas, Task 3 components.
- Produces: remote commands `saveRecipe(RecipeInput): { id }`, `archiveRecipe({ id })`, `restoreRecipe({ id })`. Load data: list `{ recipes: RecipeSummary[] }`; edit `{ recipe: RecipeDetail }` (404 if unknown; archived shows a banner with Restore).
- Behaviour: spec section 5. `RecipeForm` validates on blur with `RecipeInput` (ingredients mapped to `{ foodId, amount, unit }`); Save disabled with an explanation while invalid or busy; after a new recipe is saved, `goto('/recipes/<id>', { replaceState: true })`. Unsaved changes: `beforeNavigate` cancels with a confirm dialog (Sheet or Dialog, "Discard changes?") and `beforeunload` while dirty. Archive navigates to `/recipes` with a 5 s Undo toast. A failed save keeps the form and shows Retry.
- [ ] **Step 1: Write failing tests**: e2e: create "Chicken rice" with 200 g of a BLV chicken and 2 servings of a custom food with a serving, 4 portions; list shows its kcal per portion; edit to 5 portions and save; navigating away with an unsaved change asks; archive and Undo; RecipeForm spec: blur on name with blank shows "Enter a value".
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement** and update the docs.
- [ ] **Step 4: Run** the full gate.
- [ ] **Step 5: Commit** `feat(recipes): recipes tab and editor`.
- [ ] **Step 6: Final 3a branch review** (opus, xhigh), fix findings, open the PR.

---

## PR 3b

### Task 5: Domain, batch math

**Files:**
- Modify: `src/lib/domain/batch.ts`, `src/lib/domain/batch.spec.ts`, `src/lib/domain/nutrition.ts` (`toGrams` supports `portion` given a portion weight)

**Interfaces:**
- Produces:
  - `type BatchShape = { totals: Nutrients; portions: number; cookedWeightG: number | null }`
  - `per100g(totals, cookedWeightG): Nutrients`
  - `batchEntrySnapshot(batch: BatchShape, amount: number, unit: 'portion' | 'g'): { nutrients: Nutrients; grams: number | null }` (`g` without cooked weight throws `RangeError`)
  - `portionsLeft(batch: BatchShape, entries: { amount: number; unit: string; grams: number | null }[]): number` (raw, may be negative; gram entries without a cooked weight are ignored)
  - `netWeight(gross: number, tareG: number): number` (RangeError if result <= 0)
  - `isStale(lastActivityIso: string, now: Date): boolean` (true when strictly more than 7 × 24 h have passed)
- [ ] **Step 1: Write failing tests**: 1.5 portions of a 4 portion, 2000 kcal batch is 750 kcal and, with 1600 g cooked, 600 g; 200 g of the same is 250 kcal; portions left with 1 portion and 400 g logged on 4 portions of 1600 g is 2; over logging gives a negative number; net 1850 - 650 = 1200, 600 - 650 throws; stale at 7 days plus 1 ms, not at exactly 7 days.
- [ ] **Step 2: Run**; fail. **Step 3: Implement.** **Step 4: Gate.** **Step 5: Commit** `feat(domain): batch math`.

### Task 6: Batch schema and migration check

**Files:**
- Modify: `src/lib/server/db/schema.ts`, `src/lib/server/db/schema.spec.ts`, `src/lib/schemas/fields.ts` (`LOG_UNITS` gains `portion`, `fitsUnit` limit for portions = `MAX_PORTIONS`)
- Create: `drizzle/0020_*.sql` (generated, reviewed by hand), `src/lib/server/db/migrations.spec.ts`

**Interfaces:**
- Produces: tables `containers`, `batches`, `batchIngredients` per spec section 3 (3b); `logEntries.batchId` references `batches.id`; index `batches(finished_at)` and `log_entries(batch_id)`; types `Batch`, `BatchIngredient`, `Container`.
- Also (from the 3a review): index `recipe_ingredients(food_id)` in the same migration.
- `toGrams` now accepts `portion` (Task 5). Adding `portion` to `LOG_UNITS` must not let a food entry use it: food log input and `gramsFor` in `server/log/repo.ts` keep rejecting `portion` (separate unit list or explicit check), with a test.
- `migrations.spec.ts`: applies migrations up to 0019, inserts food, quick and soft deleted entries, applies the rest, asserts every row and column is unchanged and that foreign keys pass (`PRAGMA foreign_key_check` returns nothing). If drizzle-kit's rebuild uses `PRAGMA foreign_keys=OFF` (ignored inside D1's transaction), switch it to `PRAGMA defer_foreign_keys = on` by hand. If no safe rebuild exists, keep the plain column, enforce the link in the repo and record why in `docs/decisions.md`.
- [ ] **Step 1: Write failing tests** (migration check, a log entry with an unknown `batch_id` fails, deleting a batch cascades its ingredients).
- [ ] **Step 2: Run**; fail. **Step 3: Implement**, `pnpm db:generate`, inspect the SQL, `pnpm db:migrate:local`. **Step 4: Gate.** **Step 5: Commit** `feat(db): batches, containers`.

### Task 7: Batch and container repositories, commands

**Files:**
- Create: `src/lib/schemas/batch.ts`, `src/lib/server/batches/repo.ts`, `src/lib/server/batches/repo.spec.ts`, `src/routes/(app)/recipes/batches.remote.ts`
- Modify: `src/lib/server/log/repo.ts` (`addBatchEntry`; `updateEntryAmount` handles `portion` and entries without grams), `src/routes/(app)/log.remote.ts` (`logBatch`), `src/lib/schemas/log.ts`

**Interfaces:**
- Produces:
  - Valibot `BatchIngredientInput = { id?: uuid, foodId, amount, unit }`, `BatchInput = { id?, recipeId: orNull(id), name, cookedOn: isoDate, portions, cookedWeightG: orNull(positiveUpTo(MAX_COOKED_WEIGHT_G)), ingredients: 1..MAX_INGREDIENTS }`, `ContainerInput = { id?, name: text(100), tareG }`, `LogBatchInput = { date, batchId, amount, unit: 'portion' | 'g' }`.
  - `type BatchSummary = Batch & { portionsLeft: number; perPortion: Nutrients; per100g: Nutrients | null; lastActivity: string }`; `BatchDetail = BatchSummary & { ingredients: BatchIngredient[]; liveEntryCount: number }`.
  - `activeBatches(db, now): Promise<BatchSummary[]>`: first sets `finished_at` on stale active batches (activity = max of `created_at`, `updated_at`, latest live entry `logged_at`), then returns active ones by `cooked_on` desc.
  - `finishedBatches(db, limit = 20)`, `getBatch(db, id)`, `draftFromRecipe(db, recipeId, today)`: a `BatchInput` prefilled from the recipe.
  - `saveBatch(db, input)`: unknown ingredient ids (or ids of another batch) are rejected; existing ingredients keep their per 100 snapshot and get the new amount, unit and grams; new ones are snapshotted from the food; totals recomputed with `totals`; one `db.batch`.
  - Serving lines of a batch ingredient price servings from a serving weight snapshotted on the batch ingredient (`grams / amount` at save), not from the live food's `servingG`. The batch editor maps `food.servingG` from that snapshot, so the editor and the server agree.
  - `finishBatch`, `reopenBatch` (idempotent), `deleteBatch` (refuses with `BatchLoggedError` when a live entry references it; else hard deletes its soft deleted entries and the batch in one `db.batch`).
  - `listContainers`, `saveContainer`, `deleteContainer`.
  - `addBatchEntry(db, input, ctx)`: snapshot via `batchEntrySnapshot`, label = batch name, `kind = 'batch'`; logging a finished batch is allowed.
  - `saveRecipe` (3a review): throws `RecipeNotFoundError` when the update returns no row.
  - `portionsLeft` throws on units other than `portion` and `g`: `logBatch` and `updateEntryAmount` accept only those two for batch entries, so one bad row cannot break `activeBatches`. Batch summaries use `cookedWeightG === null ? null : per100g(...)`.
  - `updateEntryAmount`: same unit rescales by amount ratio; a unit switch needs stored `grams` (else `UnitNotAvailableError`), then rescales by grams ratio.
  - Remote commands in `batches.remote.ts`: `saveBatch`, `finishBatch`, `reopenBatch`, `deleteBatch`, `saveContainer`, `deleteContainer`; `logBatch` in `log.remote.ts`.
- [ ] **Step 1: Write failing tests**: draft from recipe copies ingredients and default portions; save snapshots from foods; edit a food then save the batch with a changed amount and one new ingredient: old ingredient keeps its old per 100, new one has the new values; a foreign ingredient id is rejected and writes nothing; auto finish boundary (6 days 23 h stays, 7 days plus 1 min finishes, a log 2 days ago keeps it active); delete refused with a live entry, allowed with only soft deleted ones; log 1.5 portions and 200 g give the domain values; edit a portion entry without grams to 2 portions; switching it to grams is refused; editing the batch after logging leaves the entry unchanged.
- [ ] **Step 2: Run**; fail. **Step 3: Implement.** **Step 4: Gate.** **Step 5: Commit** `feat(batches): repositories and commands`.

### Task 8: Logging batches in the add sheet

**Files:**
- Modify: `src/lib/components/log/{AddSheet,FoodSearch,AmountStep,EditEntrySheet,EntryRow}.svelte`, `src/lib/components/log/amount.ts`, `src/lib/server/log/day.ts` (`DayData` and `suggestions` gain `batches: BatchSummary[]`), `src/routes/(app)/foods.remote.ts` (`loadSuggestions` returns batches), `src/lib/stores/add-sheet.svelte.ts` (open at a batch), component specs, `/design`
- Create: `src/lib/components/recipes/BatchRow.svelte`

**Interfaces:**
- Consumes: `activeBatches`, `logBatch`, `editAmount`, `batchEntrySnapshot`.
- Produces: `addSheet.openBatch(batch: BatchSummary)` for the batch page's Log button. `AmountStep` accepts a batch source: `{ kind: 'batch'; batch: BatchShape & { name: string } }` with units `portion` and `g` (g disabled with "Add the cooked weight to log grams" when unknown), default 1 portion, preview via `batchEntrySnapshot`. `BatchRow` props `{ batch: BatchSummary; onpick?; href? }` showing "N of M portions left" (clamped at 0) and kcal per portion.
- Behaviour: spec section 7. Active batches above quick actions while the search is empty. Batch entries on Today open the batch amount step in edit mode with the entry's per 100 implied by its snapshot.
- [ ] **Step 1: Write failing tests**: AmountStep batch preview for 1,5 portions; g disabled without cooked weight; AddSheet spec shows batches first; e2e (seeded batch): log 1.5 portions, Today total matches; edit to 2 portions.
- [ ] **Step 2: Run**; fail. **Step 3: Implement**, `/design` sections for `BatchRow` (active, 0 left, finished) and the batch amount step. **Step 4: Gate.** **Step 5: Commit** `feat(log): log batches`.

### Task 9: Batch pages, containers, e2e, docs

**Files:**
- Create: `src/routes/(app)/recipes/batches/new/+page.{server.ts,svelte}`, `batches/[id]/+page.{server.ts,svelte}`, `src/lib/components/recipes/{BatchForm,WeightField,ContainerForm}.svelte`, component specs for `WeightField`, `e2e/batches.e2e.ts`
- Modify: `src/routes/(app)/recipes/+page.{server.ts,svelte}` (Active batches, New batch, Finished section), `recipes/[id]/+page.svelte` (Cook batch), `src/routes/(app)/settings/+page.{server.ts,svelte}` (Containers section), `/design`, `docs/architecture.md`, `docs/decisions.md`, parent spec sections 4 and 5

**Interfaces:**
- Consumes: Task 7 repo and commands, Task 3 `IngredientList` (with snapshot `per100`), Task 8 `addSheet.openBatch`.
- Produces: `WeightField` props `{ value: number | null (bindable, net); containers: Container[]; oncreatecontainer(input): Promise<Container> }`: container picker (None plus saved), gross input with net shown, net error from `netWeight`, "New container" inline `ContainerForm`. `BatchForm` reuses the unsaved changes guard from Task 4.
- Behaviour: spec section 6. `/recipes/batches/new?recipe=<id>` loads `draftFromRecipe` (404 for unknown recipe); without `recipe` it is a one-off. Batch page header with portions left, per portion, per 100 g; Log, Finish or Reopen, Delete (disabled with the explanation when logged).
- [ ] **Step 1: Write failing tests**: WeightField: gross 1850 with a 650 g pot gives 1200 net; gross below tare shows the error; e2e: cook a batch from the 3a recipe, create a container inline, enter gross weight, save; log 1.5 portions and 200 g from the add sheet; Today totals match; finish hides it from the add sheet and shows it under Finished; Reopen brings it back; a one-off batch without cooked weight logs by portion only; Settings renames and deletes a container.
- [ ] **Step 2: Run**; fail. **Step 3: Implement** and update the docs. **Step 4: Run** the full gate. **Step 5: Commit** `feat(batches): batch pages and containers`.
- [ ] **Step 6: Final 3b branch review** (opus, xhigh), fix findings, open the PR.
