# Decision Log

Living record of decisions. Newest first. Each entry: date, decision, reason.

## 2026-11-08

- **Weekly R2 backup (phase 5a): a wrapper Worker entry, app tables only, the migration from `d1_migrations`, a 90 day lifecycle.** The SvelteKit adapter emits a Worker with only `fetch`, so `worker/index.ts` is `main` and re-exports it with a `scheduled` handler: one Worker, one deploy, no new secrets (rejected: a second Worker, and a CI job holding a token that can export production data). The adapter writes its Worker to the `main` of the config it reads and would overwrite the wrapper, so `vite.config.ts` gives it `wrangler.adapter.jsonc` (and `platformProxy.configPath` keeps dev bindings on `wrangler.jsonc`). With `main` a committed file, `wrangler types` output no longer depends on a build, so `scripts/worker-types.mjs` (a stub of the build output) was removed and `worker/adapter.d.ts` types the adapter import instead. Auth tables are not backed up (no session tokens in R2). A restore into the existing database leaves them alone, so the passkey keeps working; only a recreated database needs a new passkey via `/setup`. The file records the newest row of the database's own `d1_migrations` (the file name, e.g. `0022_targets.sql`) as `migration`, not the bundled journal, so it is right when the code is ahead of the last migration; restore compares it with the repo's latest journal tag plus `.sql` and refuses a mismatch, and the docs check the target's `d1_migrations` and note a Time Travel bookmark first. `backup:restore` writes the SQL file itself (pnpm's banner would corrupt a redirect), and downloads live in the gitignored `.backups/` because the repo is public and the data is health data. A test keeps `assets` of the two wrangler configs equal. R2 deletes objects after 90 days (12 weeks plus slack), set once by the user.
- **Onboarding and settings saves are safe under concurrency (#13), with no schema change.** Onboarding's batch writes the weigh-in and the week row as `INSERT ... SELECT ... WHERE EXISTS (settings with an incomplete profile)` and the profile last as `UPDATE ... WHERE` incomplete; when that update changes 0 rows (D1 reports it per statement as `meta.changes` in the drizzle batch result, also in the Miniflare test D1), another submit finished first, nothing was written and the answer is 400 `PROFILE_ALREADY_SET_UP`. The fast path on `ctx.settings` stays. A settings save (goal, macro rules, profile) is a compare and swap: `settingsSwap` updates only while every column but the id still holds the values read (`IS`, so null equals null; reals compare exactly as read and bound back), and the row upsert, first in the batch, runs under the same condition (the settings still hold the values read), so both are written or neither is. On a conflict the save reads, computes (including `profileChanged` and `wasSmoothed`) and tries again, three tries in all (`SETTINGS_SAVE_ATTEMPTS`), then answers 409 "Settings changed, try again". Tests inject the other write by wrapping `db.batch`, not by timing. The swap guards settings only: a weigh-in or log change landing between the read and the batch is not detected (it affects the current week only if backfilled into its window). Left open: an A to B to A change of the settings between a read and its swap passes the swap, until a version column is added.
- **A profile change recomputes this week's TDEE without smoothing.** Settings said saving the profile recalculates the target, but `recomputeCurrentWeek` smoothed the new TDEE against last week's `tdee_used` and capped the move at 150 kcal, so correcting the activity level, sex or height barely changed it. When the patch changes a profile field (compared with the stored settings), the row is computed with `previousUsed = null`; goal and macro rule saves, and a profile save that changes nothing, still smooth. The decision lasts the week: a later save recomputes unsmoothed too when the existing row was (`wasSmoothed`: its `tdee_used` differs from `smoothTdee` of its own adaptive or formula TDEE and last week's `tdee_used`, exact since all are stored unrounded doubles), so a goal save cannot pull a corrected profile back; no column is needed. Next week smooths from the new value as usual.
- **The adaptive window starts from the first weigh-in's kg when no trend exists before it.** `adaptiveTdee` used that point's trend, which is the seed mean of up to three weigh-ins, so a gain (70.0, 70.3, 70.6) was understated by the later weigh-ins already in the seed. It now uses the raw kg of the first weigh-in in the window; the end stays the trend on the window's last day.
- **Review fixes for phase 4b.** `ProfileIncompleteError` maps to 400 "Finish setting up your profile first". `targetFor` returns `currentTarget`'s row for a date in this week instead of querying again. Settings reads the trend with `trendOn` over the series instead of the whole `loadWeight`. The kcal and gram formatter is one helper, `formatWhole`, next to `formatKg`. `onboardingRedirect` lost its remote function branch (remote calls never reach the `(app)` layout). `saveOnboarding` no longer parses its input again; the remote command validates it. The concurrency findings (onboarding double submit, overlapping settings saves) go to an issue.
- **A drizzle rebuild's CHECKs name their columns bare, never as `"__new_<table>"."col"`.** drizzle-kit writes the temporary table's name into each CHECK of the rebuilt table (`CHECK("__new_settings"."id" = 1)`). That only works because SQLite rewrites the references when `__new_settings` is renamed, which holds today but is an engine detail the migration should not rest on. 0022 now uses `CHECK("id" = 1)` and so on for all eight settings checks. Rule for every future rebuild: after `pnpm db:generate`, strip the `"__new_<table>".` prefix from CHECKs, and keep the other hand edits (`defer_foreign_keys`, the explicit copy columns). Proved with system `sqlite3` 3.51 on a scratch copy (0000 to 0022 apply, the stored `settings` SQL has no `__new`, each of the eight checks rejects a bad value), `pnpm db:generate` reports no changes, and `migrations.spec.ts` now has one case per settings check (dropping a check fails its case). The local D1 was reset (it held only the seeded foods) and migrated again.
- **Onboarding does not call `invalidateAll` after its write.** Its own load redirects to Today once the profile is complete, so a refresh would skip the result screen ("Your first target"); the Start link navigates instead. This is the one exception to "a write is followed by `invalidateAll`" in `AGENTS.md`. A second submit (another tab, a replay) gets 400 "The profile is already set up" (`PROFILE_ALREADY_SET_UP`, shared with the page); the page treats exactly that message as done and goes to Today, and shows any other 400 message in the form.
- **Forms show the server's 400 reason, else "Could not save. Try again."** `ProfileForm`, `GoalPicker` and `MacroRulesForm` use the `AmountStep` pattern (`isHttpError(cause, 400) ? cause.body.message : ...`), so "Log a weigh-in first" reaches the person who can act on it.
- **The worker also refuses a data response with an error node.** A failed load comes back as 200 with a node of `type: 'error'`; storing it would replace the last good copy like a redirect does.
- **Radio names and heading ids in the Settings components come from `$props.id()`,** so two instances on a page (Goal in Settings, the explainer on the result screen) never share a group or an id.
- **The age limit is checked once, in the repository.** `saveOnboarding` and `recomputeCurrentWeek` throw `AgeOutOfRangeError` (via `ageInRange`, counted on the settings timezone's day); the commands map it to 400 "Age must be 16 to 100" and the profile form calls the same `ageInRange` on blur. The command layer has no age check of its own (an `assertAgeOn` in the onboarding task duplicated it and was removed); boundary tests live in `repo.spec.ts` and `tdee.spec.ts`, and `commands.spec.ts` keeps one test per mapping.
- **A week row with no weigh-in before its week uses the earliest weigh-in's kg as the trend.** `currentTarget` passes
  all weigh-ins to `trendSeries(weighIns, sunday)`, where `seedUntil` keeps weigh-ins after the Sunday out of the seed,
  and `weekTarget` reads only the trend on that Sunday (`trendOn`) and the adaptive window before the week, so in-week
  weigh-ins never change the row. In the user's first week the onboarding weigh-in is today, so nothing is dated
  before the week: `trendOn` is null and `weekTarget` falls back to `series[0].kg`, the kg of the earliest weigh-in
  (not its trend), with a null rate. This differs from the plan's before-only rule, which left an empty series and a
  `weekTarget` RangeError, and needs no separate weigh-in filter (a first draft had a `rowWeighIns` helper; review
  showed it redundant). Tested: a first-week row stays the same after a later weigh-in, also when recomputed.
- **Settings writes that recompute the week answer 400 "Log a weigh-in first" when there is no weigh-in.** `recomputeWeekOn` (`server/targets/commands.ts`) maps `NoWeighInError` to a 400 and writes nothing; `saveGoal` and `saveMacroRules` (`settings/targets.remote.ts`) both call it. `commands.spec.ts` proves the goal rate stays as it was.
- **Goal and macro rules have their own Save, and a failed save keeps the choice with Retry.** This matches the other Settings forms. Save goal is off until the rate changes; the submit guard was dropped because the disabled button already stops that path. Macro rules validate on blur with `MacroRulesInput`.
- **Fat is typed as a percent and stored as a share.** `MacroRulesForm` divides the typed percent by 100 before the schema checks it. Its range message says "Enter a percent from 15 to 40"; the schema's own message would name 0.15. Advanced (energy density) opens by itself when its value is out of range, so a failed save is never hidden inside it.
- **The Weight tab shows this week's target only when the stored row is this week's.** An earlier row (a week with no weigh-in) is not shown as this week's target. The goal slope starts at this week's trend and runs at the goal rate; the chart's dashed line carries a title with its kg per week, which the page spec reads.
- **Settings lists stored rows and creates none.** `targetsHistory` loads every stored row (one a week), the list shows the latest 26 (`TARGETS_HISTORY_LATEST`), and "Show all" lists the rest. A week's row is still made by the first load that needs it (Today, day pages, Weight). The Profile card (Task 8) goes above Goal.
- **Targets e2e: one test, in the chromium project only.** The goal rate is shared, so a save from the other project could land between this test's save and its read; the file skips every other project. `e2e/targets.e2e.ts` picks a goal rate other than the stored one (Save goal is off until the rate changes, and any rate may be stored), waits for the Settings data reload, then reads Today's target and this week's history row from fresh page loads and compares them. It never compares with the target before the save: a new rate can give the same kcal when the trend moved in between. The "no target" hero assertions in `log.e2e.ts`, `log-batches.e2e.ts` and `batches.e2e.ts` now expect a target, since `auth.setup.ts` onboards.
- **`TdeeBasis` has no spec of its own.** The formula or adaptive label is tested where a user reads it: the targets history and this week's card. A break of the label fails both, which is the intended coverage at two entry points.
- **The goal's kg per week is one domain function, `goalKgPerWeek`.** `targetKcal` and the Settings and Weight displays all use it, so the formula lives in one place; the `targetKcal` tests in `targets.spec.ts` cover it.
- **Weekly target rows (Task 7).** `currentTarget` inserts with `ON CONFLICT DO NOTHING` and reads back, so two loads
  of a new week leave one row. `recomputeCurrentWeek` (settings patch plus this week's row) and `saveOnboarding`
  (profile, goal rate, today's weigh-in, row) each run in one `db.batch`; a test with a failing trigger on
  `weekly_targets` proves nothing else is written. A replaced row gets a new `computed_at`. `targetFor` makes this
  week's row first, then reads the date's week, else the latest earlier, else the earliest row. With no weigh-in at
  all `currentTarget` throws `NoWeighInError` (separate from `ProfileIncompleteError`) and `targetFor` falls back to
  the stored rows, so deleting every weigh-in does not break Today. `loadDay` returns `target: null` while the profile
  is incomplete instead of throwing; Task 8's redirect keeps those pages away.
- **`recomputeCurrentWeek` and `saveOnboarding` re-read the settings row inside the function** instead of merging the
  patch into `ctx.settings`, which was read at the start of the request. This narrows the race of two overlapping
  settings saves rather than closing it: the read and the batch are separate statements, so a save landing between
  them is still lost from the row (the settings themselves stay right, as each patch writes only its own fields).
  Closing it needs the row computed in one statement with the write; not worth it for one user. (Closed since by a
  compare and swap with retry, see "safe under concurrency (#13)" on 2026-11-08.)
- **Migration 0022 (`0022_targets.sql`) rebuilds `settings` and creates `weekly_targets`; the migration check passes.**
  Dropping `settings_manual_target_pair` forces a rebuild. drizzle-kit's rebuild was hand edited (and, since the final review, its CHECKs unprefixed, see the entry above): `PRAGMA
foreign_keys=OFF/ON` became `PRAGMA defer_foreign_keys = on` as in 0020, and its copy `INSERT ... SELECT "id",
"timezone", "sex", ... FROM settings` became `SELECT "id", "timezone"`. The old table has no `sex`, and SQLite reads
  an unknown double quoted name as text, so the generated copy wrote `'sex'` into `sex` and only the new check stopped
  it. `migrations.spec.ts` applies up to 0021, writes settings (timezone `America/New_York`, a manual target), the 3a
  rows and a weigh-in, applies 0022, and checks the row keeps id and timezone with every default and null profile, and
  that every other table, index, trigger and row is unchanged. Applied locally with `pnpm db:migrate:local`.
- **No migration test runs `PRAGMA foreign_key_check`.** Both copies (3a and 4b) could not fail: with keys enforced,
  a migration that leaves a broken key fails at its commit, so the check never sees one (tried on 0021 and 0022).
  `run with foreign keys enforced, as on D1` carries that guarantee. `migrateRest({ through })` lets the 3a check stop
  at 0021, because 0022 changes `settings` on purpose.
- **Settings checks come from the constants.** `settings_sex`, `settings_activity_level` (from the new `SEXES` and
  `ACTIVITY_LEVELS`, which `BMR_SEX_OFFSET` and `PAL` must cover), `settings_height_cm_range`, `settings_goal_rate`
  (`IN` the presets), `settings_protein_g_per_kg_range`, `settings_fat_pct_range`, `settings_energy_density_range`.
  Profile columns are nullable until onboarding; goal and rules are `NOT NULL` with the defaults. Birth date has no SQL
  check; the age limit needs a today. Fat is a share (0.15 to 0.40), not a percent.
- **`weekly_targets` stores values as `weekTarget` computes them**: kcal, TDEE and grams as `real`, counts as
  `integer`, `carbs_floored` as a boolean, `week_start` checked to be a real date on a Monday
  (`date(week_start) IS week_start` and `strftime('%w') = '1'`; `=` alone let text through, because a CHECK passes
  on NULL). A type check in `schema.spec.ts` keeps `WeeklyTarget` minus `computedAt` equal to `WeekTargetRow`.
- **The age limit (16 to 100) is checked on the server against the local today, not in the schemas.** `ageInRange(birthDate,
today)` in `domain/tdee.ts` is inclusive on both ends. `saveOnboarding` and `recomputeCurrentWeek` (when the patch has a birth
  date) check it against `ctx.today`, the day in the settings timezone, and throw `AgeOutOfRangeError` before any write.
  `ProfileInput` and `OnboardingInput` check only the birth date format: a UTC check in the shared schema could disagree with
  the server's day near a birthday. The profile form calls `ageInRange` on the same day and shows "Age must be 16 to 100" when the
  birth date loses focus; the commands map `AgeOutOfRangeError` to the same 400. The 15, 16, 100 and 101 boundary days are tested through both functions in `repo.spec.ts`.
- **The manual target is gone ahead of the weekly targets.** `ManualTargetInput`, `saveManualTarget`,
  `target.remote.ts`, `MAX_MANUAL_TARGET_KCAL`, the Settings card and its two e2e tests are removed; `loadDay` returns
  `target: null` until it reads `weekly_targets`.
- **The worker caches `__data.json` by path with `x-sveltekit-invalidated` removed from both the cache key and the network request, so the server loads every node.** SvelteKit sends a bitmap of the nodes to load and the server skips the rest, so a response depends on the bitmap. The bitmap changes from one navigation to the next, so a key that kept it would rarely match offline. Without the bitmap, each response is complete and one copy per path answers any later request. The cost is that the layout loads run again on each tab switch while online. A data request with no cached copy offline gets a 503. SvelteKit's client turns that into a full navigation (which then gets the cached page or the offline page) only when the root layout has a server load: `load_root_error_page` checks `app.server_loads[0] === 0`. So `src/routes/+layout.server.ts` exists for that reason and must stay; without it the client renders its bare error page. The worker stores only load results (`"type": "data"`), never a redirect, which SvelteKit sends with status 200 to a signed out user and which would replace the last good copy. Sign out already deletes every `kcal-*` cache, which covers these entries. No browser test covers the offline tab switch (dropped by request); the worker spec covers the cache, not SvelteKit's reaction to the 503.
- **The weight history lists the newest 30 weigh-ins (`WEIGHT_HISTORY_PAGE`), and "Show more" adds 30 over the loaded series.** The shown count is page state, so the refresh after a write keeps the rows already shown. The chart and its "All" table are unchanged.

## 2026-11-07

- **The entry card saves through `logWeightToday({ kg })`, which uses the server's today; the sheet keeps `saveWeight`
  with an explicit date.** `data.today` is fixed when the page loads, so a page left open past midnight, or a Retry
  after an offline resume, would have written the weigh-in to yesterday and replaced it. `logWeightTodayOn(ctx, input)`
  saves to `ctx.today` through `saveWeightOn` (same date window). The page still decides "Logged" or "Updated" from its
  loaded series; on a stale page that toast can name the wrong verb, which is cosmetic and the next refresh corrects it.
- **"Add weigh-in" starts on yesterday and says when the chosen day already has a weigh-in.** Today has the entry card,
  and a first day of today made a casual add replace today's weigh-in without a word. The sheet takes a `kgOn(date)`
  prop (the page answers from its series) and replaces the "Up to tomorrow." hint with "This day has 70.6 kg; saving
  replaces it" while the chosen date has a weigh-in. Replacing stays allowed, because correcting a day is the other use
  of the add sheet.
- **The sheet's date shows its error on blur, like every form.** `dateTouched` is set on blur and reset on each opening;
  Save still shows it, as before. The weight keeps its rule (error once it holds a value or after Save).
- **`MAX_WEIGHT_KG` sits next to `MIN_WEIGHT_KG`.** It was under the phase 2 manual target bounds. A move only.
- **A 4b week row's trend and rate use only weigh-ins before its week.** The 4b plan (Tasks 5 and 7) now says a row
  uses `trendSeries(weighIns before weekStart, addDays(weekStart, -1))`, so a weigh-in logged during the week cannot
  change the row (Review Focus 1). `latestWeight` returns the newest date, which can be tomorrow, so the onboarding
  prefill must use the latest up to today, not `latestWeight`.
- **The weight commands are thin wrappers over `saveWeightOn` and `deleteWeightOn`, and the page data comes from
  `loadWeight`.** All three live in `server/weights/commands.ts` and take `{ db, today }`, so the date window
  (`assertLogDate`, 400 after tomorrow, for save and delete) and the load are tested against Miniflare D1 without the
  remote function runtime. `weight.remote.ts` only calls them. `lastKg`, the entry's prefill, is the latest weigh-in up
  to today, so a weigh-in for tomorrow does not become the prefill; it also stays out of today's trend and rate: `trendSeries(weighIns, today)` seeds the trend only from weigh-ins up to today (with fewer than three, tomorrow's would otherwise enter the seed mean), and later ones continue it, so the chart and the summary agree.
- **The page toasts "Logged 70.6 kg" for a day without a weigh-in and "Updated 70.6 kg" for one with, and always shows
  the Add weigh-in button.** The page decides from the loaded series (the date has a point or not), for the entry card
  and the sheet alike. The history section and its button show with no weigh-ins too, because a missed past day can
  be the first one; the chart and summary wait for the first weigh-in. Deleting calls `deleteWeight`, then offers the
  5 s Undo (`withUndo`) that calls `saveWeight` with the old date and kg; a failed delete is a danger toast with Retry.
- **`EditWeightSheet` mounts its form anew on every opening, and a changed weight drops an old failure.** The number
  field keeps what was typed, and an invalid entry stays as text with value null, so resetting `kg` does not clear it:
  the form sits in `{#key openings}`, bumped in the sheet's `onclose`, not on open: a sheet shown again during its exit is
  not refocused by `Sheet`, and a remount on open would destroy the focused element. Accepted gap: `Sheet` skips `onclose` when it is reopened during its 200 ms exit, so an add sheet (weight null) reopened that fast keeps an invalid entry typed before; it shows its error and is replaced by typing. `WeightEntry` and the sheet clear the failure (and
  the Retry label) when the weight changes; `WeightEntry` says why the step buttons are off at 20 and 400 kg.
  `commitFocusedInput` and `fieldIssue` live in `weight/form.ts`.
- **The weight components take callbacks and the page owns the write, the toast and the refresh.** `WeightEntry` and
  `EditWeightSheet` only show the saving state and, when `onsave` rejects, keep the value and offer Retry (the
  `ContainerForm` pattern). They send nothing and toast nothing, so Task 4 shows "Logged" or "Updated" (it knows
  whether today had a value), calls `invalidateAll()`, and the components are shown whole on `/design`. The sheet
  closes itself when `onsave` resolves. `WeightRow` deletes from a visible bin button instead of the spec's row menu,
  with no swipe: one tap, Undo from the page, nothing hidden.
- **`NumberInput` commits on blur only, so the weight forms commit it themselves.** Enter in the field and a step
  button tapped while the field still has focus (iOS Safari does not focus a button, so the field never blurs) would
  use the old number. Both call a small `commitFocusedInput` first, which blurs the focused input. Steps work in whole tenths
  (`Math.round(kg * 10) + 1`, then `/ 10`), not `kg + 0.1`, which gives 70.69999999999999 from 70.6; the step buttons
  turn off only at 20 and 400 kg, with a hint. They stay on while the field is empty: a step commits what is typed
  first (so typing 70.5 and tapping + gives 70.6) and does nothing if there is still no number.
- **A stored weigh-in keeps its date in `EditWeightSheet`; the date is editable only for a new one.** Saving is an
  upsert by date, so changing the date of a stored weigh-in would leave the old day behind as a copy. `point` null
  opens the same sheet as "Add weigh-in" with a date up to tomorrow (`isAllowedLogDate`, the log's rule). Spec 5's
  "any allowed past date" is met by that add mode; the Weight page opens it from its "Add weigh-in" button.
- **The chart ranges are calendar days ending today, and the chart is a slider over its points.** "30 days" is today
  and the 29 days before it (`visiblePoints`), so a point 30 days back is out; a weigh-in for tomorrow is kept. A
  fixed range always spans its whole window on the x axis (a sparse series sits where its days are), "All" starts at
  the first weigh-in. The SVG is `aria-hidden`; the focusable wrapper has `role="slider"` with the point's date,
  weight and trend as value text (arrow keys, Home, End, Escape), and a table of the visible points is the text
  version. Tap and drag select the nearest point (touch), hover does for a mouse; focus shows the latest. The tooltip
  is a row above the plot, in the flow (at least 5rem, three short lines, `w-max max-w-full`), so a larger text size makes
  the row taller and never covers data, and the box wraps within the plot width, unclipped; a touch outside the chart puts it away, and an emptied series clears the pick. Up and Down move like Right and Left
  (a slider's keys), and the picked index is clamped to the series, which can shrink while the chart has focus. The range is stored under `kcal-weight-range`
  and read after mount, so server and first client render agree.
- **The weekly rate is shown signed in kg and percent.** "+0.24 kg/week" and "+0.33 %", "-0.30 kg/week" and
  "-0.43 %" for a loss, both rounded to 2 places and formatted with `en-GB` so tests and every device read the same;
  the trend and chart weights have one decimal.
- **`WeightInput` checks only that the date is a calendar date; the weight command checks `isAllowedLogDate`.** The
  rule needs today in the settings timezone, which a shared schema used by the form cannot know, and the repository
  keeps the plan's `saveWeight(db, input)` signature without `today`. Unlike the log repository (`assertLogDate` in
  `server/log/repo.ts`), `saveWeight` and `deleteWeight` do not check the date window, so the Task 4 commands must call
  `assertLogDate(date, ctx.today)` for save and delete. `saveWeight` still parses its input, like `saveContainer`, so a
  direct call cannot skip the kg limits or the calendar date check.
- **The `weights_kg_range` SQL check is written from `MIN_WEIGHT_KG` and `MAX_WEIGHT_KG`.** The schema builds the
  check with `sql.raw` of the constants, so the generated migration holds the literals 20 and 400 and a changed limit
  shows up as a schema diff instead of drifting from the Valibot schema. `updated_at` on an upsert comes from the
  column's `$onUpdate`, as in the other tables.
- **The `BatchRow` stale state of the spec is dropped; it cannot be shown.** Spec section 9 listed "stale" next to
  portions left and finished. Auto finish runs whenever active batches load (`activeBatches`), so an active batch past
  the threshold is finished before any row renders, and a stale active row cannot exist. `BatchRow` has portions left
  and finished only.
- **The batch editor keeps line ids by never losing them, and by starting from the stored lines after every save that
  changed them.** `BatchForm` edits `DraftIngredient`s that carry the stored line's `id`; `IngredientList` already
  spreads the line on an amount edit and re-inserts the same object on Undo, so only a new line has no id. A save
  gives new lines their ids on the server, which the form cannot know, so the batch page keys the form on the batch id
  plus its line ids: a save that added or removed lines remounts the form from the reloaded batch, a save without
  line changes, Finish and Reopen keep what is typed. The form is `inert` while a save runs, so no edit can slip in
  between the save and the ids. After the first save of a new batch it moves to `/recipes/batches/[id]` (replace
  state), where the key starts it from the stored lines.
- **Serving lines are priced from `ingredient.servingG`, mapped into the editor's `food.servingG`.** `batchDraft` sets
  `food.servingG` to the line's own serving weight (`BatchDetailIngredient.servingG`), the line's name and its own
  values as `snapshot`; `food` there is only what `AmountStep` and the row need. A line whose food is gone uses its
  own id as the food id, which the server accepts for a line that keeps its unit.
- **A new batch page loads `draftFromRecipe` and the recipe.** `draftFromRecipe` names foods by id only, so
  `batchDraftFromRecipe(input, recipe)` takes the fields from the draft and the lines (with their foods) from the
  recipe. An unknown `?recipe=` is a 404. Without it the page starts a one off with today, one portion and no lines.
  Cook batch is shown for a recipe that is not archived, from the stored recipe (not from unsaved edits).
- **`WeightField` stores only the net weight, and reports a problem through a bindable `error`.** The container is not
  saved with the batch, so a stored batch opens with no container and its net weight in "Cooked weight". Choosing a
  container keeps a number the person typed and reads it as the weight on the scale. While the field still holds the
  stored net weight (nothing typed yet), choosing a container empties the field and leaves `value` as it is, with a
  hint, until the scale weight is typed; choosing None again puts the stored weight back. A wrong weight (not a number, at or below
  the tare, over 20000 g) makes `value` null and sets `error`, which `BatchForm` uses to keep Save off with "Check the
  cooked weight" (a null value alone would save the batch as unweighed). The picker is a native `select`, which is the
  right control on iOS. `Input` gained `type="date"` for "Cooked on".
- **Containers are created inline with `saveContainer` at once, and managed in Settings.** The new container exists
  before the batch is saved. Settings lists them with edit (name and tare, `ContainerForm` in a sheet) and delete
  (a confirm sheet); batches keep their net weight.
- **Delete asks first, and finishing is a single tap.** Delete (batch) opens a confirm sheet; the button is off with
  "Logged batches can be finished, not deleted" while the batch has live entries, and a refusal from the server (an
  entry logged elsewhere in the meantime) shows the same message. Finish and Reopen act at once with a toast.
- **The Finished section is a collapsed `details`, each row with Reopen.** Latest 20, as `finishedBatches` returns
  them. The Recipes tab order is Active batches (with New batch), Recipes, Finished.
- **Batch e2e tests build their data through the UI and finish what they log on.** `e2e/batches.e2e.ts` uses days
  2020-07-10 to 2020-07-25 (slot, retry and project), unique names, and finishes each batch it logged on at the end,
  so other files' add sheets are not affected (`e2e/seed.sql` is unchanged). Logging from the batch page's Log button
  would log on today, so that test only checks the sheet opens at the amount step.

## 2026-11-06

- **Logging a batch reuses `AmountStep` through a `batch` prop, and an entry edit prices from the entry's own
  snapshot.** `AmountStep` takes either `food` or `batch` (a `BatchAmountSource` from `components/log/amount.ts`), not
  the plan's `{ kind: 'batch' }` source object, so no food caller changed. `batchSource(batch)` builds the source for
  logging (default 1 portion, preview by `batchEntrySnapshot`); `entryBatchSource(entry, portionG)` builds it for an
  edit by treating the entry as a batch whose totals are its snapshot and whose weight is its grams. A portion entry
  then rescales by amount over amount, and a switch to grams by grams over grams, exactly as `updateEntryAmount`
  does; a gram entry reaches portions through `portionG`. `previewBatchAmount` turns the domain's `RangeError` into
  null, and the step also checks the typed amount first, so an empty or zero field previews 0 kcal and never throws.
  A unit that is off (grams without a cooked weight, grams on an entry without grams, portions on a gram entry whose
  batch has lost its weight) stays visible and `aria-disabled` with the reason under the switch, which needed
  `disabled` on `SegmentedControl` options (the arrow keys skip them; `/design` shows it).
- **`DayData` carries `batches` and `batchPortionG`.** `suggestions(db, today, now)` returns the active batches too
  (this is where auto finish now runs on Today, a day page and `loadSuggestions`). `batchPortionG` maps the batch id
  of each batch entry on the day to the batch's current portion weight, finished batches included, null without a
  cooked weight (`portionWeights` in `server/batches/repo.ts`); `DayView` hands it to `EditEntrySheet`, so the
  grams to portions preview uses the weight the server converts with. Keyed by batch, not entry, because every entry
  of a batch shares it.
- **`addSheet.openBatch(batch)` sets `addSheet.batch`; the sheet's step is a writable `$derived` of it.** `show()`
  clears it and the sheet's `reset` clears it on close, so a later plain open starts at the search. On pages without a
  day the batch step waits for the fetched date (same loading and error state as Quick add) before it can log.
- **e2e batches are seeded by SQL before the server starts.** `saveBatch` is not in the build until the client
  imports it, and a second connection to the live database file would make D1 fail with SQLITE_BUSY, so
  `e2e/seed.sql` (run by `scripts/e2e-db-reset.sh` before the server holds the file, as for the trigger check)
  inserts one batch per test kind (`portions`, `grams`, `one off`, `search`), browser project and attempt (retry 0
  and 1): 16 rows named `E2E <kind> <project> <retry>`. A test only ever touches its own batch, so it passes alone, in
  any order and on a retry. `e2e/log-batches.e2e.ts` logs on past days of its own; `e2e/batches.e2e.ts` builds its
  data through the UI.
- **A batch line's serving weight is `grams / amount` of the stored line; no extra column.** `saveBatch`
  (`src/lib/server/batches/repo.ts`) prices a kept serving line from the weight it was saved with, so a food's later
  serving size change or loss never reaches it. A kept line in the same unit is accepted as it is (its food may have
  changed); a unit switch is checked against the food as it is now, and a g or ml line switched to servings takes the
  food's current serving size. `getBatch` returns each line's `servingG` from the same rule (and its `food`), so the
  batch editor prices servings as the server will. A line id must belong to the batch being saved, with the same
  food, once; anything else is `UnknownIngredientError` with the line's index, mapped to a result like the recipe line
  errors (`src/lib/server/batches/result.ts`). A logged batch's delete is a `batch_logged` result, unknown batch,
  recipe or container ids are a 404.
- **Batch entries are edited through `editAmount`.** `EditAmountInput` takes every log unit; the repository accepts
  only the food units for a food entry and only `portion` and `g` for a batch entry (400 otherwise, also when the
  schema is skipped). The same unit rescales the entry's snapshot by the amount ratio; a unit switch needs the stored
  grams (else 400 "This entry has no weight, so it can only change in portions") and rescales by grams. Grams to
  portions reads the batch only for its current portion weight, as a food entry reads only the food's serving weight;
  nutrition is never re-read. The log repository keeps its HTTP errors rather than a typed `UnitNotAvailableError`.
- **Auto finish runs inside `activeBatches`.** Activity is the latest of `created_at`, `updated_at` and the latest live
  entry's `logged_at`; `isStale` decides. Finish and reopen set `updated_at`, so a reopened batch gets 7 more days.
  Logging a batch entry and editing its amount also set the batch's `updated_at` to now in the same D1 batch (the
  entry's `logged_at` is on its own date, so a past date alone would not count); delete and restore do not, and
  `finished_at` is never touched.
- **`log_entries.batch_id` became a real reference by a table rebuild, with the pragma edited by hand.** drizzle-kit
  rebuilt `log_entries` in `drizzle/0020_batches.sql` between `PRAGMA foreign_keys=OFF` and `=ON`. D1 applies a
  migration as one transaction, where SQLite ignores `foreign_keys`, so the keys stay on; the migration uses
  `PRAGMA defer_foreign_keys = on` instead, which checks them at commit. The rebuild is safe because no table or
  trigger references `log_entries`, the copy names all 16 columns and every index is recreated.
  `src/lib/server/db/migrations.spec.ts` applies the migrations up to 0019, writes food, quick and soft deleted
  entries and a recipe, applies the rest and checks every row, column, index and trigger, plus
  `PRAGMA foreign_key_check`. The fallback (a plain column checked in the repository) was not needed. Batches with
  a live entry cannot be deleted (no cascade on `batch_id`); batch ingredients go with their batch.
- **Food entries have their own unit list.** `LOG_UNITS` gained `portion` (limit `MAX_PORTIONS` in `fitsUnit`), but
  `LogFoodInput` and the food amount step use `FOOD_LOG_UNITS` (`g`, `ml`, `serving`); `EditAmountInput` takes every
  log unit and the repository enforces food versus batch units (`gramsFor` in `server/log/repo.ts` refuses a portion
  for a food entry with a 400 even when a caller skips the schema).
- **Recipe saves report a refused line as a result, not an HTTP error; a missing recipe is a 404.** The recipe
  repository throws typed errors with user facing messages (`UnknownFoodError`, `UnitNotAvailableError`, both with the
  ingredient's `index`, and `RecipeNotFoundError`); it stays free of HTTP. The remote layer
  (`saveRecipeResult` in `src/lib/server/recipes/result.ts`, used by the `saveRecipe` command) maps them: the two line
  errors become `{ ok: false, reason: 'unknown_food' | 'unit_not_available', message, index }`, the same shape as
  `createFood`'s `barcode_taken`; `RecipeNotFoundError` becomes `error(404, message)`, because there is no line to
  mark. A result carries the index without widening `App.Error` for the whole app, and it is typed on the client.
  `RecipeForm` takes the line at `index` from the list it sent, marks that row with the message (`IngredientList`
  `errors`, keyed by the ingredient's client key) and keeps the mark until that line's amount or unit changes or it is
  removed. Any other failure shows "Could not save" and the button says Retry; the form is never cleared.
- **The editor starts from the server's grams, and leaving a dirty form asks first.** `recipeDraft`
  (`components/recipes/draft.ts`) maps `RecipeDetail` to the editor including each line's stored `grams`, so the
  editor's totals equal the list's for a serving of a food that lost its serving size. `UnsavedGuard`
  (`stores/unsaved.svelte.ts`) cancels an in app navigation while the form differs from what was loaded or last saved
  and asks "Discard changes?" in a Sheet; `beforeunload` covers reload and close. Dirty is a comparison with the saved
  snapshot, so changing a field back clears it and a successful save never blocks. Archiving allows the navigation
  without asking. Batches (3b) reuse the guard.
- **Recipe notes are a single line field for now.** There is no textarea in the design system yet; adding one is a
  design system change of its own. The schema allows 2000 characters.
- **A new recipe moves to its own address only once nothing is unsaved.** Edits made while the first save runs are not
  in the saved recipe, and moving to `/recipes/<id>` then would make the unsaved changes guard cancel the move and ask to
  discard them. `RecipeForm` keeps `savedId` from the first save (later saves update that recipe) and does the
  `replaceState` move after the first save that leaves the form clean. Disabling the fields while saving would have
  needed a `disabled` mode in `IngredientList` and its sheets.
- **Ingredient lines have their own unit list.** `INGREDIENT_UNITS` (`g`, `ml`, `serving`) in `schemas/fields.ts`
  is separate from `LOG_UNITS`, so adding `portion` to the log units for batches cannot make it a valid ingredient
  unit. `DraftIngredient` also carries an optional `id` and `snapshot` (a batch ingredient's own values per 100,
  priced instead of the food's), and an amount edit keeps every field but the stale `grams`.
- **A new recipe starts at 1 portion, and `/recipes/new` has no `load`.** Nothing to read for it; the add sheet inside
  the editor fetches its own recents. After the first save the form goes to `/recipes/<id>` with `replaceState`.
- **The AmountStep header shows the entry's own kcal per 100 when editing a logged entry.** In `AmountStep.svelte` (with `EditEntrySheet.svelte` passing the entry's values): the line
  "N kcal per 100 g" reads `per100 ?? food`, the same values as the preview, so a food edited after logging no longer
  shows a header that disagrees with the preview. Adding and recipe ingredient edits pass no `per100` and are unchanged.
- **Recipe serving lines follow the food's current serving size.** A recipe is a live template, not history, so
  `getRecipe` and `listRecipes` (`src/lib/server/recipes/repo.ts`) compute a `serving` line's grams at read time as
  amount times the food's current `serving_g`. When the food no longer has a serving size, the grams stored at the
  last save stand. g and ml lines keep grams equal to the amount. Saving again with a serving line whose food lost
  its serving size is refused (`UnitNotAvailableError`, carrying the line's index), and the recipe page shows that
  per line. Batches (phase 3b) still snapshot grams and nutrition when cooked.

## 2026-11-05

- **The scanner uses the `barcode-detector` ponyfill with a lazily loaded, self hosted zxing-wasm, and Scan lives in
  the search step.** `createDetector` (`src/lib/scanner/detector.ts`) uses the browser's own `BarcodeDetector` when
  present and otherwise `import('barcode-detector/ponyfill')`, so zxing never lands in Today's JS (checked in the
  build manifest: no entry's static imports reach it). The wasm comes from `zxing-wasm/reader/zxing_reader.wasm?url`
  (a direct dependency pinned to 3.1.6) instead of the ponyfill's default jsDelivr URL: no third party request. The
  service worker leaves `.wasm` out of its precache (about 1 MB that only scanners need); the browser's HTTP cache
  keeps the hashed file after the first scan. Scanning needs a connection anyway: the lookup is a server command. Only `ean_13`, `ean_8`, `upc_a` and `upc_e` reach the server as a format; other
  formats are sent as none and the length decides. The Scan button sits with Quick add and New food in
  `FoodSearch`, next to the search field, because the add sheet is where every way of logging starts; the camera
  opens only after the tap and is stopped when the step or the sheet goes away.
- **`/design` shows the parts of containers that call remote functions, not the containers.** `DayView`,
  `FoodSearch` and `EditEntrySheet` read or write through remote functions (delete, undo, edit, library and Open Food
  Facts search, `loadFood`), so a static section would either send real requests from a style guide or need those
  calls stubbed, which would no longer show the component as shipped. Their parts are on `/design`: `DateSwitcher`,
  `DayHero` and `EntryRow` for the day view; `FoodRow` and `Input` for search; `AmountStep`, `FoodForm`,
  `QuickAddForm` and `Sheet` for the edit sheet. `FoodSearch` itself is live on `/design` through the AddSheet
  section's button. Behavior is covered by the component specs (`DayView.svelte.spec.ts`, `AddSheet.svelte.spec.ts`)
  and the log e2e tests.
- **The BLV generics ship as 15 migrations of about 60 KB, not one of 873 KB.** `wrangler d1 migrations apply
--remote` sends a migration file as one request, which D1 limits to about 100 KB, and the first deploy would have
  hit that. `scripts/import-blv.ts` fills `0003_blv_foods_01` to `0017_blv_foods_15`; `0018_log_entries_deleted_at`
  follows. Nothing had been applied remotely, so the migrations were renumbered, not appended. A local dev database
  that applied the old `0003` and `0004` needs a reset (delete `.wrangler/state` and migrate again).
- **A custom food with a barcode that is already in the library is refused, naming the existing food.** `createFood`
  and `updateFood` (`foods.remote.ts`) look the barcode up first, archived foods included, and return
  `{ ok: false, reason: 'barcode_taken', food }` instead of hitting the unique index; the form shows "already in
  your library as X". Same rule as for Open Food Facts: the library wins, nothing is overwritten.
- **Editing a food never reaches logged entries, and editing an OFF or BLV food sets `edited_at`.** Entries hold
  nutrition snapshots (AGENTS.md rule), so the food form only changes what is logged from now on, and says so.
  `edited_at` makes OFF refreshes and BLV re-imports skip the row, so the fix survives. Custom foods do not need it.
- **Form fields validate on blur against the same Valibot schema the server uses.** `FoodForm` and `QuickAddForm`
  parse the whole form with `FoodInput` or `QuickInput` and show each field's own message once it was touched (all
  of them on submit). `orNull` now picks blank or the real schema from the input (`v.lazy`), not with a union, so a
  bad optional number says "Enter a number" instead of valibot's raw union text. `/design` shows the forms with a
  `preview` prop that validates but sends nothing.
- **The temporary daily target is two settings columns and a pure function.** `manual_target_kcal` and
  `manual_weight_kg` are saved or cleared together (`ManualTargetInput`, `saveTarget` command); macros come from
  `macroTargets` (1.8 g/kg protein, fat the larger of 25 % kcal and 0.6 g/kg, carbs the rest), shown live in
  Settings and on Today. Phase 4 reuses the function and replaces the inputs with `weekly_targets`. The e2e target
  test runs in the Chromium project only: the row is global, so two projects setting and clearing it would race.
- **Log entries are deleted softly (`deleted_at`), so Undo restores the same row by id.** The delete reaches the
  server at once (nothing is lost if the app closes during the 5 second Undo); `restoreEntry` clears the column.
  Every read of entries filters `deleted_at IS NULL`. A hard delete plus a client side re-insert would have needed
  the client to send nutrition back, which the server never accepts.
- **Writes are remote `command`s, followed by `await invalidateAll()`.** A command cannot refresh a page `load`
  (single flight refreshes cover `query` only), and the day, totals and recents must come from `load` so the service
  worker's cached navigation shows them offline. All commands validate with the shared schemas in
  `src/lib/schemas`. A failed refresh after a successful write is not a failed write: the UI keeps the result and
  the page catches up on its next load.
- **`ml` is logged as if 1 ml = 1 g.** `foods.nutrition_basis` is `g` or `ml`, values are per 100 of that unit, and
  the UI says "ml". A density model would add data nobody has for packaged drinks and little accuracy.
  `log_entries.grams` stores the gram equivalent of an amount so a unit switch on edit still scales correctly.
- **`logged_at` for another day is that date at the current local time of day.** Backfilled entries then sort
  sensibly among the day's entries instead of all landing at midnight or at the moment of backfilling.
- **Library wins on a barcode collision.** An OFF result whose barcode exists in `foods` uses the existing row and
  never overwrites it; barcode lookup includes archived foods and logging one unarchives it. A refresh only
  touches unedited OFF rows older than 180 days.
- **Phase 2 ships as two PRs.** 2a is foods and logging (schema, BLV import, OFF client and search, custom foods,
  add sheet, amount step, quick add, Today, manual target); 2b is the scanner. The split lets 2a deploy alone.

- **The add sheet lives in the app layout, opened through a store (`src/lib/stores/add-sheet.svelte.ts`).** The tab
  bar's centre button, the sidebar's button and Cmd or Ctrl K all call `addSheet.show()`, so one sheet serves every
  page. Day pages pass their date, recents and frequents (from `page.data`); other pages pass none and the sheet
  fetches today and the suggestions through `loadSuggestions` when it opens. Editing a logged food reuses
  `AmountStep` in `EditEntrySheet`, which DayView owns. Remote functions are called untracked inside effects:
  calling one reads and writes reactive state of its own, which otherwise reruns the effect forever.
- **OFF search stays on one shared limiter key; the e2e suite keeps to two OFF searches per browser project.** Keying
  the limiter per client would weaken the protection, because OFF limits the Worker's egress IP, not our user. The
  8 a minute budget then covers 4 searches per run (8 with a CI retry). Do not add a third OFF search test without
  changing that.
- **Open Food Facts text search uses search-a-licious (`https://search.openfoodfacts.org/search?q=`), product reads
  use the v2 API (`/api/v2/product/<barcode>`).** Checked live on 2026-11-05: `/cgi/search.pl` and `/api/v2/search`
  on `world.openfoodfacts.org` both answered 503 "Page temporarily unavailable" on every attempt (v2 search also
  has no full text parameter), while search-a-licious answered 200 with ranked hits (`hits[]`, `brands` as an array,
  only `_100g` nutriments, fields omitted when empty). Search hits without nutriments are dropped, so only complete
  products reach the user. The search host differs from the product host, so the Worker has two vars,
  `OFF_BASE_URL` and `OFF_SEARCH_URL`; e2e points both at `e2e/off-stub.mjs`. Fixtures in
  `src/lib/server/off/fixtures` are recorded responses (Nutella, Coca-Cola, unknown barcode, two searches) with
  unused nutriments trimmed; `product-serving-only.json` is synthetic, because no real per serving only product
  was worth a live search.
- **Two rate limit bindings for OFF, not one.** `OFF_PRODUCT_LIMITER` (namespace 1002, 12 a minute) and
  `OFF_SEARCH_LIMITER` (namespace 1003, 8 a minute) stay below OFF's 15 product reads and 10 searches, so a
  burst of searches never uses up barcode lookups. Like `AUTH_LIMITER` they count per Cloudflare location, so the
  cap is approximate. `OFF_CONTACT_EMAIL` is a Worker secret (`wrangler secret put OFF_CONTACT_EMAIL`) listed in
  `secrets.required`; set it before deploying.
- **OFF calls time out after 5 seconds and never throw.** The client returns `{ ok: false, reason }` with
  `rate_limited` (limiter refusal or HTTP 429) or `unavailable` (anything else), so a slow OFF cannot hold up
  logging a library food.

- **Passkey sign in runs its own client flow (`src/lib/passkey-sign-in.ts`), not `authClient.signIn.passkey`.**
  Better Auth fetches the challenge after the tap, and iOS Safari can drop the tap's user activation across that
  fetch, so the ceremony failed on the iPhone. The login page prefetches the challenge on load and the tap calls
  WebAuthn directly. The same options also drive passkey autofill (`autocomplete="username webauthn"`), since
  the server keeps one challenge cookie per browser. The page refreshes stale options every 30 seconds while
  visible and on return to the tab, and restarts the autofill with them. Accepted cost: every /login view writes
  a verification row, even for a password sign in. `@simplewebauthn/browser` stays pinned to the exact version
  `@better-auth/passkey` uses: `WebAuthnAbortService` is a module singleton, so two copies would stop one
  ceremony from aborting the other. Bump both together.
- **The email and password fields are always visible on /login.** In a closed `<details>`, 1Password on iOS
  found no login form.
- **CI deploys on push to `main`.** The full gate runs as parallel jobs (`static`, `unit`, `e2e`, `security`) on
  every pull request and on `main`; branch pushes without a PR rely on the local pre-push hook. e2e stays in CI
  (not only in the hook) because a `--no-verify` push or a GitHub UI merge would skip it. The `deploy` job needs them, runs only on `main`, and builds, then runs `db:migrate:remote` and `wrangler deploy`
  under a `deploy` concurrency group so two merges never deploy at once. One user, one environment, no staging:
  the gate is the safety net, and the migration runs before the new code ships, so migrations must stay
  backward compatible for one release.
- **Local Cloudflare access uses an Account API token in `.env` (`CLOUDFLARE_API_TOKEN`), not `wrangler login`.**
  The same token shape works for CI, it does not expire with a browser session, and agents never need an
  interactive login. Wrangler reads it from the environment.
- **Workers Rate Limiting is per Cloudflare location and eventually consistent.** The `AUTH_LIMITER` counts are
  not shared across locations, so an attacker spread over several locations gets more than 10 attempts a
  minute. Accepted for one user: passkeys are the main sign in, the account is single, and the limit exists to
  slow guessing, not to be exact.
- **Adding a passkey keeps Better Auth's fresh session rule (signed in within the last day).** A stolen long
  lived cookie must not be enough to plant a new credential. Sessions last a year, so most attempts hit
  `SESSION_NOT_FRESH`; the Security page explains it and offers "Sign in again", which signs out and returns to
  `/settings/security` after the next sign in.
- **Sign in and sign up are throttled by a Workers Rate Limiting binding (`AUTH_LIMITER`, 10 a minute per
  `cf-connecting-ip`).** Better Auth's limiter is off on Workers (it keys on `NODE_ENV`) and never sees the form
  actions, which call `auth.api` directly. The hook checks POST `/login`, `/setup`, `/api/auth/sign-in/*`,
  `/api/auth/sign-up/*` and `/api/auth/passkey/verify-authentication`; the API answers 429, the forms show a
  message. `wrangler dev` simulates the binding locally and passes a client sent `cf-connecting-ip` through,
  which the e2e fixture uses to give every test its own bucket.
- **A database trigger (`user_single_account`) also enforces the single account.** The hook answers first
  with a 403; the trigger stops two first run sign ups that race past it.
- **Sign up closes in a Better Auth `user.create.before` hook, not in the UI.** Every path that creates a
  user (email sign up, a direct API call, passkey first registration) runs through it, so a second account
  gets a 403 "Sign up is closed".
- **One server side route guard in `hooks.server.ts`, pure rules in `src/lib/server/guard.ts`.** Page
  navigations without a session redirect to `/login?redirectTo=...`; fetches, form posts and remote calls get
  a 401 so page code sees the failure. `__data.json` requests count as navigations, so SvelteKit's client
  router follows the redirect. Public prefixes match whole path segments only (`/setupx` is not public), and
  `/_app/remote/` (remote functions) is not public although `/_app/` is.
- **Sessions last a year and slide daily.** The installed iPhone app must survive relaunches.
- **Sign out deletes the `kcal-*` service worker caches.** Pages rendered for the session must not be
  reopened from the cache afterwards.
- **`wrangler.jsonc` declares `secrets.required`.** Otherwise `wrangler types` infers the Env type from
  whatever local `.env` or `.dev.vars` exists, and `wrangler types --check` fails on other machines.
- **Login and setup live in an `(auth)` route group.** They share a layout without the app shell that pads
  for the safe-area insets; URLs stay `/login` and `/setup`.

## 2026-11-04

- **Service worker caches same origin GET navigations, never `/api/*` or non GET.** `/` is server
  rendered, so it is not in the build or static file lists; caching each good navigation response lets the
  installed app open offline. Redirected responses are never cached (a redirected response cannot answer a
  navigation). The worker claims clients on activate but does not skip waiting, so an update takes over
  once the old app is fully closed.
- **Service worker lives in `src/service-worker/` with its own tsconfig.** SvelteKit 3 recommends this so
  the worker gets WebWorker types instead of DOM types.

- **Barcode lookups are global, never filtered by country.** 5 of 5 Lidl Switzerland test products were
  in Open Food Facts with full macros, but 4 were tagged only for other countries.

- **Hosting on Cloudflare Workers + D1 (free plan).** Single user load is far below free limits; keeps
  the overloaded Hetzner box out of the picture.
- **SvelteKit 3 from the start.** Stable since October 2026 (3.1.1); adapter-cloudflare 8 and Better Auth
  support it, so no later 2 to 3 migration.
- **SvelteKit + Svelte 5 + Tailwind 4 + Drizzle.** Known stack, light runtime on phones; React offers
  no advantage here.
- **Better Auth with passkeys, not Cloudflare Access.** Access logs in on an external domain, which
  breaks sessions in an installed iOS PWA.
- **Open Food Facts as the product source, BLV for generics.** Both free. foodrepo.org only redirects to
  OFF (checked 2026-11-04). Migros has no public API; scraping is excluded.
- **Barcode scanning with `barcode-detector` (zxing-wasm).** iOS Safari has no native BarcodeDetector;
  html5-qrcode is unmaintained.
- **Meal prep as recipe templates plus batch snapshots.** Ingredients are weighed raw; a batch is split
  into portions, optionally weighed cooked to log by grams. Snapshots keep history stable.
- **Log entries store a nutrition snapshot.** Editing a food never rewrites past days.
- **Online writes only, offline app shell.** Avoids a sync layer and its conflicts.
- **Adaptive TDEE with energy density 5000 kcal/kg, goal 0.35 percent bodyweight per week default.**
  See spec section 6.
- **Design system PDF kept local, not committed.** Third party content in a public repo.
