# A monologue voice for daydreams

## Goal

A fifth way a daydream can be told: a **monologue**. Less narrative than the
other voices, like "A system in charge": one voice speaking its mind, taking
the ideas, tropes and common sayings of the kinks the daydream is about and
turning them into statements, each followed by a little in-character text,
in many short paragraphs. The speaker is a stand-in for those ideas rather
than a fleshed-out character. Key statements stand out on the page.

## Decisions (asked and answered)

- **Who speaks** is up to the model, from the setup. The default, when the
  story does not suggest otherwise, is an unnamed voice with the user
  listening. A character can be the speaker, or the monologue can be the
  user's own inner voice, when the setup suits it.
- **Key statements**: a statement on a line of its own, in bold. A paragraph
  that is entirely bold is drawn larger, in the heading font, for every
  voice; only the monologue is asked to write them.
- **Ready-made**: add two monologue stories, one for each side.
- **Rollout**: setup payload v4 ships its reader and writer in one release,
  and the repo rule that a reader ships a release before its writer is
  relaxed to say so.

## What changes

### 1. The voice (`src/lib/daydream.ts`)

- `DaydreamNarrator` gains `'monologue'`; `DAYDREAM_NARRATORS` an entry
  ("A monologue": one voice speaking its mind, with an example line).
- `DAYDREAM_VOICE_PRESETS` gains `monologue` ("A monologue"), stance `self`,
  with a description and two example lines; `DaydreamVoicePresetId` with it.
- `voiceProblem`: no new restriction; a monologue works with or without
  characters, and with any stance.
- `inferVoice` never guesses it, like watching and the system.
- `leadApplies` is false for it: nobody leads a monologue.

### 2. Storing it

- The form schema's narrator enum gains it.
- Sealed setup **v4**: v3's shape with the wider narrator enum; v3 upcasts
  unchanged. A frozen v4 fixture, sealed independently.
- Relax "a new version's reader ships before its writer" in `sealed.ts` and
  docs/encryption.md: they may ship together when an open tab on the previous
  build meeting the new version is acceptable, as it is for a daydream setup.

### 3. The prompt (`src/lib/server/daydream/`)

- `describeNarrator` for `monologue`.
- A guide of its own, `monologue-voice.ts`, like `impersonal-voice.ts`, last
  before the format: the form (many short paragraphs; a bold statement on a
  line of its own, then in-character text; drawn from the kinks' ideas,
  tropes and sayings in the setup; varied, never repeating a statement), who
  speaks (the default and the alternatives), what to leave out (scene
  description, a plot), and how to answer the user (dwell on what they ask
  for). Examples of the form only, in a tame and an adult set picked by heat,
  broad rather than anyone's particular kink.
- `writingGuide`: telling and sex sections, not the scene-prose section.
- The opening request, steering ideas (suggestions and directions), and
  `passageFormat` (the bold statement lines) for it.

### 4. Drawing standout lines

- `passage-format.ts`: a paragraph whose every visible run is bold is marked
  `standout`. Nothing about the runs or their offsets changes.
- `DaydreamProse.svelte`: a standout paragraph is drawn larger, in the
  heading font.

### 5. Everywhere a voice is named

- The summary's `TOLD_AS`, the suggest prompt's voice list and parsed voice
  ids, the daydreams list's "with whom" line, the voice picker (from the
  presets).

### 6. Ready-made stories

- Two scene templates and two starters (`you: 'sub'` and `you: 'dom'`), voice
  `monologue`, no cast, each with a marked summary, placed by heat.

## Tests

- Pure: the preset passes `voiceProblem` with any cast; never inferred; lead
  does not apply; standout paragraphs (all bold, mixed, empty); the starters'
  existing invariants cover the new ones.
- Sealed: the v4 fixture opens; the setup kind accepts a monologue.
- Server: the prompt's narrator line, guide placement and heat-picked
  examples, writing guide sections, opening request, steering ideas; the
  suggest prompt lists the voice.
- Component: the voice picker offers it; prose draws a standout paragraph.
- e2e: a ready-made monologue starts, and the stub's bold statement is drawn
  as a standout line.

## Docs

- docs/daydreams.md: the voice, its guide, standout lines, the starters.
- docs/encryption.md and `sealed.ts`: the relaxed rule.
- Roadmap: a shipped twig under Daydreams.
- This plan into `docs/historical-plans/`.
