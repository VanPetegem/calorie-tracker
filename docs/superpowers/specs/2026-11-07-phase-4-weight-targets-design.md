# Phase 4: Weight, Targets, Adaptive TDEE, Onboarding

Date: 2026-11-07. Status: approved. Parent spec: `2026-11-04-calorie-tracker-design.md` (sections 5, 6, 7, 10).
This document only adds what the parent spec leaves open for phase 4. Where they disagree, this one wins for
phase 4 and the parent spec is updated in the same PR.

## 1. Intent

After phase 4 the daily target sets itself: a morning weigh-in takes one tap, the Weight tab shows the trend and
weekly gain, and every Monday the target adapts to what the scale and the log say about real expenditure.

Success: a weigh-in takes under 3 seconds from opening the Weight tab; the target on Today always matches the one in
Settings and the targets history; a person who eats the target for weeks gains close to the chosen rate.

Non-goals: body fat or measurements, several weigh-ins per day (the last one for a date wins), smart scale or Health
imports, meal timing, manual target override, a server side theme (theme stays a per device preference, as today),
backfilling targets for weeks the app was not opened.

Anti-goals: a past day's target changing after a weigh-in, a log edit or a settings change; the target jumping more
than 150 kcal between weeks from the adaptive part; any app page without a target once onboarding is done.

## 2. Delivery

Two PRs, each passing the full gate and deployable alone (user's call):

- **4a Weight**: `weights` table; Weight tab with entry, trend chart, weekly rate and history; trend math. The
  temporary manual target stays as it is.
- **4b Targets**: profile columns on `settings`, `weekly_targets`, onboarding with required redirect, formula and
  adaptive TDEE, target and macros from the current week, Settings profile and targets history, goal slope on the
  chart. Removes the manual target (user's call).

## 3. Schema

All ids, times and dates as in the parent spec.

**4a**

- `weights`: date (pk, local calendar date), kg (real, check 20 to 400), created_at, updated_at. Saving a date that
  exists replaces its kg.

**4b**

- `settings` gains: sex (`male` / `female`), birth_date (date), height_cm (real, 100 to 250), activity_level
  (`sedentary` / `light` / `moderate` / `active` / `very_active`, PAL 1.2 / 1.375 / 1.55 / 1.725 / 1.9),
  goal_rate_pct (real, one of 0.25 / 0.35 / 0.5, default 0.35), protein_g_per_kg (default 1.8, 1.2 to 3.0), fat_pct
  (default 0.25, 0.15 to 0.40), energy_density_kcal_per_kg (default 5000, 3000 to 7700). The profile fields are
  nullable; the profile is complete when sex, birth_date, height_cm and activity_level are all set.
- `settings` drops `manual_target_kcal`, `manual_weight_kg` and the `settings_manual_target_pair` check. The check
  forces a table rebuild; `migrations.spec.ts` applies the migrations up to 4a, writes a settings row with a timezone
  and a manual target, applies the rest and checks the row keeps its timezone and gets the defaults.
- `weekly_targets`: week_start (pk, a Monday), tdee_formula, tdee_adaptive (nullable: null when the gate fails),
  tdee_used, target_kcal, protein_g, carbs_g, fat_g, carbs_floored (boolean), trend_kg, rate_kg_per_week (nullable),
  valid_days, weigh_ins, computed_at. Values as computed, rounded only where the parent spec rounds.

## 4. Domain (pure, unit tested)

**4a** `src/lib/domain/trend.ts`

- `trendSeries(weights)`: weights sorted by date to `{ date, kg, trend }[]`. T_0 is the mean of the first up to 3
  weigh-ins; a gap of g days uses `a_eff = 1 - (1 - a)^g`, a = 0.1 (parent spec section 6.3).
- `trendOn(series, date)`: the trend on any date: the last trend at or before it, null before the first weigh-in.
- `weeklyRate(series, today)`: `7 x (T_today - T_(today-14)) / 14` in kg and percent of trend weight; null while
  there is no trend 14 days back.
- Constants: `TREND_ALPHA`, `RATE_WINDOW_DAYS` (14), `MIN_WEIGHT_KG` (20), `WEIGHT_STEP_KG` (0.1).

**4b** `src/lib/domain/tdee.ts` and `targets.ts`

- `bmr({ sex, kg, heightCm, ageYears })`, `ageOn(birthDate, date)` (whole years), `formulaTdee(bmr, level)`.
- `adaptiveTdee({ intakes, series, windowEnd, formulaTdee, rho })`: window is the 21 days ending the day before
  `windowEnd`; valid days have intake logged and at least 50 percent of the window's median logged intake; gate is at
  least 14 valid days and 6 weigh-ins in the window; returns `{ observed, blended, validDays, weighIns }` with
  `observed` and `blended` null when the gate fails (parent spec 6.6).
- `smoothTdee(blendedOrFormula, previousUsed)`: 0.7 previous plus 0.3 new, change clamped to +/-150; no previous
  means the new value is used as is.
- `targetKcal(tdeeUsed, trendKg, goalRatePct, rho)`: parent spec 6.7 (clamp 1.05 to 1.20, round to 10).
- `weekTarget(inputs)`: composes the above into one `weekly_targets` row. `macroTargets` gains the protein and fat
  rules from settings and uses trend weight.
- `weekStart(date)` in `dates.ts`: the Monday on or before a date.
- Constants for every number above, in `constants.ts`.

## 5. Weight tab (4a)

- **Entry card** at the top: today's date, a NumberInput prefilled with today's weigh-in, else the latest one, with
  -0.1 and +0.1 steppers; Save. Saving today again replaces it ("Updated" toast). The card says "Logged today" once
  today has a value.
- **Summary**: trend weight, weekly rate in kg and percent ("+0.24 kg/week, 0.33 %"), or "Rate after 14 days of
  weigh-ins".
- **Chart** (`WeightChart`, inline SVG, no chart library): raw weigh-ins as dots, trend as a line, range control
  30 days / 90 days / 1 year / All (SegmentedControl, remembered per device). Tabular numbers on the axis; the y axis
  fits the visible data with padding. Tap or hover on a dot shows date, weight and trend. An accessible table
  fallback lists the visible points. 4b adds the goal slope: a dashed line from the trend at the current week's
  start at the goal rate.
- **History**: newest first, date, weight and trend; tap a row to edit its weight (a stored weigh-in keeps its date,
  because saving is an upsert by date and a changed date would leave a copy); delete from a visible bin button on the
  row, with no row menu and no swipe, and a 5 s Undo that saves the same values again. Missed past days are added with
  an "Add weigh-in" button, which opens the same sheet with a date field (any date up to tomorrow).
- Empty state as today until the first weigh-in. Page data from `load`, cached by the service worker for reading
  offline; writes need a connection as everywhere else.

## 6. Targets (4b)

- **Week rows are made lazily.** Any server load that needs a target calls `currentTarget(ctx)`, which returns this
  week's row, computing and inserting it first when missing (insert ignores a conflict, so two loads at once are
  safe). The window ends the day before the week's Monday, so a row is the same no matter which day computes it.
  The previous row is the latest row before this week; weeks the app was not opened get no row.
- **A settings change recomputes this week's row** at once with the same window and previous row (user's call).
  Past rows never change. Weigh-ins and log edits never change a stored row; the next Monday picks them up.
- **Which target a day shows**: the row of its week, else the latest earlier row, else the earliest row (days
  logged before phase 4). Today, day pages, Settings and the Weight tab all read it this way.
- **Today hero** keeps its layout; the target and macros now come from the row. The carbs floored warning shows when
  `carbs_floored` is set.

## 7. Onboarding (4b)

- `(app)/+layout.server.ts` redirects every app page to `/onboarding` while the profile is incomplete (user's call).
  Remote functions are not redirected. `/onboarding` redirects to `/` once the profile is complete.
- `/onboarding` is one page without the tab bar: sex, birth date, height, today's weight (prefilled from the latest
  weigh-in), activity level with the parent spec's hint to choose one level lower, goal rate (default 0.35). Fields
  validate on blur with `ProfileInput`. Submit saves the profile and today's weigh-in in one D1 batch, computes this
  week's row and shows the result: target kcal, protein, fat, carbs and a two sentence explanation (formula now,
  adapts weekly once there are 14 days of logs and 6 weigh-ins). "Start" goes to Today.

## 8. Settings (4b)

- **Profile**: the onboarding fields except weight, editable in one form; Save recomputes this week.
- **Goal**: goal rate presets 0.25 / 0.35 / 0.5 percent per week with the kg per week each means at the current
  trend.
- **Macro rules**: protein g per kg, fat percent. **Advanced** (collapsed): energy density.
- **Targets history**: one row per stored week, newest first: week, target kcal, TDEE used, formula or adaptive
  (with valid days), rate. Latest 26, then "Show all".
- The "Daily target (temporary)" card and `saveTarget` are removed.

## 9. Remote functions and schemas

`src/lib/schemas/weight.ts`: `WeightInput` (date, kg), `DeleteWeightInput`. `src/lib/schemas/settings.ts`:
`ProfileInput`, `OnboardingInput` (profile plus kg and goal rate), `GoalInput`, `MacroRulesInput`; `ManualTargetInput`
is removed. Commands in `src/routes/(app)/weight/weight.remote.ts` and `settings/profile.remote.ts`, followed by
`await invalidateAll()`. Dates must pass `isAllowedLogDate`. Repositories in `src/lib/server/weights/` and
`src/lib/server/targets/`.

## 10. New UI components (each on `/design` with all states)

4a: `WeightEntry` (empty, prefilled, logged today, saving, error), `WeightChart` (empty, one point, sparse, dense,
each range), `WeightRow`, `WeightSummary` (with and without rate). 4b: `ProfileForm` (shared by onboarding and
Settings), `GoalPicker`, `TargetsHistory`, `TargetExplainer`, goal slope on `WeightChart`.

## 11. Tests

- **Domain**: trend with first three weigh-ins, gaps of 1 and 5 days, single weigh-in; rate before and after 14 days;
  BMR against Mifflin's published examples; age on and before a birthday; adaptive gate at 13/14 valid days and 5/6
  weigh-ins, median filter, blend weights; smoothing first week and clamp both ways; target clamp at 1.05 and 1.20 and
  rounding; macros with custom rules; `weekStart` on Monday and Sunday.
- **Server (Miniflare D1)**: weight upsert and delete; `currentTarget` creates once, is idempotent, uses the previous
  row and the right window; settings change recomputes only this week; target lookup for a past week, a gap week and
  a day before the first row; onboarding writes profile, weigh-in and row in one batch; migration keeps settings (4b).
- **E2E (WebKit iPhone and desktop Chromium)**: the setup project completes onboarding after creating the account, so
  every other test starts with a profile and the onboarding flow is covered once. 4a: log today's weight with the
  stepper, edit a past weigh-in, delete with Undo, chart range switch. 4b: changing the goal rate in Settings changes
  Today's target to the value Settings shows; targets history lists this week. Weight e2e tests use past dates of
  their own (as batch tests do) and never assert exact target numbers; exact math lives in domain and server tests.

## 12. Parent spec updates (same PR)

Section 5: `weights.updated_at`; settings columns as in section 3 here, without `theme` (stays per device) and
without the manual target; `weekly_targets` columns `carbs_floored`, `valid_days` (was `data_days`), `weigh_ins`,
`computed_at`. Section 6: window ends the day before the week's Monday; no backfill of skipped weeks.

## 13. Left to the builder

Exact component boundaries, chart axis ticks and tooltip look, copy wording, the stepper's long press repeat, how the
history paginates beyond the first page, and the migration check outcome (recorded in `docs/decisions.md`).
