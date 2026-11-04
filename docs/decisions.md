# Decision Log

Living record of decisions. Newest first. Each entry: date, decision, reason.

## 2026-11-04

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
