# Keep a daydream's brief and research

## Goal

A daydream written from a brief on the new-daydream page throws away most of
what went into it: the brief as the user wrote it, and what the model read in
the links and thought through. The fields it fills are a synthesis, which is
right for them, but the story model never sees the material behind them. Keep
both, on the idea, and send them to the story model.

## Decisions (agreed with the user)

- **On the idea**, as two new fields: `brief` (what the user asked for, kept
  verbatim) and `research` (the model's notes: what it found in linked pages,
  themes, tropes and sayings quoted as found, what it built on and why, and
  what it weighed but left out). Shown under "More detail" in the idea dialog,
  editable, and kept by "Save to my ideas", so a reused idea keeps them.
- **A picked generated idea carries the brief and the ideas round's research
  through.** The `ideas` answer gains one shared `research` block, kept on each
  idea of that round. Picking one sends the original brief, the chosen idea's
  title and premise, and that research, and the daydream request does not
  fetch the links again.

## Changes

1. `src/lib/daydream.ts`: `DaydreamIdea` gains `brief` and `research`;
   `EMPTY_IDEA` gets both empty; `DAYDREAM_LIMITS.ideaResearch` (4000).
   They are **not** in `IDEA_TEXT_FIELDS`, so Fill in the rest, chips and the
   casting prompt never write or rewrite them; a separate `IDEA_ORIGIN_FIELDS`.
2. Sealed kinds: `daydream-scene` v2 and `daydream-setup` v5, each upcasting
   the previous version with both fields empty. New frozen fixtures, sealed
   independently; older fixtures' `expected` moved to the upcast value.
   Raise ciphertext caps if a full record no longer fits.
3. `suggest-prompt.ts`:
   - `daydream` request: `brief` stays the user's own words; optional `chosen`
     (`{ title, premise }`) and `research`. With `chosen` the prompt says they
     picked that idea from ones offered for the brief; with `research` it gives
     the earlier notes as material, never instructions, and links are not read
     again.
   - `daydream` answer: `"research"` after `voice`, before `idea`.
   - `ideas` answer: `"research"` first, shared by the round.
   - Token budgets grow for the notes.
4. `suggestions.ts`: `parseSuggestedDaydream` reads `research` (whole lines
   kept to the cap); `parseGeneratedIdeas` gives each idea its round's
   `research`; `ideaBrief` goes. `suggest.ts`: `suggestDaydream` puts the
   brief the user wrote on the idea, and the research (the answer's, else the
   one passed in).
5. New-daydream page: picking an idea sends `brief` (the round's), `chosen`,
   `research`; Try another keeps doing the same.
6. `prompt.ts` `describeSetup`: after the idea's notes, "What the user asked
   for, in their own words" and "Background research from when it was set up"
   — marked as material, not instructions, since it comes from web pages.
7. `DaydreamIdeaDialog.svelte`: the two fields under "More detail"; the form
   schema carries them.
8. Everything else that builds an idea (starters, catalog, test fixtures) gets
   the two empty fields.

## Tests

- Sealed: upcasts, new fixtures, a full idea and setup fit their caps.
- `suggest-prompt.test.ts`: research asked for in both answers; `chosen` and
  `research` in the daydream prompt; links not re-read with research.
- `suggestions.test.ts`: research parsed and capped; generated ideas carry it.
- `prompt.test.ts`: brief and research reach the system prompt, marked as
  material; absent when empty.
- Idea dialog component test: the fields are shown and saved.

## Docs

`docs/daydreams.md` (Starting one, Links in a brief, Ideas, What the server
sees) and this plan in `docs/historical-plans/`.
