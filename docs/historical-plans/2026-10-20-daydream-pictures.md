# Daydream pictures

## Context

Daydreams are text-only today. The user wants each passage to come with a
generated picture: the story model writes an image prompt alongside its
reply (when a picture makes sense), Bound Up sends it to an uncensored,
NSFW-tuned image model, and the picture appears in the thread under the
passage, with a skeleton while it is made.

Decisions already made with the user:
- **Provider: Runware** (`POST https://api.runware.ai/v1`, Civitai
  checkpoints by AIR id, ~$0.002/image). Its terms forbid sexual material
  involving minors and report CSAM, and are silent on consensual adult
  content — the user has chosen it knowing that.
- **Style: per daydream, photoreal by default** — Photo (Lustify, Civitai
  model 573152, SDXL build) or Illustrated (WAI-NSFW-Illustrious, Civitai
  827184).
- **Automatic, on by default**, with a per-daydream switch to turn it off.

It must keep the app's invariants: user content is sealed and never stored
in plaintext on the server (pictures are encrypted in the browser, like
message attachments); the server only passes the prompt through, as it does
for passages; nothing is logged; every adult-only rule holds for images too.

## Approach

### 1. The model writes the prompt (meta `image`)
- `replyFormat` in `src/lib/server/daydream/prompt.ts` asks for an optional
  `"image"` in `<meta>`: one natural-language description of the moment the
  passage ends on, as a single picture. Rules in the instruction:
  - Leave it out when a picture adds nothing (an aside, a check-in, a
    passage that is only talk) — and always out of `CHECK_IN`.
  - Every person described as an adult with an age ("a woman in her
    thirties"), their look taken from the setup's `appearance`, kept
    consistent across passages; never youthful descriptors; no real people.
  - As explicit as the scene's heat allows and no more: at SFW, clothed and
    non-sexual.
  - Plain description only; style words are the server's (below).
  - Only included when pictures are configured on the server, so a
    deployment without a key asks for nothing. Constant per deployment, so it
    does not disturb the cache (docs/daydreams.md, "Cost").
- Meta is never sent back to the model, so the append-only history is
  untouched.
- **Four places, or the field is silently dropped** (passageMetaSchema is a
  plain `z.object` and `#generate` rebuilds `finalMeta` by hand):
  - a new `passageMetaV6 = passageMetaSchema.extend({ image })` used only by a
    new `turnV6` in `src/lib/sealed-kinds/daydreams.ts` (v5 frozen, identity
    upcast, new fixture in `src/lib/sealed-fixtures/fixtures.json` sealed
    with the independent `node:crypto` script, as for turn v5 / mark v2);
  - `salvageMeta` in `src/lib/daydream/reply-format.ts`;
  - `finalMeta` in `#generate` (`src/lib/daydream/story.svelte.ts`);
  - `DAYDREAM_LIMITS.imagePrompt` (1,000 chars) in `src/lib/daydream.ts`.

### 2. Settings per daydream (setup v3)
- `daydreamSetupKind` gains `pictures: { on: boolean; style: 'photo' |
  'illustrated' }`; v2 upcasts to `{ on: true, style: 'photo' }`. New fixture.
- Shown in the setup form's "More options", and an on/off switch plus the
  style in the story's Dials popover for changing mid-story.
- Neither touches the system prompt: on/off only decides whether the page
  generates automatically, and the style is applied by the server's image
  request, so changing either costs no cache miss.

### 3. Generating: `POST /api/daydreams/[id]/image`
- Body `{ prompt, style, heat }`. Gates in the reply endpoint's order:
  user, `requireFeature('daydreams')`, image config (503 without a key),
  `ownsDaydream`, picture consent (409, see 6), schema, then a new rate limit
  scope `DAYDREAM_IMAGE_LIMITS` (20/min, 300/day) wired like
  `daydreamRateLimiter` (`src/lib/server/rate-limit.ts`,
  `src/hooks.server.ts`, `src/app.d.ts`).
- **Child-safety screen first** (`imagePromptProblem` in a new pure,
  alias-free `src/lib/daydream/image-prompt.ts`): refuse (422, "That one
  can't be pictured") any prompt with youth terms — child, kid, minor,
  underage, teen/teenage, preteen, loli/shota, schoolgirl/schoolboy, school
  uniform, young-looking, childlike, and the like. Shared with the client so
  a refused prompt is not even sent.
- `runwareTask(prompt, style, heat, models)` (same file, pure) builds the
  request: the style's model AIR, style words prepended (photo: "photograph,
  realistic, natural light…"; illustrated: "masterpiece, best quality,
  illustration…"), an adult anchor ("adults, mature bodies"), a fixed
  negative prompt (the youth terms, plus deformities, text, watermark; plus
  nudity/sex at SFW heat), 832×1216 portrait, WEBP, one result, no
  `checkNSFW`.
- The server calls Runware, gets the image back (base64 output, or a short
  `ttl` URL fetched server-side, whichever the API supports), and returns the
  bytes (`image/webp`). Stores nothing, logs only status codes, like
  `../reply`.
- Config `src/lib/server/daydream/image-config.ts`, after
  `readDaydreamConfig`: `RUNWARE_API_KEY` (absent ⇒ pictures off),
  `RUNWARE_BASE_URL` (for the e2e stub), `DAYDREAM_IMAGE_MODEL_PHOTO`,
  `DAYDREAM_IMAGE_MODEL_ILLUSTRATED` (defaults: the verified AIR ids).

### 4. Storing: encrypted in the browser, a mark per picture
- Turns never change, and the picture arrives after its passage is saved, so
  the picture is a **mark** on the passage: `daydreamMarkKind` v3 adds
  `{ type: 'picture', imageId, key, mimeType, width, height }`, where `key`
  is the per-file age identity from `encryptAttachment`
  (`src/lib/crypto/messages.ts`) — the same pattern as message attachments.
  New fixture; v2 identity upcast.
- Upload `PUT /api/daydreams/[id]/images/[imageId]` (raw ciphertext body,
  `content-length` capped at 4 MB, UUID id) and download `GET` on the same
  path, both `ownsDaydream`-gated, served like the attachment endpoint
  (`octet-stream`, `nosniff`, immutable cache). Object key
  `permanent/daydreams/<daydreamId>/<imageId>`, derived rather than stored,
  so no new table; `assertStorageKey` and a key helper beside
  `attachmentKey` in `src/lib/server/media/index.ts`.
- Object written before the mark, as messaging does; an orphan is
  unreadable and only costs storage (documented).
- `deleteDaydream` callers purge the prefix after the row goes, logging
  rather than throwing on failure, like `purgePartnershipMedia`. Check the
  account-deletion path: if it purges partnership media, purge daydream
  pictures beside it; if not, list both under Known gaps.

### 5. The page
- `DaydreamStory` (`src/lib/daydream/story.svelte.ts`):
  - After `#append` saves a passage whose meta has `image`, and pictures are
    on, start `#illustrate(turnId, prompt)` in the background: request the
    image → show it at once from the plaintext blob → encrypt → upload →
    `#addMark` the picture. State per turn in a `SvelteMap`
    (`generating` / `failed` with the reason).
  - A passage with a `picture` mark opens it lazily: fetch the ciphertext,
    `decryptAttachment`, object URL (revoked on destroy).
  - A passage with a prompt but no picture (pictures off, or interrupted)
    offers **Picture this**; a failure offers **Try again**. Nothing typed or
    asked for is lost.
  - Request failures go through `tryFetch` / `reportRequestFailure`
    (AGENTS.md); a refusal (422) is shown inline, not as an app error.
- `DaydreamPassage.svelte`: the picture sits after `p.text` (never inside
  it — quote offsets depend on that text) and before the actions:
  `wa-skeleton effect="sheen"` at the picture's aspect ratio while
  generating or opening, then the `<img>` with alt text "A picture of this
  moment" (the prompt is not shown by default; it is in the raw log).
- Raw log / Export: the prompt is already in `raw`; the picture mark shows
  in "Stored" and the export like any mark.

### 6. Consent
- `DaydreamDisclosure.svelte` copy adds: pictures send a description of the
  scene through Bound Up to Runware, the picture comes back through Bound Up
  and is stored encrypted so only you can see it, and Runware says it does
  not keep outputs or train on them.
- `daydream_preferences` gains `pictures_accepted_at` (migration via
  `npx drizzle-kit generate --name add_daydream_picture_consent`; read the
  SQL; no table rebuild). Accepting the disclosure sets both. Someone who
  accepted before sees a one-time card in the thread ("Pictures are new…",
  **Turn on pictures** / **Not now**, the latter switching the daydream's
  pictures off) before anything is generated. The image endpoint enforces
  it (409).

### 7. Docs, config, roadmap
- `docs/daydreams.md`: a new **Pictures** section (prompt, style, storage,
  consent, safety screen, cost), and updates to Safety, What the server
  sees, Cost, Configuration, Tests, Known gaps.
- `docs/self-hosting.md` env table, `.env.example`, `.dev.vars.example`,
  `docker-compose.yml`, `wrangler.jsonc` `previews` (no binding change; the
  secret via `npm run secrets` with a `--runware-key` flag, following
  `--openrouter-key`), `docs/development.md`.
- Roadmap: a shipped twig `daydreams-pictures` under `generated-roleplay`.
- Copy this plan to `docs/historical-plans/2026-10-20-daydream-pictures.md`.

## Verify before building on it (at the start of implementation)
- Runware's exact `imageInference` parameters and outputs: `outputType`
  values (base64 vs URL), `outputFormat` WEBP, `negativePrompt`, `steps`,
  `CFGScale`, dimension rules, error shape — from the docs or
  `runware model schema`.
- The AIR ids for the **SDXL** Lustify version (the latest, v10, is
  Krea-based) and for WAI-NSFW-Illustrious, from Civitai or Runware's model
  explorer. A test call with a real key confirms both before the defaults
  are set.

## Tests
- Pure: `image-prompt.test.ts` (the youth screen refuses each term and
  lets adult prompts through, the negative prompt, SFW heat adds the
  no-nudity terms, style words and model per style); `reply-format.test.ts`
  (`image` parsed and salvaged, too long dropped); sealed fixtures for turn
  v6, setup v3, mark v3; the worst-case size test still fits.
- Server: `api/daydreams/[id]/image/server.test.ts` (each gate, the screen
  refuses before any upstream call, rate limit, upstream failure → 502,
  returns bytes, nothing logged); upload/download route tests (ownership,
  size cap, key layout); delete purges the prefix; `prompt.test.ts` (image
  instructions only when configured, never in `CHECK_IN`).
- Component (`DaydreamThread.svelte.test.ts`): skeleton while generating,
  the picture after, the mark saved with the key, Try again on failure,
  Picture this when off, a stored picture opened on load, the one-time
  consent card.
- E2E: `e2e/model-stub.mjs` also answers the Runware endpoint with a tiny
  WEBP and adds `image` to its meta; `e2e/daydreams.spec.ts` sees the
  skeleton then the picture, and the picture again after a reload.
- `npm run check`, `npm run lint`, `npm test`, `npm run test:e2e:image`.
