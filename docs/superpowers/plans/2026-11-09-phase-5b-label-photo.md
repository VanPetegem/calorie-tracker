# Phase 5b Plan: Nutrition Label Photo

Spec: `docs/superpowers/specs/2026-11-09-phase-5b-label-photo-design.md`. Branch `phase-5b-label-photo`.

## Shared interface (fixed before tasks start)

`src/lib/schemas/label.ts`:

```ts
/** A JPEG data URI from the client resize, at most about 1.5 MB of image (2,000,000 base64 chars). */
export const ReadLabelInput = v.pipe(v.string(), v.maxLength(2_000_000), v.startsWith('data:image/jpeg;base64,'));
/** Values read from a per 100 g (or 100 ml) column. Null: not printed or out of range. */
export type LabelValues = {
	nutritionBasis: 'g' | 'ml';
	kcal: number;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
	fiber: number | null;
	servingG: number | null;
};
export type ReadLabelResult =
	| { ok: true; values: LabelValues }
	| { ok: false; reason: 'unreadable' | 'rate_limited' | 'unavailable' };
```

`readLabel` in `src/routes/(app)/foods.remote.ts`: `command(ReadLabelInput, (dataUri) => Promise<ReadLabelResult>)`.

## Tasks

| # | Task | Files | Model | Depends |
|---|------|-------|-------|---------|
| 1 | Server: SDK, config, schema, normalize, read, context, command | `package.json`, `wrangler.jsonc`, `worker-configuration.d.ts`, `.env.example`, CI env, `src/lib/schemas/label.ts`, `src/lib/server/label/{normalize,read}.ts` + specs, `context.ts`, `foods.remote.ts` | sonnet high | none |
| 2 | Client resize helper | `src/lib/client/resize-image.ts` + browser spec | haiku xhigh | none |
| 3 | FoodForm "Photograph label" UI | `FoodForm.svelte` + spec | sonnet high | 1, 2 |
| 4 | Docs: architecture, decisions | `docs/` | inline | 3 |

Gate per task: `pnpm check && pnpm lint && pnpm test`. Full `pnpm verify` once before the PR.
