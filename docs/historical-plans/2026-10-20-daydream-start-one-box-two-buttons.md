# Merge "What do you feel like?" and story ideas on /daydreams/new

## Context

On `/daydreams/new`, "What do you feel like?" (a box + "Write it") and "Or pick
one" (ready-made stories, "Tailor ideas" dialog, generated ideas) are unrelated
sections, and the dialog asks for a second description of the same thing. The
user wants one box with two actions: write a story straight from it, or get
story ideas based on it. That replaces "Tailor ideas" and its dialog. The
"Or start from one of these" idea chips go too, since the story cards cover
that role.

Decisions (from the user):
- "You as" moves up into the "What do you feel like?" section, above the
  buttons; it still filters the cards below. Without suggestions (no box), it
  stays beside "Pick one".
- Buttons: **Write this story** (primary) and **Suggest stories for this** (outlined,
  a succinct "suggest stories based on this").
- "Write this story" now also sends the chosen side, as a picked idea does.

## Changes

### `src/lib/components/DaydreamStarter.svelte`
- Describe section: heading, hint, textarea (unchanged), then
  `<DaydreamSidePicker bind:side />`, then a button row:
  - **Write this story** — `appearance/variant` filled brand when `canAsk`,
    calls `ondescribe` (label "Writing your daydream…" while `asking`).
  - **Suggest stories for this** — outlined, icon `lightbulb` (or `wand-magic-sparkles`
    kept on the other), disabled unless the box has text and nothing is
    running; calls `ongenerate(idea.trim())`; label "Thinking up stories…"
    while waiting. Its failure shows as an alert in this section (local
    `suggestProblem`, alongside the existing `problem`).
  - Both disabled while `asking`, `suggesting` or `gettingMore`.
- Delete the chips fieldset, shuffle button, `.chip`/`.chips`/`.shuffle` CSS,
  the `ideas` bindable prop, and the `hasChip`/`toggleChip`/`pickIdeas`/
  `SHOWN_IDEA_CHIPS` imports.
- "Pick one" section: drop the "Tailor ideas" button and the
  `DaydreamIdeasDialog` mount; render `DaydreamSidePicker` in its head only
  when `!suggestionsOn`. Generated ideas keep their current place and
  behaviour ("For “…”" + Clear, cards, More ideas, ready-made hidden while
  shown). Heading stays "Or pick one" / "Pick one".
- Update the component's doc comment.

### Delete `src/lib/components/DaydreamIdeasDialog.svelte`
No longer used. `DaydreamSidePicker.svelte` stays (now one instance, but its
per-instance radio name is harmless; update its comment, which mentions the
dialog).

### `src/routes/(auth-required)/(app)/daydreams/new/+page.svelte`
- Remove the `ideas` state and `bind:ideas`.
- `ondescribe={() => writeDraft({ idea, side })}` so the side is used.
- `generateIdeas` unchanged (request now comes from the box). Update its
  comment ("Tailor ideas" → "Suggest stories for this").

### `src/routes/(auth-required)/(app)/daydreams/new/+page.server.ts`
Drop `ideas: pickIdeas()` and the import.

### `src/lib/daydream/starters.ts` (+ `starters.test.ts`)
Remove `SHOWN_IDEA_CHIPS`, `pickIdeas`, `DAYDREAM_IDEA_CHIPS` and their tests
(the "offers ideas that toggle as chips" and `pickIdeas` describes) — no other
users (`daydream/chips.ts` stays; it's used by the setup form).

### Comments / copy elsewhere
`src/lib/daydream/suggestions.ts` ("Tailor ideas" in `GENERATED_IDEAS` and
`GeneratedIdea` comments), `src/lib/daydream/suggest.ts`,
`src/lib/server/daydream/suggest-prompt.ts` (`ideasRequestSchema` comment)
→ "Suggest stories for this".

### `docs/daydreams.md` ("Starting one")
Rewrite the describe bullet (no chips; one box, "You as", two buttons;
Write this story sends the side) and the generated-ideas paragraph (asked
from the box, no dialog). Update the "In transit" line: generated ideas send
what was typed in the box.

## Tests
- `DaydreamStarter.svelte.test.ts`: drop the chip toggle and shuffle tests and
  the `ideas` prop; replace the dialog test with: Suggest stories for this disabled
  with an empty box, calls `ongenerate` with the box text, shows its failure
  inline; "You as" is in the describe section and filters cards; with
  suggestions off, "You as" is beside "Pick one" and neither button exists.
  Keep the generated / Clear / More tests.
- `e2e/daydreams.spec.ts`: rewrite the tailored-ideas test — choose Sub in
  the top "You as", fill the box, click "Suggest stories for this", assert generated
  cards, More ideas, pick one, back, Clear. Check other specs that click
  "Write it" or chips (`grep "Write it"` in `e2e/`) and rename.
- Add/adjust a page-level check that "Write this story" sends the side: the
  model stub already titles ideas by side; for the daydream task, assert via
  the e2e stub if it echoes the side, otherwise cover in the component test
  that `ondescribe` is called and in the page by reading code (writeDraft is
  page-internal).

## Verification
- `npm run check`, `npm run lint`
- `npx vitest run src/lib/components/DaydreamStarter.svelte.test.ts src/lib/daydream src/lib/server/daydream "src/routes/(auth-required)/(app)/daydreams/new"`
- `npx playwright test e2e/daydreams.spec.ts`
