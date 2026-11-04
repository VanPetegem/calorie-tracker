# Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed, installable, passkey-protected SvelteKit 3 PWA at `kcal.avp.software` with the full design system and app shell, ready for feature phases.

**Architecture:** SvelteKit 3 on Cloudflare Workers (adapter-cloudflare 8) with D1 through Drizzle. Design tokens are CSS custom properties per theme, mapped into Tailwind 4 `@theme` with the default palette removed, so only semantic tokens exist. Better Auth (email/password bootstrap plus passkeys) guards every route from `hooks.server.ts`.

**Tech Stack:** SvelteKit 3.1, Svelte 5.57 (runes), Vite 8, TypeScript 6, Tailwind CSS 4.3, Drizzle ORM 0.45 + drizzle-kit 0.31, Better Auth 1.7 + `@better-auth/passkey`, wrangler 4, Vitest 4 (browser mode via `vitest-browser-svelte` for components), Playwright 1.6x, `@lucide/svelte`, `@vite-pwa/assets-generator`, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-04-calorie-tracker-design.md` (sections 2, 7, 8, 9, 10, 11, 12 phase 1)

## Global Constraints

- Node >= 22.17, pnpm. SvelteKit 3 conventions: env through `src/env.ts` (`defineEnvVars`) and `$app/env/private`; `#lib/*` import alias.
- TypeScript strict; Svelte 5 runes only.
- Semantic tokens only: no raw hex or arbitrary Tailwind values in components (`bg-[#...]`, `text-[13px]` are forbidden). Tailwind default color, font size and radius scales are removed.
- Type scale (px): 11 xs, 13 sm, 15 base, 18 lg, 22 2xl, 28 3xl, 36 4xl, 48 5xl. Spacing base 4 px. Touch targets at least 44 x 44 px.
- Dark theme values: bg `#09090B`, surface `#131316`, border `#27272A`, text `#FAFAFA`, text-muted `#A1A1AA`, brand `#6366F1` family. Light theme also required. System preference by default with manual override.
- Motion: 100/200/300 ms; ease-out enter, ease-in exit, ease-in-out move; `prefers-reduced-motion` disables transitions.
- Icons: Lucide, 2 px stroke, 20 px default, 24 px navigation.
- Every new UI component gets a section on the `/design` route showing all of its states.
- Never commit `.env`, `.dev.vars` or secrets; document variables in `.env.example`.
- Verification gate after every task: `pnpm check && pnpm lint && pnpm test && pnpm test:e2e`.

## Review Focus

1. A Swiss iPhone decimal keypad types `,` not `.`: NumberInput must accept `72,5` and `72.5` as 72.5 and reject `7,2,5`. Test in Task 3.
2. After the first account exists, a direct `POST /api/auth/sign-up/email` must be rejected (403), not only hidden in the UI. Test in Task 6.
3. The installed iPhone app must stay logged in when relaunched: the session cookie expires no sooner than 360 days out. Test in Task 6.
4. Unauthenticated `fetch`/form requests get 401 (not an HTML redirect), page navigations redirect to `/login?redirectTo=...`, and `redirectTo` only accepts same-origin relative paths (no `//evil.com`). Test in Task 6.
5. On an iPhone viewport the tab bar sits above the home indicator (safe-area inset) and every tab is at least 44 px tall; at 1024 px and wider a sidebar replaces it. Test in Task 5.

## Execution table

| Task | Deliverable | Model | Effort |
| ---- | ----------- | ----- | ------ |
| 1 | Scaffold, tooling, gate green | haiku | xhigh |
| 2 | Design tokens and themes | sonnet | high |
| 3 | Core components + `/design` route | sonnet | high |
| 4 | Sheet and toast with undo | sonnet | high |
| 5 | App shell, navigation, PWA | sonnet | high |
| 6 | Auth: setup, login, passkeys, guard | opus | high |
| 7 | Cloudflare deploy and CI/CD (with the user) | sonnet | high |

## File Structure

```
src/
  app.html                         theme bootstrap script, PWA meta, safe-area viewport
  env.ts                           env var declarations (ORIGIN, BETTER_AUTH_SECRET)
  hooks.server.ts                  auth instance per request + access guard
  service-worker.ts                app shell caching
  routes/
    layout.css                     tokens, themes, Tailwind @theme
    +layout.svelte                 root: css, Toaster
    login/ setup/ setup/passkey/   auth pages (public)
    (app)/+layout.svelte           shell: TabBar / Sidebar
    (app)/+page.svelte             Today (empty state for now)
    (app)/recipes/ weight/ settings/ design/
  lib/
    design/tokens.ts               canonical token values per theme
    design/contrast.ts             WCAG contrast helpers
    design/theme.ts                theme preference read/write
    components/ui/*.svelte         primitives
    components/shell/*.svelte      TabBar, Sidebar, nav config
    stores/toasts.svelte.ts        toast queue + undo
    utils/decimal.ts               parseDecimal
    auth-client.ts                 Better Auth client with passkey plugin
    server/auth.ts                 Better Auth server config
    server/guard.ts                pure access decisions
    server/db/{index,schema,auth.schema}.ts
drizzle/                           SQL migrations (drizzle-kit generate)
e2e/                               Playwright specs + auth setup
scripts/e2e-db-reset.sh
.github/workflows/ci.yml
docs/architecture.md
```

---

### Task 1: Scaffold and tooling

**Files:**
- Create: everything produced by `sv create` (copied in), `src/routes/+page.svelte`, `e2e/smoke.e2e.ts`
- Modify: `.gitignore`, `.env.example`, `.env`, `package.json`, `wrangler.jsonc`, `drizzle.config.ts`, `playwright.config.ts`, `src/routes/+layout.svelte`, `src/lib/server/db/schema.ts`
- Delete: `src/routes/demo/`, `src/lib/vitest-examples/`, `src/routes/page.svelte.e2e.ts`

**Interfaces:**
- Produces: scripts `check`, `lint`, `test`, `test:e2e`, `verify`, `db:generate`, `db:migrate:local`, `db:migrate:remote`; D1 binding `DB`; migrations dir `drizzle/`; `getDb(d1)` in `src/lib/server/db/index.ts`; `createAuth(d1)` in `src/lib/server/auth.ts`; Playwright projects `chromium-desktop` and `webkit-iphone`.

- [ ] **Step 1: Scaffold into a temp dir and copy in (keeps existing README, .gitignore, .env files)**

```bash
TMP=$(mktemp -d)
pnpm dlx sv@1.2.0 create "$TMP/kcal" --template minimal --types ts --no-install \
  --add prettier eslint "vitest=usages:unit,component" "playwright=demo:no" \
  "tailwindcss=plugins:none" "sveltekit-adapter=adapter:cloudflare+cfTarget:workers" \
  "drizzle=database:d1" "better-auth=demo:password"
rsync -a --exclude README.md --exclude .gitignore --exclude .env --exclude .env.example "$TMP/kcal/" ./
rm -rf src/routes/demo src/lib/vitest-examples src/routes/page.svelte.e2e.ts
```

- [ ] **Step 2: Merge `.gitignore`**: append these lines to the existing `.gitignore` (the others are already present):

```gitignore
!.env.test
vite.config.js.timestamp-*
vite.config.ts.timestamp-*
playwright/.auth/
```

- [ ] **Step 3: Replace `.env.example`**

```dotenv
# App origin (Better Auth base URL)
ORIGIN="http://localhost:5173"

# Better Auth: generate with `openssl rand -base64 32`
BETTER_AUTH_SECRET=""

# Cloudflare (deploys, D1 migrations)
CLOUDFLARE_ACCOUNT_ID=""
CLOUDFLARE_DATABASE_ID=""
CLOUDFLARE_API_TOKEN=""

# Open Food Facts requires a contact in the User-Agent (used from phase 2)
OFF_CONTACT_EMAIL=""
```

Then align the local `.env` with it without changing the existing secret:

```bash
sed -i '' -e 's/^BETTER_AUTH_URL=.*/ORIGIN="http:\/\/localhost:5173"/' -e 's/^D1_DATABASE_ID=/CLOUDFLARE_DATABASE_ID=/' .env
grep -E '^(ORIGIN|BETTER_AUTH_SECRET|CLOUDFLARE_DATABASE_ID)=' .env | cut -d= -f1
```

Expected: the three key names printed.

- [ ] **Step 4: `package.json`**: set `"name": "kcal"` and replace `scripts` with:

```json
{
  "dev": "vite dev",
  "build": "wrangler types --check && vite build",
  "preview": "wrangler dev .svelte-kit/cloudflare/_worker.js --port 4173",
  "prepare": "svelte-kit sync || echo ''",
  "check": "wrangler types --check && svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
  "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
  "lint": "prettier --check . && eslint .",
  "format": "prettier --write .",
  "test": "vitest --run",
  "test:unit": "vitest",
  "test:e2e": "playwright test",
  "e2e:install": "playwright install chromium webkit",
  "verify": "pnpm check && pnpm lint && pnpm test && pnpm test:e2e",
  "gen": "wrangler types",
  "db:generate": "drizzle-kit generate",
  "db:migrate:local": "wrangler d1 migrations apply DB --local",
  "db:migrate:remote": "wrangler d1 migrations apply DB --remote",
  "auth:schema": "auth generate --config src/lib/server/auth.ts --output src/lib/server/db/auth.schema.ts --yes"
}
```

- [ ] **Step 5: `wrangler.jsonc`**: set `"name": "kcal"` and add the D1 binding (the id is replaced in Task 7):

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "kcal",
    "database_id": "00000000-0000-0000-0000-000000000000",
    "migrations_dir": "drizzle"
  }
]
```

- [ ] **Step 6: `drizzle.config.ts`** (generate only; migrations are applied with wrangler)

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	verbose: true,
	strict: true
});
```

- [ ] **Step 7: Remove the demo table** from `src/lib/server/db/schema.ts` so it only contains:

```ts
export * from './auth.schema';
```

- [ ] **Step 8: Root layout and placeholder page**

`src/routes/+layout.svelte`:

```svelte
<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>kcal</title>
</svelte:head>

{@render children()}
```

`src/routes/+page.svelte`:

```svelte
<h1>kcal</h1>
```

- [ ] **Step 9: Playwright config**: replace `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	retries: process.env.CI ? 1 : 0,
	use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
	webServer: {
		command: 'pnpm build && pnpm preview --var ORIGIN:http://localhost:4173',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	},
	projects: [
		{ name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'webkit-iphone', use: { ...devices['iPhone 15'] } }
	]
});
```

- [ ] **Step 10: Write the smoke test** `e2e/smoke.e2e.ts`:

```ts
import { expect, test } from '@playwright/test';

test('home renders', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('kcal');
});
```

- [ ] **Step 11: Install and generate types**

```bash
pnpm install
pnpm gen
pnpm e2e:install
```

Expected: `worker-configuration.d.ts` created; Playwright browsers installed.

- [ ] **Step 12: Run the gate**

Run: `pnpm verify`
Expected: all four commands pass; Playwright runs 2 tests (one per project). If `vitest --run` fails with "No test files found", add `passWithNoTests: true` to the `test` block in `vite.config.ts` and rerun.

- [ ] **Step 13: Commit**

```bash
git add -A
git status --short | grep -E '\.env$|\.dev\.vars' && echo "STOP: secret staged" || true
git commit -m "chore: scaffold SvelteKit 3 app on Cloudflare Workers with D1, Drizzle, Better Auth, Tailwind 4"
```

---

### Task 2: Design tokens and themes

**Files:**
- Create: `src/lib/design/tokens.ts`, `src/lib/design/contrast.ts`, `src/lib/design/theme.ts`, `src/lib/design/tokens.spec.ts`, `src/lib/design/contrast.spec.ts`, `src/lib/design/theme.spec.ts`, `e2e/theme.e2e.ts`
- Modify: `src/routes/layout.css`, `src/app.html`

**Interfaces:**
- Consumes: Task 1 scaffold.
- Produces:
  - `themes: Record<'dark' | 'light', Record<ColorToken, string>>` and `type ColorToken = 'bg' | 'surface' | 'surface-raised' | 'border' | 'text' | 'text-muted' | 'brand' | 'brand-solid' | 'on-brand' | 'success' | 'warning' | 'danger' | 'protein' | 'carbs' | 'fat'` in `tokens.ts`.
  - `contrastRatio(a: string, b: string): number` in `contrast.ts`.
  - `type ThemePreference = 'system' | 'light' | 'dark'`, `getThemePreference(): ThemePreference`, `setThemePreference(p: ThemePreference): void` (writes `localStorage['kcal-theme']`, sets `document.documentElement.dataset.theme` and the `theme-color` meta), `resolveTheme(p, prefersDark: boolean): 'light' | 'dark'` in `theme.ts`.
  - Tailwind utilities: `bg-bg`, `bg-surface`, `bg-surface-raised`, `border-border`, `text-text`, `text-text-muted`, `text-brand`, `bg-brand-solid`, `text-on-brand`, `text-success|warning|danger`, `bg-protein|carbs|fat`, `text-xs..text-5xl` per the scale, `rounded-sm|md|lg|full` (6/10/16 px/full), `shadow-sm|md|lg`, `ease-out|ease-in|ease-in-out`.

Token values (start here; adjust any value that fails a contrast test and keep `tokens.ts` and `layout.css` identical):

| Token | Dark | Light | Use |
| ----- | ---- | ----- | --- |
| bg | #09090B | #FAFAFA | page |
| surface | #131316 | #FFFFFF | cards |
| surface-raised | #1C1C21 | #FFFFFF | sheets, menus |
| border | #27272A | #E4E4E7 | dividers |
| text | #FAFAFA | #09090B | body |
| text-muted | #A1A1AA | #52525B | secondary |
| brand | #818CF8 | #4F46E5 | brand text, focus ring |
| brand-solid | #4F46E5 | #4F46E5 | primary button fill |
| on-brand | #FFFFFF | #FFFFFF | text on brand-solid |
| success | #22C55E | #15803D | |
| warning | #F59E0B | #B45309 | |
| danger | #EF4444 | #DC2626 | |
| protein | #38BDF8 | #0369A1 | macro |
| carbs | #FBBF24 | #B45309 | macro |
| fat | #F472B6 | #BE185D | macro |

Steps:

- [ ] **Step 1: Failing tests**
  - `contrast.spec.ts`: `contrastRatio('#FFFFFF', '#000000')` ≈ 21 (to 2 decimals), `contrastRatio('#777777', '#FFFFFF')` ≈ 4.48, symmetric in argument order, accepts 3 and 6 digit hex.
  - `tokens.spec.ts`, for both themes: text pairs at least 4.5:1 (`text`, `text-muted`, `brand`, `danger` on `bg`, `surface` and `surface-raised`; `on-brand` on `brand-solid`); graphic pairs at least 3:1 (`protein`, `carbs`, `fat`, `success`, `warning`, `brand` on `surface`). Also parse `src/routes/layout.css` with `fs.readFileSync` and assert each token's value appears in the matching theme block (`--kc-<token>: <value>;` inside `:root[data-theme='dark']` / `:root[data-theme='light']`), so CSS and TS cannot drift.
  - `theme.spec.ts`: `resolveTheme('system', true) === 'dark'`, `resolveTheme('system', false) === 'light'`, explicit values win.
- [ ] **Step 2: Run** `pnpm test` and confirm the failures are missing modules.
- [ ] **Step 3: Implement** `contrast.ts` (WCAG 2.x relative luminance), `tokens.ts`, `theme.ts`.
- [ ] **Step 4: `layout.css`**:
  - `@import 'tailwindcss';`.
  - Theme blocks define `--kc-*` variables for both themes.
  - `@theme inline` first resets `--color-*: initial; --text-*: initial; --radius-*: initial; --shadow-*: initial;`, then maps `--color-<token>: var(--kc-<token>)` and defines the type scale with line heights (headings 1.2, body 1.5, xs/sm labels 1.2), radii, three shadows, and easing curves (`--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`, `--ease-in: cubic-bezier(0.7, 0, 0.84, 0)`, `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`).
  - Base layer: `html { color-scheme: light dark }`, `body` uses `bg-bg text-text`, the system font stack `-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif`, `font-variant-numeric: tabular-nums`, `-webkit-tap-highlight-color: transparent`, and a `:focus-visible` outline of 2 px `var(--kc-brand)` with 2 px offset.
  - `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 0ms !important; animation-duration: 0ms !important; } }`.
- [ ] **Step 5: `app.html`**:
  - Add `<meta name="theme-color" content="#09090B">`.
  - Add an inline `<script>` in `<head>`, before `%sveltekit.head%`, that runs before paint. It reads `localStorage['kcal-theme']` inside try/catch, defaulting to `system`. It resolves the preference with `matchMedia('(prefers-color-scheme: dark)')` and sets `document.documentElement.dataset.theme` and the theme-color meta. When the preference is `system`, it also re-applies on `matchMedia` change.
  - Keep the logic identical to `resolveTheme`, and comment that the two must stay in sync.
- [ ] **Step 6: E2E** `e2e/theme.e2e.ts`:
  - With `page.emulateMedia({ colorScheme: 'dark' })`, `getComputedStyle(document.body).backgroundColor` is `rgb(9, 9, 11)`. With `light`, it is `rgb(250, 250, 250)`.
  - After `localStorage.setItem('kcal-theme', 'light')` and a reload under dark emulation, the background is light.
  - `html[data-theme]` is set on `domcontentloaded`, which guards against a flash of the wrong theme.
- [ ] **Step 7: Gate**: `pnpm verify`. Expected: all pass.
- [ ] **Step 8: Commit**: `git commit -m "feat(design): semantic tokens, light and dark themes, contrast tests"`.

---

### Task 3: Core components and `/design` route

**Files:**
- Create in `src/lib/components/ui/`: `Button.svelte`, `IconButton.svelte`, `Input.svelte`, `NumberInput.svelte`, `SegmentedControl.svelte`, `Card.svelte`, `Badge.svelte`, `ProgressBar.svelte`, `MacroBar.svelte`, `Skeleton.svelte`, `EmptyState.svelte`, `ListItem.svelte`, `index.ts` (barrel)
- Create: `src/lib/utils/decimal.ts`, `src/lib/utils/decimal.spec.ts`, `src/lib/components/ui/*.svelte.spec.ts` (one per component with behavior), `src/routes/design/+page.svelte`, `e2e/design.e2e.ts`
- Modify: `package.json` (add `@lucide/svelte`)

**Interfaces:**
- Consumes: Task 2 tokens and utilities.
- Produces (props; all components accept `class` for layout-only additions):
  - `Button`: `variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'` (default primary), `size?: 'sm' | 'md' | 'lg'` (heights 36/44/52 px; `sm` keeps a 44 px hit area via padding or a pseudo-element), `loading?: boolean`, `disabled?: boolean`, `disabledReason?: string` (rendered as visually hidden text linked by `aria-describedby` and as a visible hint below when focused), `href?: string` (renders `<a>`), `type?`, `onclick?`, `children: Snippet`, `icon?: Component`.
  - `IconButton`: `label: string` (required, `aria-label`), `icon: Component`, `variant?: 'ghost' | 'secondary'`, 44 x 44 px.
  - `Input`: `label: string`, `value: string` (`$bindable`), `hint?`, `error?`, `disabled?`, `readonly?`, `type?`, `inputmode?`, `autocomplete?`, `onblur?`. It covers six states (default, hover, focus, filled, error, disabled). Errors are passed in by the parent on blur; the component never validates while typing.
  - `NumberInput`: `label`, `value: number | null` (`$bindable`), `unit?: string` (suffix), `min?`, `max?`, `step?`, `decimals?: number` (default 1), `error?`. It renders `inputmode="decimal"`. It keeps the raw text while typing and commits `parseDecimal(text)` on blur, setting a format error if the result is null.
  - `parseDecimal(input: string): number | null` in `decimal.ts`: trims, accepts one `,` or `.` as the decimal separator, allows a leading `-` only if `allowNegative` is passed (`parseDecimal(input, { allowNegative?: boolean })`), and rejects empty strings, multiple separators, letters and thousands separators.
  - `SegmentedControl<T extends string>`: `options: { value: T; label: string }[]`, `value: T` (`$bindable`), `label: string`. It renders `role="radiogroup"` with `role="radio"` items, and ArrowLeft/ArrowRight moves the selection.
  - `Card`: `children`, `padding?: 'sm' | 'md'`, `as?: 'section' | 'div'`.
  - `Badge`: `tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger'`, `children`.
  - `ProgressBar`: `value: number`, `max: number`, `tone?: 'brand' | 'protein' | 'carbs' | 'fat'`, `label: string`. It renders `role="progressbar"` with aria values. The fill is clamped to 100%, and `data-over="true"` is set when value > max (shown with a distinct end cap, not an error color, since going over is fine when gaining).
  - `MacroBar`: `macro: 'protein' | 'carbs' | 'fat'`, `current: number`, `target: number`. It shows the label, `current / target g` in tabular numbers, and a ProgressBar.
  - `Skeleton`: `width?`, `height?`, `rounded?`. Its pulse is disabled under reduced motion.
  - `EmptyState`: `icon: Component`, `title: string`, `body: string`, `action?: Snippet`.
  - `ListItem`: `title`, `subtitle?`, `leading?: Snippet`, `trailing?: Snippet`, `href?` or `onclick?`. Min height 56 px; renders a link, a button or a plain row.

Steps:

- [ ] **Step 1: Failing tests**
  - `decimal.spec.ts`:
    - `'72,5' → 72.5`, `'72.5' → 72.5`, `' 80 ' → 80`, `'0,25' → 0.25`.
    - These return `null`: `'7,2,5'`, `'1.000,5'`, `''`, `'abc'`, `'-1'` (without `allowNegative`).
    - `'-1'` with `allowNegative` returns `-1`.
  - Component specs (vitest-browser-svelte, `render` + `page` locators):
    - Button: disabled with `disabledReason` exposes the reason through `aria-describedby`; loading sets `aria-busy` and blocks clicks; `href` renders a link.
    - NumberInput: typing `72,5` then blurring commits `72.5` to the bound value; `7,2` followed by `,5` shows a format error after blur and no error while typing; `max` violation shows an error.
    - SegmentedControl: ArrowRight changes the selection and calls the bound setter.
    - ProgressBar: value 2500 of max 2000 has `aria-valuenow="2500"`, `data-over="true"` and a fill width of 100%.
- [ ] **Step 2: Run** `pnpm test`. Expected: the failures are missing modules.
- [ ] **Step 3: Implement** `decimal.ts` and the components. Use only token utilities. Transitions are 100 ms on hover/active and 200 ms on press feedback, with ease-out. The focus ring comes from the global `:focus-visible` rule. Load `svelte:svelte-core-bestpractices` and run the Svelte autofixer MCP on each component.
- [ ] **Step 4: `/design` route**: a page with one section per component (heading `id`s match component names), every variant, size and state listed in this task, both themes viewable via a theme SegmentedControl that calls `setThemePreference`, and the type scale, color tokens (swatches with names), spacing scale, radii and shadows.
- [ ] **Step 5: E2E** `e2e/design.e2e.ts`: `/design` shows a section heading for every component in `index.ts` (import the barrel's export names list from a `componentNames` array exported by `index.ts`); every `button` and `[role=radio]` on the page has a bounding box of at least 44 px high (the `sm` button included, through its hit area).
- [ ] **Step 6: Gate**: `pnpm verify`. Expected: all pass.
- [ ] **Step 7: Commit**: `git commit -m "feat(ui): core components, decimal parsing, design system page"`.

---

### Task 4: Sheet and toasts with undo

**Files:**
- Create: `src/lib/components/ui/Sheet.svelte`, `src/lib/components/ui/Toaster.svelte`, `src/lib/stores/toasts.svelte.ts`, `src/lib/stores/toasts.svelte.spec.ts`, `src/lib/components/ui/Sheet.svelte.spec.ts`
- Modify: `src/lib/components/ui/index.ts` (+`componentNames`), `src/routes/+layout.svelte` (mount `Toaster`), `src/routes/design/+page.svelte`

**Interfaces:**
- Consumes: Task 3 components.
- Produces:
  - `Sheet`: `open: boolean` (`$bindable`), `title: string`, `description?: string`, `children: Snippet`, `footer?: Snippet`, `onclose?: () => void`.
    - Built on a native `<dialog>` with `showModal()`.
    - Below 640 px it is a bottom sheet: full width, top radius `lg`, max height 90dvh, a grab handle, and `padding-bottom: env(safe-area-inset-bottom)`.
    - At 640 px and wider it is a centered dialog, max width 480 px.
    - It closes on Escape, on a backdrop click and on a close IconButton.
    - Enter is 300 ms ease-out (slide/scale) and exit is 200 ms ease-in. Neither animates under reduced motion.
    - Body scroll is locked while open, and focus returns to the opener on close.
  - `toasts` (class instance, runes): `show(opts: { message: string; tone?: 'neutral' | 'success' | 'danger'; action?: { label: string; run: () => void }; durationMs?: number }): string` returns an id. It also has `dismiss(id: string): void` and `items: ToastItem[]`. The default duration is 5000 ms; a toast with an action lasts at least 5000 ms.
  - `withUndo(opts: { message: string; apply: () => void; revert: () => void | Promise<void> }): void` calls `apply()` immediately and shows a toast with an "Undo" action that runs `revert()` and dismisses the toast.
  - `Toaster`: an `aria-live="polite"` region at the bottom, offset above the tab bar (`bottom: calc(env(safe-area-inset-bottom) + 72px)` below 1024 px, 24 px above that), with at most 3 visible.

Steps:

- [ ] **Step 1: Failing tests**
  - `toasts.svelte.spec.ts` (fake timers):
    - `show` adds an item, and it is gone after 5000 ms.
    - `dismiss` removes it.
    - The 4th toast pushes out the oldest.
    - `withUndo` calls `apply` once; invoking the action calls `revert` once and removes the toast; letting it expire never calls `revert`.
  - `Sheet.svelte.spec.ts`:
    - Setting `open` to true shows a dialog with the title as its accessible name.
    - Escape closes it and sets `open` to false.
    - A backdrop click closes it.
    - Focus returns to the trigger button.
- [ ] **Step 2: Run** `pnpm test`. Expected: these specs fail.
- [ ] **Step 3: Implement**, mount `<Toaster />` in the root layout, and add Sheet and Toast sections to `/design` (the toast demo is a delete with undo).
- [ ] **Step 4: Gate**: `pnpm verify`. Expected: all pass.
- [ ] **Step 5: Commit**: `git commit -m "feat(ui): sheet and toast with undo"`.

---

### Task 5: App shell, navigation and PWA

**Files:**
- Create:
  - Shell components: `src/lib/components/shell/nav.ts`, `TabBar.svelte`, `Sidebar.svelte`.
  - App routes:
    - `src/routes/(app)/+layout.svelte`.
    - `src/routes/(app)/+page.svelte` (Today).
    - `src/routes/(app)/recipes/+page.svelte`.
    - `src/routes/(app)/weight/+page.svelte`.
    - `src/routes/(app)/settings/+page.svelte`.
  - PWA files:
    - `src/service-worker.ts`.
    - `static/manifest.webmanifest`.
    - `static/icon.svg`.
    - `pwa-assets.config.ts`.
    - The generated icons in `static/`.
  - E2E: `e2e/shell.e2e.ts`, `e2e/pwa.e2e.ts`.
- Move: `src/routes/design/` to `src/routes/(app)/design/`
- Delete: `src/routes/+page.svelte` (replaced by `(app)/+page.svelte`), `e2e/smoke.e2e.ts` (covered by shell tests)
- Modify: `src/app.html`, `package.json` (add `@vite-pwa/assets-generator` dev dependency and an `icons` script)

**Interfaces:**
- Consumes: Tasks 2 to 4.
- Produces:
  - `navItems: { href: string; label: string; icon: Component }[]` in `nav.ts`, in this order: Today `/`, Recipes `/recipes`, Weight `/weight`, Settings `/settings`.
  - `isActive(href: string, pathname: string): boolean`. `/` is active only on exactly `/`; other items are active on a prefix match.
  - Shell layout: below 1024 px it renders `TabBar` fixed at the bottom; at 1024 px and wider it renders `Sidebar`. Main content has a max width of 640 px, centered.
  - Each page has an `h1` with the page name and an `EmptyState` describing what will appear there:
    - Today: "Nothing logged yet" / "Food you log today shows up here with your calories and macros."
    - Recipes: "No recipes yet" / "Add a recipe from raw ingredients, then cook batches and log portions."
    - Weight: "No weigh-ins yet" / "Log your morning weight to see your trend and weekly gain."
    - Settings: profile placeholder text plus a link to `/design`.

Steps:

- [ ] **Step 1: Failing tests**
  - `src/lib/components/shell/nav.spec.ts`: `isActive('/', '/')` is true, `isActive('/', '/recipes')` is false, `isActive('/recipes', '/recipes/abc')` is true.
  - `e2e/shell.e2e.ts`:
    - Webkit-iphone project:
      - A `navigation` landmark labelled "Primary" is visible at the bottom.
      - Each of the 4 links is at least 44 px tall.
      - The bar's bottom padding equals the computed `env(safe-area-inset-bottom)`. Assert that the bar has `padding-bottom` computed from the inset by checking that the element's style contains `safe-area-inset-bottom`.
      - Tapping Weight navigates and sets `aria-current="page"`.
    - Chromium-desktop project at 1280 px wide: a sidebar navigation is visible and the tab bar is hidden.
  - `e2e/pwa.e2e.ts` (chromium only):
    - `GET /manifest.webmanifest` returns JSON with `display: "standalone"`, `start_url: "/"` and icons at 192 and 512 px.
    - `link[rel=manifest]` and `link[rel=apple-touch-icon]` exist.
    - After the service worker is ready, `context.setOffline(true)` plus a reload of `/` still renders the "Today" heading.
- [ ] **Step 2: Run** `pnpm test` and `pnpm test:e2e`. Expected: the new tests fail.
- [ ] **Step 3: Implement** the nav, TabBar (Lucide `House`, `CookingPot`, `Scale`, `Settings` at 24 px, labels at 11 px) and Sidebar, the `(app)` layout, and the pages.
- [ ] **Step 4: PWA**
  - Manifest: name "kcal", short_name "kcal", background and theme `#09090B`, `display: standalone`.
  - `icon.svg`: a simple glyph on brand-solid. Generate the icons with `pnpm icons` (`pwa-assets-generator --preset minimal-2023 static/icon.svg`).
  - `app.html`:
    - Viewport `width=device-width, initial-scale=1, viewport-fit=cover`.
    - `apple-mobile-web-app-capable`, `mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style=black-translucent`.
    - A manifest link and an apple-touch-icon.
  - `service-worker.ts`:
    - Precaches `build` and `files` into `kcal-${version}` and deletes other caches on activate.
    - Navigations are network first, falling back to the cached response for that URL and then to the cached `/`.
    - Static assets are cache first.
    - It never caches `/api/*` or non-GET requests.
- [ ] **Step 5: Gate**: `pnpm verify`. Expected: all pass.
- [ ] **Step 6: Commit**: `git commit -m "feat(shell): tab bar, sidebar, page shells, installable PWA with offline shell"`.

---

### Task 6: Auth (setup, login, passkeys, guard)

**Files:**
- Create:
  - Server: `src/lib/server/guard.ts`, `src/lib/server/guard.spec.ts`, `src/lib/auth-client.ts`.
  - Setup and login routes:
    - `src/routes/setup/+page.server.ts` and `+page.svelte`.
    - `src/routes/setup/passkey/+page.svelte`.
    - `src/routes/login/+page.server.ts` and `+page.svelte`.
  - Settings: `src/routes/(app)/settings/security/+page.svelte`.
  - E2E: `e2e/auth.setup.ts`, `e2e/auth.e2e.ts`, `e2e/passkey.e2e.ts`.
  - Migrations: `scripts/e2e-db-reset.sh` and `drizzle/0000_*.sql` (generated).
- Modify: `src/lib/server/auth.ts`, `src/lib/server/db/auth.schema.ts` (regenerated), `src/hooks.server.ts`, `src/routes/(app)/settings/+page.svelte` (links to Security, sign out), `playwright.config.ts`, `package.json` (add `@better-auth/passkey`)

**Interfaces:**
- Consumes: `createAuth(d1)` and `getDb(d1)` from Task 1; components from Tasks 3 and 4.
- Produces:
  - `createAuth(d1: D1Database)` config:
    - `emailAndPassword: { enabled: true, minPasswordLength: 12 }`.
    - `session: { expiresIn: 60 * 60 * 24 * 365, updateAge: 60 * 60 * 24 }`.
    - `passkey({ rpID: new URL(ORIGIN).hostname, rpName: 'kcal', origin: ORIGIN })`.
    - `databaseHooks.user.create.before` throws `APIError('FORBIDDEN', { message: 'Sign up is closed' })` when the user table already has at least 1 row.
    - `sveltekitCookies` stays the last plugin.
  - `hasAnyUser(d1: D1Database): Promise<boolean>` exported from `src/lib/server/auth.ts`.
  - `decideAccess(input: { pathname: string; search: string; method: string; accept: string | null; secFetchMode: string | null; hasSession: boolean }): { kind: 'allow' } | { kind: 'redirect'; location: string } | { kind: 'deny'; status: 401 }` in `guard.ts`.
    - Public paths: `/login`, `/setup`, `/api/auth/` prefix, `/_app/` prefix, `/manifest.webmanifest`, `/service-worker.js`, `/favicon`, `/robots.txt`, and icon files (`/pwa-`, `/apple-touch-icon`, `/maskable-`, `/icon.svg`).
    - A navigation is `method === 'GET'` and (`secFetchMode === 'navigate'` or `accept` includes `text/html`).
    - Unauthenticated navigations redirect to `/login?redirectTo=<encoded path+search>`; other unauthenticated requests are denied with 401.
  - `safeRedirect(target: string | null): string` in `guard.ts` returns `target` only if it starts with `/` and not `//` or `/\`; otherwise it returns `/`.
  - `authClient` in `auth-client.ts`: `createAuthClient({ plugins: [passkeyClient()] })`.
  - Page flows:
    - `/setup`: if a user already exists, redirect to `/login`. Otherwise show name, email and password (12+ chars). Submitting signs up, then redirects to `/setup/passkey`.
    - `/setup/passkey`: "Add Face ID / Touch ID" (`authClient.passkey.addPasskey()`), then go to `/`. "Skip" goes to `/`.
    - `/login`: if no user exists, redirect to `/setup`. The primary action is "Sign in with passkey" (`authClient.signIn.passkey()`). Below it, an email and password fallback form is shown behind a disclosure. On success, go to `safeRedirect(redirectTo)`.
    - `/settings/security`: list passkeys (name, created date), add a passkey, and delete one after confirming in a Sheet (no undo, because a deleted credential cannot be restored). Also a sign-out button.

Steps:

- [ ] **Step 1: Failing unit tests** `guard.spec.ts`:
  - A public path is allowed without a session.
  - `/weight` as a navigation without a session redirects to `/login?redirectTo=%2Fweight`, and `?x=1` is preserved.
  - A `POST /weight` without a session is denied with 401.
  - A `fetch` (`secFetchMode` `cors`, `accept` `application/json`) without a session is denied with 401.
  - Any path with a session is allowed.
  - `safeRedirect`: `'/weight'` returns `'/weight'`; `'//evil.com'`, `'/\\evil.com'`, `'https://evil.com'`, `null` and `''` all return `'/'`.
- [ ] **Step 2: Run** `pnpm test`. Expected: guard specs fail.
- [ ] **Step 3: Implement** `guard.ts`. Run `pnpm add @better-auth/passkey`. Update `auth.ts`, then `pnpm auth:schema && pnpm db:generate && pnpm db:migrate:local`. Wire `decideAccess` into `hooks.server.ts` after the session lookup and before `svelteKitHandler`: `redirect` returns 303, `deny` returns `new Response('Unauthorized', { status: 401 })`.
- [ ] **Step 4: Implement** the setup, login and security pages with Task 3 and 4 components.
- [ ] **Step 5: E2E infrastructure**
  - `scripts/e2e-db-reset.sh`: `rm -rf .wrangler/e2e && pnpm wrangler d1 migrations apply DB --local --persist-to .wrangler/e2e`.
  - Playwright `webServer.command`: `bash scripts/e2e-db-reset.sh && pnpm build && pnpm preview --persist-to .wrangler/e2e --var ORIGIN:http://localhost:4173`, with `reuseExistingServer: false`.
  - A `setup` project (`testMatch: /auth\.setup\.ts/`) creates the account through `/setup`: name "Test", email `test@example.com`, password `correct-horse-battery`, then skip passkey. It saves `playwright/.auth/user.json`.
  - `chromium-desktop` and `webkit-iphone` depend on `setup` and use that `storageState`.
  - Tests that need a logged-out state use `test.use({ storageState: { cookies: [], origins: [] } })`.
  - Add `BETTER_AUTH_SECRET` for preview: `wrangler dev` reads `.dev.vars`. If missing, the script copies `BETTER_AUTH_SECRET` from `.env` into a gitignored `.dev.vars`. In CI, it is generated with `openssl rand -base64 32`.
- [ ] **Step 6: E2E tests** `e2e/auth.e2e.ts`:
  - Logged out:
    - `/weight` lands on `/login?redirectTo=%2Fweight`.
    - Logging in with the password lands on `/weight`.
    - `/setup` redirects to `/login` because a user exists.
    - `request.post('/api/auth/sign-up/email', { data: { name: 'X', email: 'x@example.com', password: 'another-long-password' } })` returns status 403, and the user can still log in.
    - `request.get('/settings')` with `accept: application/json` returns 401.
  - Logged in: the session cookie (name contains `session_token`) has `expires` more than 360 days from now. Sign out from Settings leads to `/login`.
- [ ] **Step 7: E2E passkey** `e2e/passkey.e2e.ts` (chromium-desktop only; `test.skip(browserName !== 'chromium')`):
  - Create a CDP session, `WebAuthn.enable`, then `WebAuthn.addVirtualAuthenticator` with `{ protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true }`.
  - Add a passkey in `/settings/security` and expect it in the list.
  - Clear cookies, then go to `/login` and click "Sign in with passkey". Expect the Today heading.
- [ ] **Step 8: Gate**: `pnpm verify`. Expected: all pass.
- [ ] **Step 9: Commit**: `git commit -m "feat(auth): single-user setup, passkey login, 1 year sessions, route guard"`.

---

### Task 7: Cloudflare deploy and CI/CD (run together with the user)

Steps marked **(user)** need the user's Cloudflare or GitHub session; the agent prints the exact command and waits.

**Files:**
- Create: `.github/workflows/ci.yml`, `docs/architecture.md`
- Modify: `wrangler.jsonc` (real `database_id`, custom domain, vars), `AGENTS.md` (deploy section), `docs/decisions.md`

**Interfaces:**
- Consumes: everything above.
- Produces: production at `https://kcal.avp.software`; CI on every push and pull request; deploy on push to `main`.

- [ ] **Step 1 (user): Log in to wrangler**: run `! pnpm wrangler login` and approve in the browser.
- [ ] **Step 2: Create D1**: run `pnpm wrangler d1 create kcal`. Copy the printed `database_id` into `wrangler.jsonc` and `.env` (`CLOUDFLARE_DATABASE_ID`).
- [ ] **Step 3: Production config in `wrangler.jsonc`**:

```jsonc
"workers_dev": false,
"preview_urls": false,
"routes": [{ "pattern": "kcal.avp.software", "custom_domain": true }],
"vars": { "ORIGIN": "https://kcal.avp.software" },
"observability": { "enabled": true }
```

- [ ] **Step 4: Secret and first deploy**:

```bash
openssl rand -base64 32 | pnpm wrangler secret put BETTER_AUTH_SECRET
pnpm db:migrate:remote
pnpm build && pnpm wrangler deploy
curl -s -o /dev/null -w "%{http_code}\n" https://kcal.avp.software/login
```

The production secret is new and never written to disk. Expected: `200` (the custom domain DNS can take a minute).
- [ ] **Step 5 (user): API token for CI**:
  - In the Cloudflare dashboard, create a token with these permissions: Account, Workers Scripts: Edit; Account, D1: Edit; Zone `avp.software`, Workers Routes: Edit.
  - Then run `! gh secret set CLOUDFLARE_API_TOKEN` and `! gh secret set CLOUDFLARE_ACCOUNT_ID`.
- [ ] **Step 6: `.github/workflows/ci.yml`**:
  - Job `verify` runs on push and pull_request:
    - Ubuntu, Node 22, pnpm via `pnpm/action-setup`, `pnpm install --frozen-lockfile`.
    - `pnpm exec playwright install --with-deps chromium webkit`.
    - Writes `.dev.vars` with a random `BETTER_AUTH_SECRET`.
    - Runs `pnpm verify`.
    - Uploads `playwright-report` on failure.
  - Job `deploy`: `needs: verify`, only on push to `main`, `concurrency: deploy`. Runs `pnpm db:migrate:remote` then `pnpm build && pnpm wrangler deploy`, with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from secrets.
- [ ] **Step 7: Docs**
  - `docs/architecture.md`: request flow (Worker, hooks guard, routes, D1), directory map, how to run locally (`pnpm dev`, `pnpm db:migrate:local`), how to deploy, how to add a migration, and where secrets live.
  - Add a Deploy section to `AGENTS.md`.
  - Add a decisions entry for CI deploy on `main`.
- [ ] **Step 8: Gate and push**: run `pnpm verify`, commit (`git commit -m "ci: verify and deploy to Cloudflare on main"`), push, then `gh run watch` until both jobs succeed.
- [ ] **Step 9 (user): Device check**:
  - On the iPhone, open `https://kcal.avp.software` and create the account at `/setup`. Add a passkey (Face ID) and use Share, then "Add to Home Screen".
  - Open the home screen app, force quit it, and reopen it. It should still be logged in.
  - On the Mac, log in with the passkey (iCloud Keychain sync) and check that the sidebar layout appears.
