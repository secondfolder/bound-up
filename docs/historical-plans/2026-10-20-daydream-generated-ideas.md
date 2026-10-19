# Generated story ideas on the new-daydream page

Request: add a generate button to "Or pick one". Clicking shows a dialog
where the user types the kinds of story ideas they want; the generation
takes the "You as" setting into account.

## Plan

- New suggest task `ideas` (`suggest-prompt.ts`): `{ task, request, side, limits }`,
  `request` capped at `DAYDREAM_LIMITS.idea` and non-blank, `side` `'dom' | 'sub' | null`.
  The prompt asks for `GENERATED_IDEAS` (four) varied ideas, each a title,
  a premise, a few tags, which side the user is on, and a heat and kink
  rating. With a side, every idea puts the user on it (or on neither, for a
  story with no one in charge); with "Either", a mix.
- The `daydream` task takes an optional `side` too, so an idea expanded into
  a whole daydream keeps the user on the side it was generated for.
- `parseGeneratedIdeas` (`suggestions.ts`): lenient, capped like the rest;
  drops an idea with no title or premise, a duplicate title, and one that
  puts the user on the other side from the one asked for. Premise capped so
  title and premise together fit the `idea` cap they are expanded from.
- `suggestIdeas` in `daydream/suggest.ts`.
- `DaydreamIdeasDialog.svelte`: a textarea for the request, prefilled with the
  last one, saying which side it is for; "Generate" stays in the dialog with
  "Generating…" until the answer is in, then closes; a failure shows in it.
- `DaydreamStarter.svelte`: a "Generate" button beside "Or pick one" (only
  with suggestions on). Generated ideas show as cards above the ready-made
  ones, under the request they came from, filtered by "You as" the same way
  (`ideasFor`). Picking one runs the `daydream` suggestion with the idea's
  title and premise and its side, landing on the sentence setup; "Try another"
  asks again with the same idea.
- The page owns the generated ideas and the request, so "Other ways to start"
  comes back to them.
- Tests: prompt and schema (node), parser (node), endpoint accepts the task
  (node), the starter component (browser), and an e2e spec through the model
  stub, which answers `ideas` with one idea per side.
- Docs: `docs/daydreams.md` "Starting one" and "What the server sees";
  roadmap twig under Daydreams.
