# Decision Log

Living record of decisions. Newest first. Each entry: date, decision, reason.

## 2026-11-05

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
- **CI deploys on push to `main`.** The `verify` job runs the full gate on every push and pull request; the
  `deploy` job needs it, runs only on `main`, and builds, then runs `db:migrate:remote` and `wrangler deploy`
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
