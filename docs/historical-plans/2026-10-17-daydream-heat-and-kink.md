# Daydreams: say how sexual and how kinky, and offer examples across the range

## Context

Daydreams currently sit in an awkward middle. The system prompts call every
daydream "an interactive erotic story", so a SFW story gets pushed towards sex.
But nothing on screen lets someone say *how* sexual or *how* kinky a character
or a scene is, and the curated templates and chips are vaguely suggestive
("strict mentor", "a bet you lost") rather than actually explicit. Plenty of
people will use Daydreams for NSFW stories, and the app shouldn't be coy about
it. It should also let a story be properly SFW.

The goal:
- Characters get **Libido** (Chaste → Slutty) and **Kink** (Vanilla → Depraved)
  dials.
- Scenes get **Heat** (SFW → Filthy) and **Kink** (Vanilla → Extreme) dials.
  They are saved with library scenes and set by templates, and they can be
  turned up or down mid-story from the Dials popover.
- If a dial is left unset, the model follows the free text, as every other
  dial already does. Setting Heat to its lowest step is how a story is made
  strictly SFW. The prompt no longer assumes every story is erotic.
- The templates and chips cover the whole range, from SFW to filthy and
  extreme.

Decisions confirmed with the user: scene dials live on the scene and can also
be adjusted mid-story; unset means "follow the description"; the wording is
blunt.

**Sealed kinds change in place, without a version bump.** Per the new note in
`src/lib/sealed-fixtures/README.md`, Daydreams has not shipped yet, so setup v2,
character v1 and scene v1 can still be changed and their fixtures resealed.
(Daydreams is in the last two commits on `main`, and the uncommitted parts and
castings work already relies on this exception.) If any of those versions has
in fact been deployed, this changes to a v2/v2/v3 bump with upcasters that set
the new dials to `null`.

## Step 0: fix the failing roadmap test

`src/lib/components/roadmap/RoadmapTree.svelte.test.ts` › "dims a line that
leads only to hidden items, and a branch with nothing shown" fails. The test
hard-codes **Sessions** as "a branch with nothing shipped" (line 195). That
stopped being true in `aed65af`, which marked the Daydreams twigs
`daydreams-voices-library` and `daydreams-steer-branch` as `shipped` under
Sessions. The component is right and the test's assumption has gone stale.

Fix: stop naming branches by hand. Work out from the data which branches have
a shipped item, using `allItems()` from `$lib/roadmap` (each `PlacedItem` has
its `branch`). Then take the first branch with no shipped items (Notebook,
today) as the fully dimmed case, and one with shipped items as the head that
stays lit, both through `defined(…)`. Add a comment saying why: a hard-coded
branch broke the moment something in it shipped. The Chastity assertions above
it still hold and are unchanged. Done when `npx vitest run
src/lib/components/roadmap` passes.

## Design

### Types and words (`src/lib/daydream.ts`, `src/lib/daydream/dial-words.ts`)

- `CharacterDials` gains `libido: DialValue | null` and `kink: DialValue | null`.
  `UNSET_CHARACTER_DIALS` updated to match.
- New `SceneDials = { heat: DialValue | null; kink: DialValue | null }` and
  `UNSET_SCENE_DIALS`. `DaydreamScene` gains `dials: SceneDials`, and
  `EMPTY_SCENE` updated to match.
- `CHARACTER_SLIDERS` gains two entries, in the same `{ key, label, low, high,
  scale }` shape, each step with a label and a phrase for the model:
  - **Libido**, Chaste → Slutty: 1 Chaste (not interested in sex) · 2 Shy
    (reticent, needs coaxing) · 3 Interested · 4 Horny (eager, says what
    they want) · 5 Slutty (insatiable, shameless, always up for it).
  - **Kink**, Vanilla → Depraved: 1 Vanilla · 2 Curious (light play) ·
    3 Kinky · 4 Very kinky (heavy play) · 5 Depraved (anything within the
    limits, and enjoys taboo).
- New `SCENE_SLIDERS` and `describeSceneDials(dials): string[]`:
  - **Heat**, SFW → Filthy: 1 SFW ("nothing sexual: keep it entirely safe for
    work, no sexual content or innuendo") · 2 Flirty (tension and innuendo,
    nothing explicit) · 3 Steamy (sex happens, written sensually, not
    graphically) · 4 Explicit (sex written explicitly) · 5 Filthy (graphic,
    crude, and frequent).
  - **Kink**, Vanilla → Extreme: 1 Vanilla (no kink) · 2 Light (playful
    restraint, spanking, teasing) · 3 Kinky (BDSM, power exchange) · 4 Heavy
    (pain, degradation, strict protocol) · 5 Extreme (as far as the user's
    limits allow).
- `describeCharacterDials` picks up the new sliders automatically.
- The two slider UIs (character dialog, `DaydreamDials`) are currently written
  against their own arrays. Pull the shared "optional 1–5 slider with Not set
  and Clear" markup out of `DaydreamCharacterDialog.svelte` into a small
  `DaydreamOptionalSlider.svelte`, so the scene dialog and the popover use it
  too, instead of copying it twice more.

### Schemas (alias-free kind, form, suggest)

- `src/lib/sealed-kinds/daydreams.ts`: `characterDialsSchema` gains `libido`
  and `kink`. `sceneShape` gains `dials: z.object({ heat, kink })` (nullable
  dials). The v1→v2 setup upcaster fills in `UNSET_CHARACTER_DIALS` and
  `UNSET_SCENE_DIALS`.
- `src/lib/schemas/daydreamForm.ts`: the same in `characterDials` and
  `sceneFields`. `EMPTY_SCENE_FORM` picks it up from `EMPTY_SCENE`.
- `src/lib/server/daydream/suggest-prompt.ts`: the record request's `dials`
  object gains `libido`/`kink`. Add a `sceneDials` field (optional, for
  `target: 'scene'`). The surprise-scene and fill answer shapes may include
  `"heat"` and `"kink"`, but only when the scene has none set.
- `src/lib/daydream/suggestions.ts`: parse the optional `heat`/`kink` in a
  scene answer leniently (an out-of-range value is dropped, not failed), the
  way rolls already are.
- `src/lib/sealed-fixtures/fixtures.json` + README: reseal the setup v2,
  character v1 and scene v1 fixtures with the new fields, and add one
  sentence to the README's "exception" note naming this change.

### The prompts (`src/lib/server/daydream/prompt.ts`, `suggest-prompt.ts`)

- `RULES`' opening line becomes: "You are writing an interactive story with one
  adult user, for their private enjoyment. It may be as sexual and as kinky as
  the setup below says — explicit sex and kink are welcome when it asks for
  them — or not sexual at all." Keep every rule after it unchanged. Make the
  same change to `SUGGEST_RULES`.
- `describeSetup`'s scene section adds `describeSceneDials` lines, with this
  precedence: **the scene's heat is the ceiling** — at Heat 1 nobody acts
  sexually, whatever their libido. Characters' libido and kink say how eager
  each one is within it. The user's limits still outrank both, and the
  existing "where this and the description disagree, follow the description"
  line stays.
- With no heat set anywhere, the prompt says nothing about it, so the model
  follows the text.
- `describeDraft`/`describeContext` in the suggest prompt pass the character's
  and the scene's dials. Chips, fill and surprise then match the level, so a
  SFW scene doesn't get "orgasm denial" suggested to it.

### UI

- **Character dialog** (`DaydreamCharacterDialog.svelte`): the new sliders
  appear under "In broad strokes" automatically, since the dialog iterates
  `CHARACTER_SLIDERS`.
- **Scene dialog** (`DaydreamSceneDialog.svelte`): a "Heat and kink" pair of
  optional sliders, up front after the premise. They decide what the story is,
  so they shouldn't be hidden under More detail. `start`, `useTemplate` and
  `makeOneUp` carry `dials` (a model answer fills only the unset ones).
  `context`/`suggestFill` send them.
- **Mid-story** (`DaydreamDials.svelte`, `DaydreamThread.svelte`,
  `story.svelte.ts`): the popover gets the scene's Heat/Kink above
  Intensity/Pace. A change saves through the existing `saveSetup` with
  `setup.scene.dials` replaced (new `setSceneDials`). That changes the
  daydream's copy only, never the library. It is the same as "Edited setups
  apply forward", and the doc says so. The setup form's own dials disclosure
  doesn't need them, because they come from the scene dialog.
- **Templates show their level.** Each template button gets a small quiet
  badge built from its heat/kink (`SFW`, `Flirty`, `Steamy`, `Explicit`,
  `Filthy`, plus `· kinky` when kink ≥ 3). Templates are listed in order of
  heat, so the range is visible at a glance and nobody has to guess. A
  `templateLevel()` helper in `catalog.ts` builds the badge words from
  `SCENE_SLIDERS` labels.

### The catalog (`src/lib/daydream/catalog.ts`)

Content like the seed prose: explicit by design, written as data. Every
template gets full dials. The four existing ones are kept, given levels, and
joined by new ones so each list runs from SFW to extreme:

**Characters** (libido / kink):
- The old friend — warm, easy banter (1/1) *new, SFW*
- The charming rogue — flirts with everyone, all innuendo (3/1) *new*
- The gentle caretaker (3/1) *existing*
- The playful tease — teasing and denial (4/3) *existing*
- The strict mentor (3/4) *existing*
- The cold aristocrat (3/4) *existing*
- The eager neighbour — openly horny, says exactly what they want (5/2) *new*
- The brat — mouthy, wants to be put in their place (4/4) *new*
- The sadist — enjoys pain, degradation, and your reactions (4/5) *new*

**Scenes** (heat / kink):
- The lighthouse — storm, a stranded stranger, a mystery (1/1) *new, SFW*
- The long drive — road trip, slow-burn romance (2/1) *new*
- The masquerade — masks, a stranger, a dare (2/2) *new*
- The cabin (3/1) *existing*
- After hours (3/2) *existing*
- The hotel room — no pretending, you both know why you're here (5/1) *new*
- The lost bet (4/3) *existing*
- The facility (3/4) *existing*
- The contract — signing yourself over, rules and protocol (4/4) *new*
- The dungeon — a play party, nothing off the table but your limits (5/5) *new*

**Chips** get the same spread. The existing tame ones stay, and explicit ones
are added at several levels to `likes`, `appearance`, `personality`,
`archetype`, the scene's `premise`/`tone`/`setting` and the casting `part`.
For example: likes "dirty talk", "oral", "being watched", "spanking",
"bondage", "orgasm denial", "degradation", "praise kink", "edging"; tone
"filthy", "wholesome", "cosy"; premise "a hookup with no names", "a cosy
mystery to solve". Final wording is written during implementation, keeping
each chip comma-free (`toggleChip` relies on that).

## Files

Core: `src/lib/daydream.ts`, `src/lib/daydream/dial-words.ts`,
`src/lib/daydream/catalog.ts`, `src/lib/sealed-kinds/daydreams.ts`,
`src/lib/schemas/daydreamForm.ts`, `src/lib/server/daydream/prompt.ts`,
`src/lib/server/daydream/suggest-prompt.ts`, `src/lib/daydream/suggest.ts`,
`src/lib/daydream/suggestions.ts`, `src/lib/daydream/story.svelte.ts`.
UI: `DaydreamCharacterDialog.svelte`, `DaydreamSceneDialog.svelte`,
`DaydreamDials.svelte`, `DaydreamThread.svelte`, new
`DaydreamOptionalSlider.svelte`.
Fixtures and helpers: `src/lib/sealed-fixtures/*`,
`src/lib/testing/daydream-setup.ts`, `e2e/model-stub.mjs` if the stub matches on
the prompt's first line.
Docs: `docs/daydreams.md` ("Guided, over free text": the new dials and the
heat-as-ceiling rule; "The system prompt is the server's": the reworded
opening; "Moving the story on"/Dials: Heat/Kink mid-story; "Known gaps":
mid-story scene dials diverge from the library copy). Check
`src/lib/roadmap/roadmap.json` for a Daydreams entry to add a twig to. Copy
this plan into `docs/historical-plans/2026-10-17-daydream-heat-and-kink.md`.

## Tests

- `dial-words` (new `dial-words.test.ts`): every slider has all five steps;
  `describeSceneDials` returns nothing when unset; the new character sliders
  appear in `describeCharacterDials`.
- `prompt.test.ts`: the rules no longer say "erotic story" unconditionally; Heat
  1 produces the SFW line and the ceiling sentence; unset produces no heat line;
  character libido/kink phrases appear; rules still come first.
- `suggest-prompt.test.ts`: scene and character dials reach the prompt; the
  request schema accepts and bounds them.
- `suggestions.test.ts`: surprise/fill answers with valid, missing and
  out-of-range heat/kink.
- Sealed fixtures test: the resealed fixtures open; the v1 setup upcasts with
  unset dials.
- `catalog` (new `catalog.test.ts`): every template parses with the sealed kind's
  schema (with ids added to parts), the templates are sorted by heat and span
  1–5, and no chip contains a comma.
- Component: `DaydreamSceneDialog.svelte.test.ts` — a template sets its dials,
  and the sliders can be cleared; `DaydreamCharacterDialog.svelte.test.ts` — the
  libido and kink sliders save; `DaydreamThread.svelte.test.ts` — changing Heat
  in the popover saves `scene.dials`.
- e2e `daydreams.spec.ts`: pick the SFW scene template, start a daydream, and
  assert the request the stub received carries the SFW heat line; raise Heat
  from the popover and see the next request carry the new level.

## Verification

`npm run check`, `npm run lint`, `npm test` (vitest and Playwright), then
`npm run test:e2e:image`. Manually: `npm run dev`, then open
`/daydreams/new`. Check that the template badges read correctly at phone
width, that a Heat 1 scene stays SFW against the real model, and that a Heat
5 / Kink 5 scene doesn't hold back.
