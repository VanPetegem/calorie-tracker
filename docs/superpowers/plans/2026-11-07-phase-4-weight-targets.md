# Phase 4: Weight, Targets, Adaptive TDEE, Onboarding Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. One implementer subagent per task, one review per task.

**Goal:** Weigh-ins with a trend chart and weekly rate (4a), then targets that come from a profile and adapt weekly to the trend and the log, with required onboarding (4b).

**Architecture:** Pure trend, TDEE and target math in `src/lib/domain/trend.ts`, `tdee.ts` and `targets.ts`. Repositories in `src/lib/server/weights/` and `src/lib/server/targets/`. A week's target row is made lazily by `currentTarget(ctx)` on any load that needs a target, and recomputed by settings writes. Pages load data in `+page.server.ts` (cached by the service worker); writes are remote `command`s with shared Valibot schemas, followed by `await invalidateAll()`.

**Spec:** `docs/superpowers/specs/2026-11-07-phase-4-weight-targets-design.md` (wins for phase 4) and parent spec sections 5, 6, 7, 10. Repo rules: `AGENTS.md`.

## Global Constraints

- Everything in the phase 2 and phase 3 plans' Global Constraints still holds (domain purity, tokens only, `/design` sections, 44 px targets, reduced motion, `parseDecimal`, gate after every task, Svelte MCP autofixer, no remote deploy or migration).
- Every number of parent spec section 6 is a named constant in `constants.ts`; no literal in repositories or components.
- A stored `weekly_targets` row changes only through a settings write for the current week. Weigh-ins, log edits and loads never change a stored row; past weeks never change.
- Days are local calendar dates in the settings timezone; weeks start on Monday (`weekStart`).
- Limits: weight 20 to 400 kg; height 100 to 250 cm; age 16 to 100 at onboarding; goal rate one of 0.25 / 0.35 / 0.5; protein 1.2 to 3.0 g/kg; fat 0.15 to 0.40; energy density 3000 to 7700. Dates pass `isAllowedLogDate`.
- Multi row writes (onboarding, settings change plus recompute) run in one `db.batch([...])`.

## Review Focus

1. Concurrent first loads of a week create exactly one row, and the row is identical whichever day of the week computes it. Tests in Task 7.
2. Adaptive gate boundaries (13 vs 14 valid days, 5 vs 6 weigh-ins), the median filter and the +/-150 clamp both ways. Tests in Task 5.
3. The 4b migration keeps the settings row (timezone) and every other table untouched; `PRAGMA foreign_key_check` passes. Test in Task 6.
4. No app page renders without a profile, and `/onboarding` cannot be reached with one; remote functions are not redirected. Tests in Task 8.
5. Today, day pages, Settings and Weight show the same target for the same date, including a gap week and a day before the first row. Tests in Tasks 7 and 9.

## Execution table

| Task | PR | Deliverable | Model | Effort |
| ---- | -- | ----------- | ----- | ------ |
| 1 | 4a | Domain: trend series, trend on date, weekly rate | haiku | xhigh |
| 2 | 4a | `weights` schema, migration, Valibot schema, repository | opus | high |
| 3 | 4a | Weight components and chart | sonnet | high |
| 4 | 4a | Weight page, commands, e2e, docs; final 4a review | sonnet | high |
| 5 | 4b | Domain: BMR, age, formula and adaptive TDEE, smoothing, target, macros, week start | opus | high |
| 6 | 4b | Settings rebuild, `weekly_targets`, migration check, Valibot schemas | opus | high |
| 7 | 4b | Targets repository, lazy week rows, recompute, day loader switch | opus | high |
| 8 | 4b | Onboarding redirect, page, profile form, e2e setup | sonnet | high |
| 9 | 4b | Settings sections, Weight target card and goal slope, e2e, docs; final 4b review | sonnet | high |

Per task review: sonnet high (sonnet xhigh for Tasks 2, 6, 7). Final branch review after Task 4 and after Task 9: opus, xhigh. Branches: `phase-4a-weight`, then `phase-4b-targets` from `main` after 4a merges.

## File Structure

```
src/lib/domain/
  trend.ts              trendSeries, trendOn, weeklyRate (4a)
  tdee.ts               bmr, ageOn, formulaTdee, adaptiveTdee, smoothTdee (4b)
  targets.ts            + targetKcal, weekTarget; macroTargets takes rules (4b)
  dates.ts              + weekStart (4b)
  constants.ts          + trend, TDEE, target and profile constants
src/lib/schemas/
  weight.ts             WeightInput, DeleteWeightInput (4a)
  settings.ts           ProfileInput, OnboardingInput, GoalInput, MacroRulesInput; ManualTargetInput removed (4b)
src/lib/server/
  db/schema.ts          + weights (4a); settings profile columns, weekly_targets (4b)
  weights/repo.ts       listWeights, saveWeight, deleteWeight (4a)
  targets/repo.ts       currentTarget, targetFor, recomputeCurrentWeek, targetsHistory, saveOnboarding (4b)
  settings/repo.ts      profile and rules writes; manual target removed (4b)
  log/day.ts            target from targetFor (4b)
src/lib/components/weight/
  WeightEntry, WeightSummary, WeightRow, WeightChart, EditWeightSheet (4a)
src/lib/components/settings/
  ProfileForm, GoalPicker, TargetsHistory, TargetExplainer (4b)
src/routes/(app)/
  weight/+page.server.ts, +page.svelte, weight.remote.ts (4a)
  +layout.server.ts     onboarding redirect (4b)
  settings/profile.remote.ts (4b); target.remote.ts removed
src/routes/onboarding/+page.server.ts, +page.svelte, onboarding.remote.ts (4b, no tab bar)
e2e/weight.e2e.ts (4a), e2e/targets.e2e.ts and onboarding in e2e/auth.setup.ts (4b)
```

---

## PR 4a

### Task 1: Domain, trend

**Files:**
- Create: `src/lib/domain/trend.ts`, `src/lib/domain/trend.spec.ts`
- Modify: `src/lib/domain/constants.ts` (and its spec if it lists constants)

**Interfaces:**
- Consumes: `addDays` from `dates.ts`.
- Produces:
  - `type WeighIn = { date: string; kg: number }`, `type TrendPoint = WeighIn & { trend: number }`
  - `trendSeries(weighIns: WeighIn[]): TrendPoint[]` (sorts by date; T_0 = mean of the first up to 3; gap of g days uses `a_eff = 1 - (1 - TREND_ALPHA)^g`; empty in, empty out)
  - `trendOn(series: TrendPoint[], date: string): number | null`
  - `weeklyRate(series: TrendPoint[], today: string): { kg: number; pct: number } | null`
  - Constants `TREND_ALPHA = 0.1`, `RATE_WINDOW_DAYS = 14`, `MIN_WEIGHT_KG = 20`, `WEIGHT_STEP_KG = 0.1`.
- [ ] **Step 1: Write failing tests**: one weigh-in gives trend = kg; first three 70, 71, 72 start at 71; daily 70 then 71 moves 0.1 of the way; a 5 day gap uses `1 - 0.9^5`; unsorted input sorts; `trendOn` before the first, on and between weigh-ins; rate null at 13 days of history and set at 14; pct relative to today's trend.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the gate.
- [ ] **Step 5: Commit** `feat(domain): weight trend and weekly rate`.

### Task 2: Weights schema and repository

**Files:**
- Modify: `src/lib/server/db/schema.ts`, `schema.spec.ts`, `src/lib/schemas/schemas.spec.ts`
- Create: `drizzle/0021_*.sql` (generated), `src/lib/schemas/weight.ts`, `src/lib/server/weights/repo.ts`, `repo.spec.ts`

**Interfaces:**
- Produces:
  - Table `weights` (date pk, kg real with check 20 to 400, created_at, updated_at); type `Weight`.
  - `WeightInput = strictObject({ date, kg: between(MIN_WEIGHT_KG, MAX_WEIGHT_KG) })`, `DeleteWeightInput = { date }`.
  - `listWeights(db): Promise<WeighIn[]>` (oldest first), `latestWeight(db): Promise<WeighIn | null>`, `saveWeight(db, input)` (upsert, keeps `created_at`, sets `updated_at`), `deleteWeight(db, date)` (idempotent).
- [ ] **Step 1: Write failing tests**: schema rejects 19.9, 400.1, extra keys and a bad date; repo upsert replaces kg and keeps created_at; delete twice is fine; list is ordered; the SQL check rejects 10 kg when the schema is skipped.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement**, `pnpm db:generate`, `pnpm db:migrate:local`.
- [ ] **Step 4: Run** the gate.
- [ ] **Step 5: Commit** `feat(weight): schema and repository`.

### Task 3: Weight components and chart

**Files:**
- Create: `src/lib/components/weight/{WeightEntry,WeightSummary,WeightRow,WeightChart,EditWeightSheet}.svelte`, `chart.ts` (pure scale and path helpers) with `chart.spec.ts`, component specs for `WeightEntry` and `WeightChart`
- Modify: `src/routes/(app)/design/+page.svelte`

**Interfaces:**
- Consumes: `NumberInput`, `IconButton`, `Card`, `SegmentedControl`, `Sheet`, `ListItem`, `TrendPoint`, `weeklyRate`.
- Produces:
  - `WeightEntry` props `{ today: string; todayKg: number | null; lastKg: number | null; onsave(kg: number): Promise<void> }`: stepper by `WEIGHT_STEP_KG`, validates with `WeightInput` on blur, saving and error states, "Logged today" when `todayKg` is set.
  - `WeightSummary` props `{ trendKg: number | null; rate: { kg: number; pct: number } | null }`.
  - `WeightChart` props `{ series: TrendPoint[]; today: string; goal?: { from: string; trendKg: number; kgPerWeek: number } | null }` with internal range state (30 / 90 / 365 / all, persisted in `localStorage` in try/catch). SVG with dots, trend polyline, optional dashed goal line, token colors only, tooltip on tap or hover, visually hidden table of the visible points.
  - `chart.ts`: `visiblePoints(series, today, rangeDays)`, `yDomain(points, padKg)`, `scale(domain, range)`.
  - `WeightRow` props `{ point: TrendPoint; onedit; ondelete }`; `EditWeightSheet` props `{ open (bindable); point: WeighIn | null; today: string; onsave(input: WeightInput): Promise<void> }`.
- [ ] **Step 1: Write failing tests**: chart helpers (range filter boundaries, flat data gets padding, single point); WeightEntry: + and - change by 0.1 without float drift (70.3 not 70.30000001), blur on 10 shows the limit message, logged today state; WeightChart renders a table row per visible point and no goal line without `goal`.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement**, with `/design` sections (spec section 10, 4a states).
- [ ] **Step 4: Run** the gate.
- [ ] **Step 5: Commit** `feat(weight): entry, summary, history row and chart`.

### Task 4: Weight page, commands, e2e, docs

**Files:**
- Create: `src/routes/(app)/weight/+page.server.ts`, `weight.remote.ts`, `e2e/weight.e2e.ts`
- Modify: `src/routes/(app)/weight/+page.svelte`, `docs/architecture.md`, `docs/decisions.md`, parent spec section 5 (`weights.updated_at`)

**Interfaces:**
- Produces: commands `saveWeight(WeightInput)`, `deleteWeight(DeleteWeightInput)` (each calls `assertLogDate(date, ctx.today)` from `server/log/repo.ts`, 400 otherwise; tests for a date after tomorrow on save and delete). Load `{ today, series: TrendPoint[], todayKg, lastKg, trendKg, rate }`.
- Behaviour: spec section 5. Delete shows a 5 s Undo toast that calls `saveWeight` with the old values. History is newest first. An "Add weigh-in" button opens `EditWeightSheet` with `point` null for a missed past day. Update spec section 5 to match what Task 3 decided: delete by a visible button on the row (no row menu), a stored weigh-in keeps its date, past days are added through "Add weigh-in".
- [ ] **Step 1: Write failing tests**: e2e on its own past dates per project and retry: log today's weight with the stepper and see it in history; edit a past weigh-in; delete with Undo restores it; chart range switch keeps working; empty state copy before the first weigh-in is covered in the component spec instead (other tests share the database).
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement** and update the docs.
- [ ] **Step 4: Run** the full gate.
- [ ] **Step 5: Commit** `feat(weight): weight tab`.
- [ ] **Step 6: Final 4a branch review** (opus, xhigh), fix findings, open the PR.

---

## PR 4b

### Task 5: Domain, TDEE and targets

**Files:**
- Create: `src/lib/domain/tdee.ts`, `tdee.spec.ts`
- Modify: `src/lib/domain/targets.ts`, `targets.spec.ts`, `dates.ts`, `dates.spec.ts`, `constants.ts`

**Interfaces:**
- Consumes: `trendOn`, `TrendPoint`, `addDays`.
- A week row's trend and rate come from `trendSeries(weighIns, seedUntil)` (`seedUntil` is the second parameter, see `src/lib/domain/trend.ts`) with `seedUntil = addDays(weekStart, -1)`, built from the weigh-ins dated before `weekStart` only. The `series` handed to `weekTarget` and `adaptiveTdee` is that series, so a row does not depend on weigh-ins logged during its week (Review Focus 1).
- Produces:
  - `type Sex = 'male' | 'female'`, `type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'`, `PAL: Record<ActivityLevel, number>`.
  - `bmr({ sex, kg, heightCm, ageYears }): number`, `ageOn(birthDate, date): number`, `formulaTdee(bmr, level): number`.
  - `adaptiveTdee({ intakes: Record<string, number>, series, windowEnd: string, formulaTdee, rho }): { observed: number | null; blended: number | null; validDays: number; weighIns: number }`.
  - `smoothTdee(next: number, previousUsed: number | null): number`.
  - `targetKcal(tdeeUsed, trendKg, goalRatePct, rho): number`.
  - `macroTargets(kcal, weightKg, rules)` keeps its shape; rules come from settings.
  - `weekTarget(input: { weekStart; profile; rules; series; intakes; previousUsed }): WeekTargetRow` (all `weekly_targets` columns except `computed_at`).
  - `weekStart(date): string`.
  - Constants: `ADAPTIVE_WINDOW_DAYS = 21`, `MIN_VALID_DAYS = 14`, `MIN_WEIGH_INS = 6`, `VALID_INTAKE_FRACTION = 0.5`, `BLEND_PRIOR_DAYS = 7`, `TDEE_SMOOTHING = 0.7`, `MAX_WEEKLY_TDEE_CHANGE = 150`, `TARGET_MIN_FACTOR = 1.05`, `TARGET_MAX_FACTOR = 1.2`, `TARGET_ROUND_KCAL = 10`, `GOAL_RATES = [0.25, 0.35, 0.5]`, `DEFAULT_GOAL_RATE = 0.35`, `DEFAULT_ENERGY_DENSITY = 5000`, profile and rule limits.
- [ ] **Step 1: Write failing tests**: spec section 11 domain list; BMR fixtures for both sexes; window excludes `windowEnd`; a day at 49 percent of the median is invalid; observed TDEE on a flat trend equals mean intake; blend with n = 14; first week unsmoothed; smoothing clamp +150 and -150; target clamp low and high and rounding to 10; `weekTarget` with the gate failing has `tdeeAdaptive` null and uses the formula; a series built from the weigh-ins before `weekStart` with `seedUntil = addDays(weekStart, -1)` gives the same row whether or not weigh-ins from the week itself exist.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the gate.
- [ ] **Step 5: Commit** `feat(domain): formula and adaptive TDEE, weekly target`.

### Task 6: Settings rebuild, weekly targets table, schemas

**Files:**
- Modify: `src/lib/server/db/schema.ts`, `schema.spec.ts`, `src/lib/server/db/migrations.spec.ts`, `src/lib/schemas/settings.ts`, `schemas.spec.ts`
- Create: `drizzle/0022_*.sql` (generated, `PRAGMA defer_foreign_keys` as in 0020 if a rebuild appears)

**Interfaces:**
- Produces: settings columns and `weekly_targets` per spec section 3 (4b), with SQL checks for the enums and ranges; type `WeeklyTarget`. Valibot `ProfileInput` (sex, birthDate, heightCm, activityLevel), `OnboardingInput` (profile plus kg and goalRatePct), `GoalInput`, `MacroRulesInput` (proteinGPerKg, fatPct, energyDensity). `ManualTargetInput` removed with its tests.
- [ ] **Step 1: Write failing tests**: migration check (spec Review Focus 3): apply up to 0021, write settings with timezone and a manual target, a weight, a log entry; apply the rest; the row keeps its timezone and gets defaults, other rows are unchanged, foreign key check passes; schema rejects age 15 and 101, height 99, goal rate 0.4, extra keys.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement**, `pnpm db:generate`, `pnpm db:migrate:local`. Record the migration outcome in `docs/decisions.md`.
- [ ] **Step 4: Run** the gate (code that read the manual target is removed or stubbed to compile; Task 7 replaces it).
- [ ] **Step 5: Commit** `feat(targets): profile settings and weekly targets schema`.

### Task 7: Targets repository and day loader

**Files:**
- Create: `src/lib/server/targets/repo.ts`, `repo.spec.ts`
- Modify: `src/lib/server/settings/repo.ts` and spec, `src/lib/server/log/day.ts` and spec, `src/lib/server/log/repo.ts` (daily intake query), delete `src/routes/(app)/settings/target.remote.ts`

**Interfaces:**
- Consumes: Task 5 domain, `listWeights`, `AppContext`.
- The row's weights: `currentTarget` takes `listWeights`, keeps only weigh-ins dated before `weekStart` and builds `trendSeries(thoseWeighIns, addDays(weekStart, -1))`. Weigh-ins from the week itself (including one for tomorrow) never enter the row, so it is identical whichever day of the week computes it (Review Focus 1).
- Produces:
  - `dailyIntakes(db, from, to): Promise<Record<string, number>>` (live entries only).
  - `isProfileComplete(settings): boolean`.
  - `currentTarget(ctx): Promise<WeeklyTarget>` (insert on conflict do nothing, then read; throws a typed `ProfileIncompleteError` without a profile).
  - `targetFor(ctx, date): Promise<WeeklyTarget>` (own week, else latest earlier, else earliest; ensures the current week exists first).
  - `recomputeCurrentWeek(ctx, settingsPatch)`: settings update and row replace in one `db.batch`.
  - `saveOnboarding(ctx, input: OnboardingInput)`: profile, today's weigh-in and the week row in one batch.
  - `targetsHistory(db, limit?)`.
  - `DayTarget` gains nothing but is built from a row; `loadDay` uses `targetFor(ctx, date)`.
- [ ] **Step 1: Write failing tests**: spec section 11 server list; two `currentTarget` calls at once leave one row; a row computed on Monday equals one computed on Sunday with the same data; a weigh-in after the row exists does not change it; a weigh-in dated inside the week (including tomorrow) before the row is computed does not change it either, and the row equals one computed from only the weigh-ins before `weekStart`; `recomputeCurrentWeek` leaves last week's row byte for byte; `targetFor` cases; soft deleted entries do not count as intake.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the gate.
- [ ] **Step 5: Commit** `feat(targets): weekly target rows and day target`.

### Task 8: Onboarding

**Files:**
- Create: `src/routes/(app)/+layout.server.ts`, `src/routes/onboarding/+page.server.ts`, `+page.svelte`, `onboarding.remote.ts`, `src/lib/components/settings/{ProfileForm,TargetExplainer}.svelte` with specs, a pure `onboardingRedirect(pathname, profileComplete)` helper with spec
- Modify: `e2e/auth.setup.ts` (complete onboarding after creating the account), `src/routes/(app)/design/+page.svelte`, the guard tests if `/onboarding` needs a rule

**Interfaces:**
- Produces: command `completeOnboarding(OnboardingInput): WeeklyTarget`. `ProfileForm` props `{ value; withWeight: boolean; submitLabel; onsubmit }`, validates on blur. `TargetExplainer` props `{ target: WeeklyTarget }`.
- Behaviour: spec section 7. Weight prefilled from the latest weigh-in up to today. Not `latestWeight` from `src/lib/server/weights/repo.ts`: it returns the newest date, which can be tomorrow. Use `loadWeight(ctx).lastKg` or a new repository query with `date <= today`; test that a weigh-in for tomorrow is not the prefill.
- [ ] **Step 1: Write failing tests**: redirect helper: app pages redirect without a profile, `/onboarding` redirects to `/` with one, remote paths never redirect; ProfileForm blur errors; e2e setup completes onboarding and lands on Today with a target in the hero.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement**, with `/design` sections.
- [ ] **Step 4: Run** the full gate.
- [ ] **Step 5: Commit** `feat(onboarding): profile and first target`.

### Task 9: Settings, Weight target card, e2e, docs

**Files:**
- Create: `src/routes/(app)/settings/profile.remote.ts`, `src/lib/components/settings/{GoalPicker,TargetsHistory}.svelte` with specs, `e2e/targets.e2e.ts`
- Modify: `src/routes/(app)/settings/+page.svelte` and `+page.server.ts` (manual target card removed), `src/routes/(app)/weight/+page.server.ts` and `+page.svelte` (this week card: target, TDEE used, formula or adaptive with valid days; goal slope), `DayHero` (carbs floored note), e2e that relied on "no target" hero states, `docs/architecture.md`, `docs/decisions.md`, parent spec sections 5 and 6 (spec section 12)

**Interfaces:**
- Produces: commands `saveProfile(ProfileInput)`, `saveGoal(GoalInput)`, `saveMacroRules(MacroRulesInput)`, each calling `recomputeCurrentWeek` and returning the new row.
- Behaviour: spec sections 6 and 8.
- [ ] **Step 1: Write failing tests**: GoalPicker shows kg per week at the given trend; TargetsHistory marks formula vs adaptive; e2e: changing the goal rate updates Settings and Today to the same target; history lists this week; the Weight tab shows the goal line.
- [ ] **Step 2: Run**; fail.
- [ ] **Step 3: Implement** and update the docs.
- [ ] **Step 4: Run** the full gate.
- [ ] **Step 5: Commit** `feat(targets): settings, targets history, goal slope`.
- [ ] **Step 6: Final 4b branch review** (opus, xhigh), fix findings, open the PR.
