# Daydream pictures: fold in the hand-tuned FLUX prompt, add FLUX.2 Klein

## Context

The user has a hand-tuned image-prompt prompt that produces pictures they like
on FLUX.2 Klein 9B. Much of it is already in `imageInstruction`
(`src/lib/server/daydream/prompt.ts:445`): spelling out sex acts and giving
every common name, drawing the implied other person, unambiguous words
("harness" not "gear"), explicit light. What is missing is:

- the model-agnostic advice: concrete nouns rather than adjectives, positive
  phrasing, quoted readable text, emphasis in plain words, the candid
  amateur-photo look, and the user's cock;
- the FLUX-specific advice: subject first and framing last, 30–80 words, and
  no negative prompts.

The user chose to add FLUX.2 Klein as a third architecture, and to make the
description's length and order **depend on the architecture**.

Not carried over: HEX colours (stories have no brand colours, so they would
add noise), edit instructions (daydreams never edit a picture), "use the
chat's language" (the image model reads English, so we say "in English"), and
"don't add information not present" (it conflicts with re-describing each
person in full every time, which keeps faces consistent).

## Design

### 1. A third architecture: `flux-2`

`src/lib/daydream/image-prompt.ts`
- `PictureArchitecture = 'sdxl' | 'z-image-turbo' | 'flux-2'`, with a
  doc-comment bullet like the existing two.
- `pictureWorkload`: flux-2 → `{ steps: 4 }` (distilled for 4 steps; Runware's
  default is 4). For `CFGScale`, Runware ignores `negativePrompt` at ≤ 1 and
  defaults to 3.5. Hand-test 1, 1.5 and 3.5 (see Verification), then pin the
  winner with a comment explaining it, as the Z-Image 1.5 one does.
  832×1216 is already a multiple of 16, which Klein requires.
- `positivePromptFor` flux-2 branch, ordered for FLUX (subject → action →
  style → context → technical, written as sentences): the description, then
  the style sentence, then the adult sentence, then the SFW sentence when
  needed. It leaves out "No text, no watermark.", because FLUX has no
  negatives and naming text invites it.
- An SFW sentence phrased positively for all architectures: "Everyone is
  fully clothed, in an everyday, non-sexual moment."
- The negative prompt is still sent: it costs nothing, and it works if the
  CFG we pick is above 1.

### 2. Server setting and preset

`src/lib/server-settings.ts`
- `PICTURE_BASE_MODELS` += `{ id: 'flux-2-klein', label: 'FLUX.2 Klein', architecture: 'flux-2' }`.
- `pictureBaseModelForRunware`: map Runware's `modelSearch` architecture for
  Klein. Check the real string by running a `modelSearch` for `runware:400@2`
  before writing it.
- `RUNWARE_PICTURE_MODEL_PRESETS.photo` += a `flux-2-klein-9b` preset,
  `runwareModelAir: 'runware:400@2'`. Its comment says when it was chosen and
  that Klein 9B is under BFL's non-commercial licence (Runware lists it for
  commercial use). The photo default stays Dark Beast; the admin picks Klein
  in Server settings.

### 3. Architecture-specific instructions to the story model

`src/lib/server/daydream/prompt.ts`
- `buildMessages` option `pictures: boolean` becomes
  `pictures: PictureArchitecture | null`, threaded through `replyFormat`
  into `imageInstruction(voice, architecture)`.
- Callers (`src/routes/api/daydreams/[id]/reply/+server.ts`,
  `.../prompt/+server.ts`): resolve it from `readImageConfig(...)` and
  `models[parsed.data.setup.pictures.style].architecture` (confirm
  `RunwarePictureModel` carries `architecture`; add it if not).
- A per-architecture "recipe" table:
  - **z-image-turbo and sdxl**: today's wording: 80–150 words, framing first.
    SDXL is unchanged on purpose: no regression, and nothing has been measured
    against it.
  - **flux-2**: 30–80 words for a typical scene, going over 80 only when the
    scene needs it (two people described in full usually does); never padded
    with adjectives. Order: people (count, then each in full) → what each is
    doing → place and light → framing last.
- Cost note: the system prompt now depends on the style's architecture, so
  switching style mid-story *to a model of another family* costs one cache
  miss. That is rare and costs one request; the alternative, a trailing
  per-request note, would pay for the recipe uncached on every request. Update
  the comment above `imageInstruction` and the docs sentence "Neither reaches
  the story model, so changing either mid-story costs no cache miss."

### 4. Shared additions to the instruction (all architectures)

Add to the rules paragraph, each with a "why" in the comment above, as the
existing ones have:
- Written in English.
- Concrete nouns, materials, textures and positions rather than adjectives
  ("a black leather harness across her chest", not "sexy outfit").
- Say what is there, never what is not: "bare-chested", not "without a
  shirt"; "an empty room", not "no one else".
- Make the picture's focus prominent in plain words ("with particular
  attention to …"). No weight syntax.
- Readable text only when the moment has some, written exactly in quotation
  marks with what it is on: `a collar tag reads "PET"`.
- When the user's own character has a penis and nothing says its size, it is
  thick and long.

### 5. Style words: the candid amateur photo

`src/lib/daydream/image-prompt.ts`
- `STYLE_SENTENCES.photo` (Z-Image and FLUX): "A candid, realistic personal
  photograph, as if taken by a skilled amateur on a high-quality smartphone
  in good conditions: natural, unposed and lightly processed." The close
  keeps the skin, proportions and focus wording.
- `STYLE_TAGS.photo` (SDXL): replace `cinematic lighting` (the description
  now sets the light, and "cinematic" pulls towards a staged look) with
  `candid amateur photo, natural light`.
- Drop `text` from `NEGATIVE_ALWAYS` (keep `watermark`, `signature`, `logo`)
  and drop "No text, no watermark." from the Z-Image sentence; otherwise the
  new quoted-text rule is fighting the wrapper. Z-Image at CFG 1.5 still gets
  the negatives.

## Tests

- `src/lib/daydream/image-prompt.test.ts`: the flux-2 workload (4 steps,
  chosen CFG); the flux-2 positive prompt order (description first, then
  style, then adult, then SFW when needed); no "No text" anywhere; the new
  photo opening (update the `/^A candid, realistic photograph\./` assertion
  at line 84); the SFW sentence.
- `src/lib/server/daydream/prompt.test.ts`: the flux-2 instruction says
  30–80 words with framing last; z-image says 80–150 with framing first;
  `pictures: null` has no image instruction; the shared rules (English,
  quoted text, cock size, positive phrasing) appear for every architecture.
  Keep the existing `"harness", not "gear"` assertion.
- `server-settings` tests: the new base model and preset parse, and
  `pictureBaseModelForRunware` maps Klein's string.
- Route tests for reply/prompt, if present: architecture taken from the
  daydream's style.

## Docs and housekeeping

- `docs/daydreams.md`: the "Pictures" section (three families, the FLUX
  recipe, style switching can now miss the cache, the candid-photo style) and
  "Configuration" (the Klein preset and base model). Also
  `docs/server-settings.md`, if it lists base models.
- Copy this plan to
  `docs/historical-plans/2026-10-20-flux-klein-and-image-prompt-tuning.md`.
- No migration (settings are JSON rows). The roadmap is unaffected unless
  pictures have an entry; check `src/lib/roadmap/roadmap.json`.

## Verification

1. `npm run check`, `npm run lint`, `npm test`.
2. Hand test (`npm run dev`, admin → Server settings → photo model = FLUX.2
   Klein): run the same three descriptions at CFG 1, 1.5 and 3.5. One must
   say "a 34-year-old woman" (check the age doesn't drift younger), one is a
   two-person sex act, and one has a quoted sign. Pin the CFG and record why.
   Then repeat one story turn on Dark Beast to confirm Z-Image still looks
   right with the new style sentence.
3. In debug mode, check the raw log's `PictureRequest` shows the flux-2
   wrapper order and the expected steps and CFG.
