# One marked summary instead of a sentence and a premise

## Goal

The new-daydream draft showed a one-line fill-in-the-blanks sentence ("I want
a [steamy] story where I [talk with] [Vesper] in [The night train].") with the
premise and cast notes under it. The sentence's fixed shape is restrictive.
Replace both with one summary the model writes, whose first mention of each
changeable piece is a blank, and say whatever it could not fit naturally in a
paragraph of our own after it.

## What changes

### The model's summary

- The `daydream` suggest task asks for a `summary` too: one paragraph, two to
  four sentences, second person, under a length cap.
- It marks the first mention of each piece as `[[key|words]]`: `scene`,
  `heat`, `voice`, or a character's name. Only where it fits naturally, never
  forced; how it is told especially may be left out.
- `parseMarkedSummary` (pure, `daydream/summary.ts`) reads it against the
  kept characters' names: unknown keys and repeat markers keep their words as
  text; a stray `[[`/`]]`, an empty or over-long summary make it null.
- `StoryPieces` carries it; it is display-only and never part of the sealed
  setup. The page passes it to the form beside the draft.

### What the form shows (`setupSummary`)

- Paragraph one: the model's summary, while it still describes the setup
  (same scene title and premise, same voice, every named character still
  there by name); otherwise the premise, capitalised and punctuated. A
  ready-made story always gets its premise.
- A heat blank in the model's paragraph uses the model's word until the heat
  changes, then the heat's own label.
- Paragraph two: one generated sentence holding every piece not yet a blank,
  shaped per voice preset like the old sentence but in the second person;
  characters added there carry "(part, relationship)", which replaces the old
  cast notes; characters already mentioned appear as plain names where the
  grammar needs them. No second paragraph when nothing is missing.
- The layout is renamed `sentence` → `summary`; `castNotes` and the premise
  line go.

## Tests

- Pure: parsing (markers, repeats, unknown keys, whitespace, broken markers,
  caps), every voice's second paragraph, articles and heat labels, persona,
  partial mentions, character indices, heat relabelling, and when the model's
  paragraph gives way.
- `parseSuggestedDaydream` carries the summary; the prompt asks for it.
- Component: premise + paragraph, the model's summary with its blanks, giving
  way when the voice changes.
- e2e: the stub model returns a marked summary that leaves the voice out;
  specs read the new text.

## Docs

- `docs/daydreams.md`, "Starting one", the model inputs list and the tests
  list; AGENTS.md repo map; the roadmap twig's wording.
