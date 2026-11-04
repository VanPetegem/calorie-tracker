# AGENTS.md

Personal calorie tracker for weight gain. SvelteKit PWA on Cloudflare Workers + D1.

## Read first

- Spec: `docs/superpowers/specs/2026-11-04-calorie-tracker-design.md`
- Decisions: `docs/decisions.md` (append new decisions, newest first)

## Stack

SvelteKit 2, Svelte 5 runes, TypeScript strict, Tailwind CSS 4, Drizzle ORM on Cloudflare D1, Better
Auth (passkeys), Vitest, Playwright. Package manager: pnpm.

## Rules

- Domain math lives in `src/lib/domain/` as pure functions with unit tests. No I/O there.
- Use semantic design tokens only; never raw hex values or arbitrary Tailwind values in components.
- New UI components get an entry on the `/design` route showing all states.
- Log entries and batches store nutrition snapshots; never recompute history from current foods.
- All Open Food Facts calls go through the server with the configured User-Agent; cache results in D1.
- Schema changes: edit `src/lib/server/db/schema.ts`, run `pnpm db:generate`, commit the migration.
- Never commit `.env` or secrets. Document new variables in `.env.example`.
- Touch targets at least 44 px; respect `prefers-reduced-motion`; test on the WebKit iPhone profile.

## Verification gate

Run before claiming any work done:

```sh
pnpm check && pnpm lint && pnpm test && pnpm test:e2e
```
