# Dreams: the new daydream engine

A rebuild of [Daydreams](daydreams.md) from scratch, beside the current
feature, which keeps running until the new one replaces it. The plan it
follows is
[docs/historical-plans/2026-10-29-daydreams-rebuilt.html](historical-plans/2026-10-29-daydreams-rebuilt.html);
this doc describes what exists so far, and grows with each phase.

The code is called `dream` so it never collides with the old `daydream`
modules. Users will still see "Daydreams".

## Why a new engine

The first engine made every daydream fit one of six voices, each with its own
prompts. Requests that fit none of them were hard to serve, stories in the same
voice came out alike, and the combinations were a lot to maintain. The new one
has the model write **telling notes** (prose about what this daydream is and
how it reads) and **elements** (anything worth a record, of any type), and
offers a **menu of capabilities** it may opt into. Code supplies the
randomness: the model lists several directions and code picks one.

## What exists now (phase 0, the tooling)

| Piece | Where |
| --- | --- |
| The lenient markup parser | `src/lib/dream/markup.ts` |
| Reading each reply: brief reading, build, footer, elements | `src/lib/dream/reading.ts`, `build.ts`, `footer.ts`, `elements.ts` |
| Capabilities and the tags each allows | `src/lib/dream/capabilities.ts` |
| Code's randomness: seeded draws, the direction pick, nudges | `src/lib/dream/random.ts`, `pick.ts`, `nudges.ts` |
| Repetition, overused names, clichés | `src/lib/dream/repetition.ts` |
| The prompts | `src/lib/server/dream/prompts/` |
| A minimal OpenRouter client | `src/lib/server/dream/openrouter.ts` |
| The bench, its checks and the variety fingerprint | `src/lib/server/dream/bench/`, `scripts/dreams-bench.ts` |
| The pairwise judge | `bench/judge.ts`, `scripts/dreams-judge.ts` |
| Blind A/B votes and the leaderboard | `/debug/dreams`, `src/lib/server/dream/ab.ts`, `bench/leaderboard.ts` |

Everything under `src/lib/dream/` is pure and alias-free, and so is everything
under `src/lib/server/dream/`, so the bench can run it under `tsx` outside
Vite. Keep it that way: an import of `$lib` or `$env` there breaks the bench.

There is no player-facing route, table or UI yet: only the dev-only voting
page.

## The markup

Every reply is tags the model writes (`<musts>`, `<direction p="0.3">`,
`<say who="ines">`, `<after>`…), read by `parseMarkup`. It is lenient because a
model writes it:

- an unknown or malformed `<…>` stays as text, so `<3` or `2 < 3` in prose is
  safe;
- a close tag nothing opened is ignored, and anything left open is closed;
- `[[id|words]]` is a reference to an element code could not link by name;
- `<after>` (the footer) and, in a build, `<passage>` are kept raw, because
  their content is parsed separately;
- nothing it returns is HTML.

While streaming, the reply is parsed again from the start on each chunk. That
is cheap at a passage's size, and it makes the streamed result the whole-text
result by construction. The one difference is that a partly written tag or ref
at the end is held back, so it never flashes up as text. The test splits a
passage at every character to check this.

The **footer** is one JSON object per line (`next`, `new`, `pref`, `set`,
`telling`), each checked against its own schema, so a malformed line is
dropped on its own.

**Elements** are read into `DreamElement` JSON and written back in the same tag
format for the model's next prompt (`serializeElements`), so the model always
reads what it writes. Their type and fields are free; `<stat>` is the one child
with a fixed shape, because code applies its changes. At most 12 elements and
1,200 characters each; past that, whole fields are dropped, never cut.

## The pipeline, as the prompts have it

1. **Reading the brief** (`readingMessages`): musts, research, spread (1–8),
   that many directions with how likely each is, an optional
   `<pick by="user">`, and at most one question. No `<pick>` tag, or
   `by="code"`, means code picks; only `by="user"` waits for the user.
2. **Picking** (`pickDirection`): each direction weighted by its likelihood
   raised to a power set by the spread (`tiltFor`), so a wide brief leans
   towards the unlikely directions.
3. **Building and opening** (`buildMessages`): title, heat, telling notes,
   presentation (view and a theme from a curated set), capabilities, elements,
   and the opening passage in the same reply.
4. **Passages** (`passageMessages`): the fixed core and the chosen
   capabilities' blocks first, then the setup, the story so far (footers cut
   to their `next` line), and last what is happening now, including the
   phrases repeated in recent passages as "don't reuse".

The core rules (`prompts/core.ts`) are code, never model-written text: adults
only, no real people, the user's limits, consent as settled, quoted material
as material. They also say this is an app for adults' fantasies, so a brief's
kink vocabulary is read in its kink sense. Without that, "a training dynamic"
came back from the first bench run as a gentle magician's apprenticeship.

**Heat** is part of the build (`none`, `suggestive`, `steamy`, `explicit`),
because it will decide which providers can serve a daydream. It defaults to
`steamy` when the model leaves it out.

Limits are best effort: they are in every prompt's core, but nothing checks
passages against them in code. Word matching cannot tell whether a word refers
to the user.

## The bench

```sh
npm run dreams:bench -- --models z-ai/glm-5.2 --briefs training,texts --runs 3 --seed tuesday
```

It runs each brief in `bench/briefs.ts` through the pipeline on each model and
writes `dream-bench/<time>-<seed>/` (gitignored, because it is generated adult
prose in plain text):

- `summary.md`: per brief and model, how many checks passed and how varied the
  runs were (distinct picks, titles and first lines, and repeated names), then
  every failed check with what it saw;
- `runs/*.md`: each run in full, every prompt as sent and every reply as
  received, which is how a prompt change is read before it ships;
- `runs.json`: everything, for scripts.

The key is `OPENROUTER_API_KEY`, or else the OpenRouter key in `local.db`'s
server settings. It costs real money, and the summary says how much.

Every run is labelled with the prompt version under test: the commit, marked
`+dirty` when `src/lib/dream` or `src/lib/server/dream` has uncommitted
changes, or a name given with `--label`. The judge and the voting page compare
labels, so bench the old prompts and the new at two commits (or two labels).

The bench streams, so its timings are time to the first words of each step,
which is what the plan's targets are (`TIME_TARGETS_MS`).

After each run, a cheap model reduces it to a **fingerprint** (`setting`,
`power`, `form`, `userRole`, `hook`, `opening`), and the summary counts each
field's distinct values across a brief's runs: "the training brief produced 4
settings in 20 runs, 11 of them a studio" is variety a person can read. Pass a
cheap, permissive model with `--fingerprint-model`; it defaults to the first
writer.

All of code's randomness in a run (nudges, the pick) comes from one seed
(`--seed` plus the run number and the brief), so two prompt versions can be
compared on identical draws. Briefs carry what a person would expect of them
(a spread range, an element range, code-checkable musts), and the checks in
`bench/checks.ts` flag runs far outside those, along with tags the daydream
did not enable, missing footers, more than one question, bare stat changes,
overused names, clichés, repetition, and slow first words.

`runBrief` takes its completion function as an argument, so
`bench/run.test.ts` runs the whole pipeline against canned replies.

### What the first runs found

- A model may write the footer after `</passage>`; the build accepts it as the
  passage's own.
- GLM 5.2 cannot count to 500: asked for the word 500 times, it repeated it
  until it ran out of tokens. That brief stays on the bench as a test of
  flexibility. No code checks counts at runtime.
- A model passed its own indecision on to the user as `<pick by="user">`; the
  reading prompt now says that is only for briefs that ask to choose.
- The opening used `<ask>` without opting into questions, which the bench
  flags. The prompt now says the opening uses only the chosen capabilities'
  markup.

## The judge

```sh
npm run dreams:judge -- --a dream-bench/<folder-a> --b dream-bench/<folder-b> --model mistralai/mistral-small-3.2-24b-instruct
```

It pairs runs of the same brief from two folders and asks six questions
(`JUDGE_QUESTIONS`: the brief, the musts, consistency, writing, markup,
structure), each in both orders. A verdict counts only when the orders agree,
which cancels a judge's lean towards whichever it read first, and both runs
are cut to the same length first, because judges prefer longer answers. It
writes `dream-bench/judge-<a>-vs-<b>.md` with a table and the reasons.
Verdicts are cached by content in `dream-bench/.judge-cache.json`, so judging
again after a change pays only for what changed.

Use a judge from a different family than the writer. Mistral Small reads
explicit content without refusing and judged two pairs for under a cent;
mainstream models may refuse it. **The judge only sorts.** Judges track
individual taste poorly and have been found to reward overwrought prose, so
your votes decide.

## Voting

`/debug/dreams`, on a dev server, for an account with debug mode: two runs of
the same brief from two prompt versions, side by side with the sides
shuffled, and a vote (left, tie or right) with optional tags (samey, off
brief, too much markup, flat, loved it). Each vote goes to
`dream-bench/votes.jsonl` as a win for A or B, never a side, and the page
moves straight on to the next pair. Under it, the **leaderboard**: a
Bradley–Terry fit over every vote (`bench/leaderboard.ts`), one strength per
version, with ties as half a win each.

It reads the developer's own dream-bench/, so it exists only on a dev server.
`src/lib/server/dream/ab.ts` uses Node's file system and is imported only
behind `dev`, which keeps it out of every build. Passages are shown as plain
text for now; the renderer comes with the player.

## Not built yet

Every later phase: providers and their adult-content checks, routes, storage,
the live setup page, the views, preferences, research, names, read-aloud. See
the plan. The judge's agreement with your votes and the simulated player come
once there are votes to compare and a play loop to play.
