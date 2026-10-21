# Prompt review tooling for Daydreams

## Context

Daydream prompts are assembled from many conditional pieces. `buildSuggestMessages`
(src/lib/server/daydream/suggest-prompt.ts) varies by task, target, field, narrator,
side, voice, chosen idea, research and link reading. `buildMessages`
(src/lib/server/daydream/prompt.ts) varies by narrator, stance, character count,
lead, heat, pictures, mode, stopped state and turn types. No one can review every
variant by reading the source, and wording bugs slip through, like the
"before anything else" said twice and the typos fixed earlier in this session.

The goal:
- generate every distinct prompt
- give a debug-mode page where a person can browse, compare and diff them
- give Claude Code an export it can read and a script that runs a review
- commit a snapshot, so every wording change shows up in git diffs

## Approach

### 1. Prompt catalogue: pure, node-runnable core

New folder `src/lib/server/daydream/prompt-catalogue/`. Nothing in the builder
chain imports `$env`/`$app`, so this runs under vitest, tsx and SvelteKit alike.

- **`axes.ts`**: one axis list per *builder*. The builders are `reply` plus each
  suggest task: `daydream`, `ideas`, `fill`, `chips`, `surprise-idea`, `casting`,
  `name`.
  - Each axis has an id, a label, its values, and a `kind`.
  - `structural` axes change which sections appear. Examples: narrator, stance,
    character count (0/1/2), lead, heat (unset/1–5), pictures
    (null/z-image-turbo/sdxl/flux-2), reply state (opening/reply/rewrite/stopped),
    task, target, field, side, voice, chosen, research, canReadLinks.
  - `descriptive` axes only change a described value. Examples: kink, intensity,
    pace, length, the character dials.
- **`fixtures.ts`**: turns one combination into a builder input, in two text modes.
  - Placeholder mode, the default: every interpolated user field is a labelled
    sentinel like `⟦brief⟧` or `⟦character.name⟧`, so the UI can show what is
    template and what is user text.
  - Realistic mode: built from `DAYDREAM_STARTERS` / `starterSetup()`
    (src/lib/daydream/starters.ts).
  - Reuses `testDaydreamSetup` / `testCharacter` / `testIdea`
    (src/lib/testing/daydream-setup.ts). Those helpers move to
    `src/lib/daydream/fixtures.ts`, or are imported from there, since app code
    must not import `$lib/testing`. `src/lib/testing/daydream-setup.ts` then
    re-exports them.
  - The reply's "reply" state uses one conversation that contains every turn
    type: user text with each `readAs`, direction, steer ×3, safety yellow/resume,
    reaction, roll, omitted, and a story turn with expansion and image.
- **`render.ts`**: `renderPrompt(builder, combo, mode)` returns
  `{ messages, params: { maxTokens, temperature, readLinks } }`. It calls the real
  `buildMessages` / `buildSuggestMessages`.
- **`enumerate.ts`**: what "every combination" means, made tractable.
  - The full product of all axes runs to millions for the reply prompt. So it
    takes the **product of the structural axes** (about 16k renders for reply,
    a few hundred for suggestions).
  - Each **descriptive axis is swept from a baseline** on top of that.
  - It dedupes renders by hash into *distinct prompts*, each listing the combos
    that produce it.
  - **Paragraphs**: it splits every distinct prompt on blank lines and dedupes
    the paragraphs. For each paragraph it records the number of combos it appears
    in, plus per-axis value sets ("only when narrator ∈ {monologue},
    heat ∈ {3,4,5}"). Each piece of wording is then reviewed once.
- **`lint.ts`**: mechanical checks over every distinct prompt:
  - `undefined`, `null`, `[object Object]`, `NaN`
  - double spaces, a space after a newline, a repeated word ("then, then")
  - unbalanced `[[ ]]`, `{ }` or quotes
  - an empty section heading
  - a phrase that appears twice in one prompt ("before anything else")
  - a small typo list (seperate, approprate…)

### 2. Snapshot and export (committed)

- **`scripts/prompts-export.ts`**, run as `npm run prompts:export`. It writes
  `prompt-catalogue/`, which is committed, Biome-excluded and deterministic:
  - `README.md`: what this is and how to regenerate it.
  - `<builder>/baseline.md`: the full baseline prompt, messages labelled by role,
    with params.
  - `<builder>/axes.md`: for each axis value, a unified diff against the
    baseline.
  - `<builder>/paragraphs.md`: each distinct paragraph once, with its
    conditions.
  - `lint.md`: any lint findings.
  - `all.jsonl` is written to a gitignored location instead
    (`prompt-catalogue/.full/`): every distinct prompt with its combos, for
    grepping.
- Running the scripts:
  - **The `$lib` alias under tsx:** confirm that tsx honours `tsconfig` paths
    once `svelte-kit sync` has run.
  - **If it doesn't:** run the script through vitest (a `prompts.export.ts`
    using `vitest run --project node` with an env flag), so Vite resolves the
    aliases.
- **`prompt-catalogue.test.ts`** (node project) regenerates the files in memory
  and fails when they differ from the committed ones, naming
  `npm run prompts:export`. Like any snapshot test, it makes every prompt change
  visible in the diff.
- **Interaction test.** For every structural combo, each descriptive axis must
  change the same paragraphs, and only those. That proves the sweep stands in
  for the full product, so "every combination" is a checked claim and not a
  hope. If an axis fails it, the test names the axis, which then becomes
  structural.

### 3. Claude review script

`scripts/prompts-review.ts`, run as `npm run prompts:review [-- --since <git ref>]`.

- It runs the export, then `claude -p` with a fixed review brief, pointed at
  `prompt-catalogue/`.
  - The brief asks for: contradictions, ambiguity, instructions that conflict
    between sections, typos, inconsistent terms or numerals, and dead branches.
- With `--since`, it also passes `git diff <ref> -- prompt-catalogue/`, so the
  review covers only what changed.
- Output goes to `prompt-catalogue/.review.md` (gitignored).
- Nothing in the app spawns a process.

### 4. Debug tools page in the app

- **Routes:**
  - `src/routes/(auth-required)/(app)/debug/+page.svelte`: an index of debug
    tools, one card for now.
  - `debug/prompts/+page.svelte` and `+page.server.ts`.
- **Guard:** `requireFeature(locals.db, user.id, 'debugMode')` in every load and
  endpoint (src/lib/server/features.ts:43).
- **Link:** in the `{#if debugOn}` block on `settings/+page.svelte` (around
  :98).
- **Endpoint:** `src/routes/api/debug/prompts/+server.ts`, with the same guard.
  - `GET ?builder&combo&mode` renders **one** combination.
  - `?sweep=<axis>` renders one per value of a single axis, at most about 10.
  - This keeps each request cheap on Workers' Free plan CPU limit.
- **Precomputed views:** the exhaustive views (paragraphs, lint, distinct count)
  come from the committed `prompt-catalogue/` JSON. It is imported at build
  time, small because paragraphs are deduped, and nothing enumerates at request
  time.
- **UI** (Web Awesome components, theme tokens, CSS in the component):
  - **Explorer:**
    - Builder picker, and one control per axis.
    - The state lives in the URL query, so any variant can be linked.
    - Messages are collapsible blocks showing role, character count and a
      rough token count, plus the params.
    - `⟦placeholders⟧` are highlighted.
    - A paragraph outline sits beside it.
  - **Compare:** "Pin as A", change the axes for B, then a side-by-side or
    unified diff. It is word-level, with an ignore-whitespace toggle. It uses
    `diff` (jsdiff), a new dependency, run client-side.
  - **Sweep:** pick an axis and see each value's diff against the current
    combination, stacked.
  - **Paragraphs:**
    - Every distinct paragraph with its conditions and how many combos it
      appears in.
    - A filter by text or axis.
    - Clicking one jumps the Explorer to a combo that contains it.
  - **Reviewed marks:** per paragraph hash, in localStorage (per device, wrapped
    in try/catch). After a prompt edit, only the changed paragraphs show as
    unreviewed, with a "new since you last reviewed" filter.
  - **Lint:** findings with links to the variants.
  - **Copy and download:** copy a variant as plain text or JSON, and download
    the current builder's export.

### 5. Docs and conventions

- New `docs/prompt-review.md` covering:
  - the structural/descriptive axes and the interaction test
  - the export, the snapshot, the review script and the page
  - how to add an axis when a prompt gains a condition
- Add it to the AGENTS.md feature-doc table, and add a convention: a prompt
  change is not done until `npm run prompts:export` has run and the snapshot
  diff has been read.
- Add a section to `docs/debug-mode.md` on the debug tools page.
- Copy this plan into `docs/historical-plans/2026-10-21-prompt-review-tooling.md`.

## Critical files

- New: `src/lib/server/daydream/prompt-catalogue/{axes,fixtures,render,enumerate,lint}.ts`
  and their tests, `scripts/prompts-export.ts`, `scripts/prompts-review.ts`,
  `prompt-catalogue/`, `src/routes/(auth-required)/(app)/debug/**`,
  `src/routes/api/debug/prompts/+server.ts`, `docs/prompt-review.md`.
- Changed: `package.json` (scripts and the `diff` dependency), `biome.jsonc`
  (exclude `prompt-catalogue/`), `.gitignore` (`prompt-catalogue/.full/`,
  `.review.md`), `settings/+page.svelte`, `src/lib/testing/daydream-setup.ts`,
  AGENTS.md, `docs/debug-mode.md`.
- Reused: `buildMessages`, `buildSuggestMessages`, `testDaydreamSetup`,
  `starterSetup`, `requireFeature`, `ExchangeEntries.svelte`'s `<pre>` styling.

## Verification

- `npm run prompts:export` twice gives no diff (deterministic). Editing one
  sentence in `suggest-prompt.ts` makes the snapshot test fail, and the
  re-export diff shows only the paragraphs that use it.
- Unit tests for enumerate (dedupe, conditions), lint (each check against a
  planted mistake), the interaction test, and the endpoint (404 without
  `debugMode`, one render per request, sweeps capped).
- A component test for the diff view.
- An e2e test: a debug-mode account opens /debug/prompts, switches the narrator
  to monologue and sees the monologue paragraph. It pins A, changes the side and
  sees a diff. An account without the feature gets a 404.
- `npm run prompts:review -- --since HEAD~1` produces `.review.md`.
- `npm run check`, `npm run lint`, `npm test`, and `npm run preview` with a page
  load. The JSON imported at build time must stay within the worker bundle.
