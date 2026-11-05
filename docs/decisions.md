# Decision Log

Living record of decisions. Newest first. Each entry: date, decision, reason.

## 2026-11-05

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
