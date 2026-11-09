# Phase 5b: Nutrition Label Photo

Date: 2026-11-09. Status: approved.

## Goal

When creating a food, the user photographs the nutrition label and Claude fills kcal, protein, carbs, fat,
fiber and serving weight per 100 g. The user checks the values and saves as usual.

## Non goals

- OFF contribution (phase 5c).
- Reading name, brand or barcode from the photo (a nutrition panel rarely carries them).
- Storing or logging the photo. It exists only for the duration of one request.
- Editing an existing food from a photo, offline use.

## Approach

A remote `command` `readLabel` sends a resized JPEG to the Claude API with `@anthropic-ai/sdk` (fetch based, runs on
Workers) and returns normalized values. Model `claude-opus-5-5`, effort `medium`, structured output through
`output_config.format` (`json_schema`); the reply is parsed and checked again with valibot (the repo's schema
library, so no zod). Server side fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) handle a
safety decline; a final `refusal` becomes "Couldn't read the label". The model id is a constant in
`src/lib/server/label/`.

Cost: a 1568 px image is about 1,600 to 2,500 input tokens; with prompt and short output about $0.02 a photo at
$4 / $20 per M tokens, so $100 covers about 5,000 photos. Switching to `claude-haiku-5-5` ($0.10 / $0.50) is a one
line change if accuracy holds.

Rejected: Workers AI (image input format and limits undocumented, weaker models), on device OCR (about 10 MB of
wasm, poor on curved packs).

No spike: reading a per 100 g table is well within the model's ability; the manual phone check before merge
covers accuracy.

## Behaviour

- `FoodForm` without `foodId` shows "Photograph label" (barcode miss, manual new food, recipe ingredient). It opens
  `<input type="file" accept="image/*" capture="environment">`. Off while offline, with a hint.
- The client downsizes to a 1568 px long edge (Claude's native size) JPEG at quality 0.85 (`createImageBitmap` and a canvas) and sends a
  data URI. The button shows "Reading label…" and the form stays editable.
- The server: requires a signed in user (existing guard), `LABEL_LIMITER` 6 a minute, rejects a payload over 1.5 MB
  or not `data:image/jpeg;base64,`. The prompt asks for the per 100 g (or 100 ml) column and the serving
  weight if printed; the JSON schema fixes the shape, with `found: false` when there is no per 100 column.
- Only per 100 g / 100 ml labels are supported (the user's labels all carry it). No kJ or per serving conversion.
  Normalization (pure function, unit tested) drops values outside `FoodInput` ranges (not clamped); `found: false`
  or no kcal returns "Couldn't read the label. It needs a per 100 g column".
- Returned fields overwrite the form's values. Each field whose value changed shows "From photo, was 120" (or
  "From photo" when it was empty) until edited. Untouched fields stay. Nothing saves until the user taps Save.
- Errors show inline under the button; the form keeps its values. A rate limit says "Too many photos, try again in
  a minute".

## Data and interface changes

- `wrangler.jsonc`: `LABEL_LIMITER` (namespace `1004`), `ANTHROPIC_API_KEY` in `secrets.required`; `.env.example`
  documents it. Production: `wrangler secret put ANTHROPIC_API_KEY`. The user sets a monthly spend limit in the
  Anthropic console. No schema change.
- `package.json`: `@anthropic-ai/sdk`.
- `src/lib/server/label/`: `read.ts` (calls the model), `normalize.ts`; `src/lib/schemas/label.ts` (input and
  result); `readLabel` in `foods.remote.ts`; `src/lib/client/resize-image.ts`; `FoodForm.svelte`.
- `appContext` exposes the Anthropic client and the limiter; tests inject a fake.
- `docs/architecture.md` and `docs/decisions.md` updated.

## Edge cases

Photo of something that is not a label; blurry photo; label with both per 100 g and per serving (100 g column used);
comma decimals ("2,5 g"); "<0.5 g" (becomes 0); salt instead of sodium (ignored); kJ and kcal
both printed (kcal used); HEIC from iOS (the canvas re-encodes to JPEG); prompt injection text on a pack (only
numbers inside schema ranges come back, and the user confirms).

## Tests

- `normalize.spec.ts`: range drops, `found: false`, missing kcal.
- `read.spec.ts`: fake client returning valid, malformed and empty JSON, a refusal, an API error; payload limits; rate limit.
- `FoodForm.svelte.spec.ts`: fill and "From photo" markers, error keeps values, button hidden with `foodId`,
  offline state.
- `resize-image.spec.ts` (browser project): long edge and output type.
- No e2e (the API is not called from tests). Manual check on a phone before merge.
