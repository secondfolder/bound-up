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

## What exists now

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
| The story tree, request schemas, stream events, routing level | `src/lib/dream/tree.ts`, `requests.ts`, `events.ts`, `routing.ts` |
| Sealed kinds and storage | `src/lib/sealed-kinds/dreams.ts`, `src/lib/server/dreams.ts` |
| The relay and the small calls' prompts | `src/lib/server/dream/relay.ts`, `prompts/fill.ts` |
| The API | `src/routes/api/dreams/`, `src/lib/server/dream-api.ts` |

Everything under `src/lib/dream/` is pure and alias-free, and so is everything
under `src/lib/server/dream/`, so the bench can run it under `tsx` outside
Vite. Keep it that way: an import of `$lib` or `$env` there breaks the bench.

`src/lib/server/dream-api.ts` and `src/lib/server/dreams.ts` are outside
that directory on purpose: they reach the database, settings and features
through `$lib`, which the bench never needs.

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

## Providers (phase 1)

Which of a model's providers allow adult content, and routing around the ones
that refuse, is in [server-settings.md](server-settings.md#adult-content-by-provider):
the admin's *Check adult content*, the `model_providers` table, the back-off,
and `routeFor`. The engine's routes call it for every request (see
[Adult-friendly providers](#adult-friendly-providers)).

## The feature

`dreams` in `src/lib/features.ts`, separate from the old `daydreams`
because every passage costs money: an account has to be granted it. Every
route under `/api/dreams/` starts with `dreamsGuard`
(`src/lib/server/dream-api.ts`), which checks the session and the feature,
since `api/` routes sit outside both route groups and inherit no guard.

## Storage

New tables and new sealed kinds, independent of the old engine's
(`src/lib/server/db/schema/app.ts`, migration `0056_add_dreams`, which only
adds tables). Everything the user or the model writes is sealed in the
browser to the user's own vault; the server checks the envelope, that it is
the owner's vault, and the tree's shape, and never reads content.

| Table | Sealed kind | Holds |
| --- | --- | --- |
| `dreams` | `dream-setup` | The brief, changes asked for while setting up, step 1's reading, the direction taken and code's draws, the build (title, heat, telling notes, presentation, capabilities, elements), this story's preferences |
| `dream_turns` | `dream-turn` | A passage (its source with markup and footer, what asked for it, how it ended, model and provider) or the user's turn (words, cycle settings, answers, rolls, filled-in fields) |
| `dream_details` | `dream-detail` | An element as it now stands (a card filled in, facts added), or a `<more>` expanded, on the turn it was written after |
| `dream_summaries` | `dream-summary` | A finished scene condensed, on its last turn |
| `dream_preferences` | `dream-preferences` | The user's own preferences for every daydream, hard limits among them |

The kinds are in `src/lib/sealed-kinds/dreams.ts`, each with a frozen
fixture. Recent directions (`dream-recent` in the plan) come with phase 4.

**Turns are a tree.** Every version of a passage (a retry, another take, an
edit) is a sibling under the same parent, and nothing is replaced. `role`
(`user` or `model`), the parent and the depth are the only plaintext. The
page shows one path, the opening down to `activeTurnId`; `getDream` loads the
whole tree's shape without content and only that path's turns, detail and
summaries, and `readDreamBranch` reads another path when the user moves to
it (`src/lib/dream/tree.ts` has the tree rules). Detail and summaries hang
off a turn, so each branch has its own, and the latest along the path wins.

**What a detail is about is sealed.** Element ids are words from the story,
so `dream_details` has no key column: the browser opens the path's details
and works out which is latest for each element.

**The setup is saved compare-and-swap** on `revision`, after each finished
step of setting up, so a reload carries on from there. The user's
preferences are the same, with a null revision to create them.

A daydream belongs to its owner's solo space and goes with it
(`deleteSpaceStatements`); its turns, details and summaries cascade.

## What the server sees

The routes that ask the model (`read`, `build`, `passage`, `fill`) are where
the server handles what the user wrote in plaintext. The browser posts the
words the model needs, because the server cannot open the sealed copies; the
request schemas in `src/lib/dream/requests.ts` bound their size and shape,
the prompt is assembled on the server from them, and the answer goes back.
Nothing stores, logs or inspects either: a failure is logged by kind alone,
never with an upstream message, which can quote the request back. Every
request to OpenRouter carries `data_collection: deny`. Before the first, the
user accepts the same disclosure the old engine asks for
(`hasAcceptedDisclosure`), since it is the same provider on the same terms.

A passage, a build or step 1 counts against the account's story replies
(`daydreamRateLimit`); a fill counts against its suggestions.

## Streaming

`read`, `build` and `passage` stream the engine's own events
(`src/lib/dream/events.ts`), not the provider's passed through, because the
server reads the reply to tell a refusal from a passage:

- `text`: more of the reply;
- `restart`: what came so far was refused or failed before any words; drop it,
  another provider is writing it again;
- `done`: finished, and how: `complete`, `stopped` (out of room), or
  `refused` when no provider was left to try;
- `failed`: it could not be finished. Words that already arrived are kept,
  and the page offers Retry.

`fill` answers whole, as JSON, for the small calls: an element filled in or
updated with facts, a `<more>` expanded, a scene summarised
(`src/lib/server/dream/prompts/fill.ts`).

## Adult-friendly providers

Each request needs an adult level (`src/lib/dream/routing.ts`): a passage's
comes from its daydream's heat (none 0, suggestive 1, steamy 2, explicit 3);
step 1 and the build ask for explicit, because a brief could ask for
anything and a provider that would refuse the story should not set it up.
`routeFor` lists the providers that passed that level and are not backing
off. The relay (`src/lib/server/dream/relay.ts`) pins each attempt to one of
them, so the outcome can be credited to it (`recordOutcome`), and tries the
next once after a refusal, a filtered or empty reply, or a failure before any
words. With no provider checked yet it sends one unpinned request under the
configured model and records nothing.

## Not built yet

The pages (the live setup page, the story view and its renderer), the
simulated player, and every later phase: interactive text and the block
gallery, preferences, research, names, stats and dice, read-aloud. Step 1
and the build are still two calls for a spread of 1. See the plan. The
judge's agreement with your votes comes once there are votes to compare.
