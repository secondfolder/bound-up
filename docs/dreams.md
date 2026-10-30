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
offers **capabilities** (stats, reveals, choices, questions, blocks, tone,
dice, pictures, voice) any passage may use. Code supplies the
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
| The play loop, setup steps, requests assembled, inline text | `src/lib/dream/story.ts`, `setup-flow.ts`, `assemble.ts`, `inline.ts` |
| The browser half: requests, sealing, the session | `src/lib/dream-browser/` |
| The pages and their components | `src/routes/(auth-required)/(app)/dreams/`, `src/lib/components/dreams/` |
| The simulated player | `src/lib/server/dream/bench/player.ts`, `--persona` |
| Read aloud: utterances and cues, voices, the reader, Fish Audio | `src/lib/dream/speech.ts`, `voices.ts`, `src/lib/dream-browser/reader.svelte.ts`, `src/lib/server/dream/fish.ts`, `/api/dreams/speak` |

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
`telling`, `style`, `suggest`), each checked against its own schema, so a malformed line is
dropped on its own.

**Elements** are read into `DreamElement` JSON and written back in the same tag
format for the model's next prompt (`serializeElements`), so the model always
reads what it writes. Their type and fields are free; `<stat>` is the one child
with a fixed shape, because code applies its changes. At most 12 elements and
1,200 characters each; past that, whole fields are dropped, never cut.

**Every element has something to be called on screen.** The build asks for a
name on every element, a pressure or a place as much as a person, and for
`short="…"` when the name runs past about three words; screens use
`elementLabel` (the short name, else the name), and the short name is linked
in passages like any other. One left unnamed anyway is named by code
(`fallbackName`): its type and the start of its description ("Pressure: The
inspection on Friday decides whether…"), or with nothing to go on, which of
its type it is ("Second Pressure"; just "Pressure" when it is the only one).
Unnamed ones used to be "pressure 5", the type and its place in the list.

**Pacing.** A brief that explicitly asks for a kink, a sexual act or a
particular scene gets to it in the opening or the passage after, the act
itself rather than hints of it, unless the brief, the user's preferences or
the chosen direction call for a build-up; the build says which in the telling
notes, and a brief naming a sexual kink or act is explicit unless it says
otherwise (`prompts/build.ts`).

**Form and length.** A form or a length the brief asks for is one of its
musts ("vignettes", "a list", "one long scene"). The build writes it into the
telling notes with how long a passage is, and every passage keeps to that
length (a few short paragraphs when nothing is said). Vignettes, snippets or
moments are each one self-contained moment of about 60 to 150 words, a new
scene each time, joined by the theme rather than a plot. Measured on the
bench (`free-use-vignettes`, a user's brief that had come back as one long
story, 2026-10-30): with Continue, each passage became its own moment of
110 to 160 words; with a player acting inside the scene, the model carries
that scene on, which is the user asking it to.

## The pipeline, as the prompts have it

1. **Reading the brief** (`readingMessages`): musts, research, spread (1–8),
   that many directions with how likely each is, an optional
   `<pick by="user">`, and at most one question. No `<pick>` tag, or
   `by="code"`, means code picks; only `by="user"` waits for the user.
2. **Picking** (`pickDirection`): each direction weighted by its likelihood
   raised to a power set by the spread (`tiltFor`), so a wide brief leans
   towards the unlikely directions.
3. **Building and opening** (`buildMessages`): title, heat, telling notes,
   writing style, presentation (the view), elements, and the
   opening passage in the same reply.
4. **Passages** (`passageMessages`): the fixed core and every capability's
   block first, then what stays the same in the setup (telling notes, the
   writing style, musts, research), the story so far (footers cut to their `next` line), and last
   what changes as it goes (the elements as they stand, the designed blocks,
   the preferences) with what is happening now, including the phrases
   repeated in recent passages as "don't reuse". See "Prompt caching".

**Capabilities are always offered** (`passageCapabilities`): every passage
may use any of them but voice, which is on only while the user listens.
The build used to choose them, so a story could not roll a die it had not
foreseen needing; sending them all is about 670 more input tokens a
passage, a fraction of a cent on the models in use (measured 2026-10-30),
and the prompt asks for restraint instead: "there to use, never to use up".
A build from before still has its `capabilities`, which nothing reads.

### Debug mode

Only an account that holds debug mode (the feature, not the device's switch,
which only decides what is shown) is sent what debug mode shows:

- **The request as it went to the model** (`exchange` events on a streamed
  reply; `request` with a small call's answer), never the key. The page keeps
  each with its reply and the model's thinking for as long as it is open
  (`session.exchanges`), by turn for a passage and by step for the setup.
- **What really went wrong** (`detail` on a `failed` event or a 502): an
  upstream error, a refusal's words. With debug mode on, the setup page
  shows it under its problem, and an error the page met itself (the one that
  reads "Something went wrong") shows its own message and stack.

Every reply also says what it cost and how much of its prompt the cache
served (`usage` on `done`), which each passage keeps (`usage` on the turn).
With debug mode on, each passage's end shows "N% cached" and an info button
that opens the request (`DreamExchange`): provider, model, cost, time,
the tokens (the prompt and how much of it was cached; the reply with any
thinking, and in brackets, when this page sent it, the most it could have
been, for telling a reply cut off by its budget, which the prompt does not
count against; the total), and the full transcript when this page sent it.
A passage's other requests, when this page made any, are in tabs beside its
own, one a kind: **Speech**, each clip read aloud from it (what went to Fish
Audio, never the key, with how long it took, and how much audio came back
with each word's timing; the speak route sends it as an `exchange` event),
and **More detail**, each phrase expanded and card filled in from a link in
it (the small call's answer, which the browser used to keep only the text
of). Each is a section of its own, as one passage read aloud is a dozen
clips (`session.passageExtras`, kept for the page only).

### Capturing in development

On `vite dev`, every request the engine makes of a model, and what came of
it, is written to `dream-log/<day>/` (gitignored) as one Markdown file a
request (`src/lib/server/dream-capture.ts`): the settings, every message
sent, the thinking, the reply or the error, the provider and the usage,
never the key. Readings, builds, passages, the small calls, designs and a
research model's step are all there, so a daydream played on a dev server
can be read back in full. It is inside `if (dev)`, a build-time constant,
so no build has it or the `node:fs` it uses; what a user wrote is in these
files, which is fine on a developer's own machine and nowhere else.

### Prompt caching

The providers cache a prompt's opening by themselves; no request asks for
it. Measured 2026-10-30 on GLM 5.2: every provider lists a cached-read
price, and the same prompt sent twice to DeepInfra, Novita or Wafer came
back with 98% of it read from cache, its prompt cost about 80% lower. A
response says so in `usage.prompt_tokens_details.cached_tokens`, which the
client reads (`cachedTokens`) and the bench reports ("Passages after the
first: …% of their prompts read from cache").

A cache serves only an identical opening, on the same provider, so:

- **The provider is the same from passage to passage**: the best tier, in a
  fixed order (`bestProviders`), unless one is backing off.
- **What changes goes last.** The elements change after nearly every passage
  (stats move, `#afterPassage` keeps facts), so they, the designed blocks
  and the preferences come after the history, in the message that asks for
  the passage; the system prompt and the history before them stay the same.
  With the elements in the system prompt, as they were, a cache could serve
  only what came before them.
- **The history holds still between summaries** (`memoryFor`): it starts at
  a fixed point, the last six passages the latest summary covers, rather
  than the last six passages, which slid on by one every passage and changed
  its opening each time. It moves when a scene is summarised.

An occasional miss is the provider's own (a request served by another of
its machines).

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

**The simulated player.** With `--persona`, a model plays the user for every
turn after the opening (`bench/player.ts`): eager, terse, steers, contrary,
continues, or explorer, each a short prompt. It sees only what a reader
would, each recent passage's words without markup or footer, and answers
with words or CONTINUE. The run keeps memory the way the page does, from the
same code (`memoryFor`, `sceneToSummarise`, `repeatedAt` in
`src/lib/dream/story.ts`): finished scenes condensed with the summary prompt
and sent as summaries, the recent passages word for word. So a long session
checks the memory a long story would really get:

```sh
npm run dreams:bench -- --models z-ai/glm-5.2 --briefs training --runs 1 --passages 20 --persona eager
```

### What the first runs found

- A model may write the footer after `</passage>`; the build accepts it as the
  passage's own.
- GLM 5.2 cannot count to 500: asked for the word 500 times, it repeated it
  until it ran out of tokens. That brief stays on the bench as a test of
  flexibility. No code checks counts at runtime.
- A model passed its own indecision on to the user as `<pick by="user">`; the
  reading prompt now says that is only for briefs that ask to choose.
- The opening used `<ask>` without opting into questions, which the bench
  flagged; capabilities have since become always offered.

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
| `dreams` | `dream-setup` | The brief, changes asked for while setting up, step 1's reading, the direction taken and code's draws, the build (title, heat, telling notes, writing style, presentation, capabilities, elements), this story's preferences |
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

**Every request goes to the best tier of providers there is**
(`bestProviders` in `src/lib/model-providers.ts`, whatever the daydream's
heat). Of the story model's providers not ruled out by the admin and not
backing off, only those that passed the highest level any of them passed:
all four levels when any provider passed them all, only the level-2 ones when
level 2 is the best, and every one when none passed any level, since trying
them beats not trying. A provider the admin always allows is in every tier.
A story can go anywhere its user takes it, so the most permissive providers
there are are the ones worth asking.

A model never checked goes unpinned, under the model as configured. One
whose providers are all ruled out or backing off is refused with a 503 that
says to try again shortly, and nothing is sent.

The relay (`src/lib/server/dream/relay.ts`) pins each attempt to one provider
of the tier, so the outcome can be credited to it (`recordOutcome`), and
tries the next once after a refusal, a filtered or empty reply, or a failure
before any words. A refusal backs the provider off, so later requests drop
to the next tier until it is usable again. The small calls go to the first
of the tier, and a refusal there counts against it too.

The bench routes the same way from `local.db`'s checks (`bestTierProviders` in
`scripts/dreams-key.ts`). Check a model by making it the story model on a dev
server and pressing *Check adult content*.

## The pages

`/dreams` (`src/routes/(auth-required)/(app)/dreams/`), reached from the
Playroom's "Daydreams (new)" tile for an account with the feature:

- The disclosure first, the same one the old engine asks for.
- **One box**: "What do you feel like?" Start creates the daydream with just
  the brief, sealed, and goes to its page.
- **What I keep in mind**: a link to the preferences page, where limits
  live (phase 5).
- The daydreams so far, titled once built. One still being set up, or built
  and not yet started, is a **draft**: dashed, quieter, its brief in italics,
  "Draft, still being set up". One started shows when it was last played and
  how much there is to it: its passages, every branch counted (`passages`,
  counted in the list's own query), with a stack of pages drawn thicker the
  more there is (up to 3, 20, 100, and past).

`/dreams/[id]` opens the setup and the branch in the browser and hands them to
a `DreamSession` (`src/lib/dream-browser/session.svelte.ts`), which does the
work; the components in `src/lib/components/dreams/` draw it.

### The setup page

Until the daydream is built and the user has pressed Start, the page is the
setup, live (`DreamSetupView`). It lists the steps the daydream was really
set up by, in the order they were taken (`setupProgress` in
`src/lib/dream/setup-progress.ts`): **each request to the model is a step**,
what it looked up while it worked (each page read, each search) is under
it, and a pick and an answer are steps too. Doing something again, building
after a change or with another idea, is another step ("Building it again"),
and only the latest of each kind shows its results. The steps taken are kept
with the setup (`trail`, a setup from before it is worked out from what was
kept), the request being made now is `session.liveStep`, and what is still
to come follows from where the setup has got to. Each is marked as the
plan's mockup marks them: a ring to come, a turning ring while it works, a
filled tick when done, and for a step waiting on the user (a question,
choosing an idea) the ring itself breathing, never the spinner. While a
step works, the latest of what the model is writing shows under it, cleaned
of tags, or its thinking until its words begin; once done, what came of it.
With debug mode on, each step has a button for its request and the reply.

- **Looking things up**, a request of its own only when a research model
  does it (the page load's `research`); a story model with tools looks
  things up inside its reading, and those are under that step. The pages
  and searches are kept with the reading (`reading.lookups`).
- **Analysing what you asked for**: the musts, as plain lines, and the
  ideas: while they stream only a count ("5 ideas so far"), never cards
  appearing and going, unless the brief asked to choose.
- **A question for you**, when step 1 asked one, waiting on the user (an
  option or their own words); then **You answered**.
- **Picking one** (code, leaning towards the less likely, `codePick`), or
  **Choose an idea** when the brief asked to choose, with the ideas under it
  and "Surprise me"; "Try another idea" picks again.
- **Building it and writing the opening**: one request. The title, how
  sexual, how it is shown, the cast with an icon for each known type and its
  short name, and the opening's first sentence.

The brief is in a box of its own at the top, with any change asked for since
under it.

**Then a summary, which waits on Start** (the plan's "a surprise, with a
quick look first"; it offered straight in as well, which this replaced):
the title, the first line of the telling notes, who and what is in it with a
line each, how it is shown, how sexual, how it is written (see "Writing
styles"), what it keeps track of, and the
telling notes and research in full. **Start** plays it; **Pick another** picks
again from the same ideas and builds that. The setup records that it is
waiting (`awaitingStart`, set when the build is kept, cleared by Start), so a
reload still shows the summary. A daydream from before it has no such field,
and is played.

### Changing what was made

Every element on the setup page, in the summary and the build's cast, opens
its card, and the card's **Change** opens a form (`DreamElementForm`) for its
name, short name and every field, the ones behind the scenes too, kept as an
encrypted draft while it is typed. A change is kept in the build at once
(`withElementChange`) and noted in words ("Ines's manner is now: …",
`describeElementChange`) in the setup's `pendingEdits`. Since a change can
reach further than the element (the telling notes, how others are written,
the opening), **Update** then takes Start's place, with the changes listed:
it asks the build again from the build as changed, with the changes as one
change asked for, keeping them exactly and following them through
(`withEditsApplied`), and the result waits on Start like any build. Each
change listed can be undone (`withoutEdit`): the element goes back to how it
was before it (`editedFrom`, kept beside each change), and a later change to
the same element, made on top of it, goes too. Choosing another writing style
from the summary is a change of the same kind (`withStyleChange`), undone
the same way, and Update writes the opening again in it.

**Going back.** "How it was set up" beside the story's title shows the same
page with "Back to the story". Choosing another idea or changing it from
there builds a new opening beside the old one, which waits on Start again.

The setup is saved, sealed, after each finished step, so a reload carries on
from the last one; a step that was streaming runs again.

**"Not quite? Tell it what to change."** is always there. A change stops what
is running and is kept with the brief (`withAmendment`): before a direction is
chosen, step 1 reads the brief again with it; after, the build runs again from
the previous build plus the change, keeping the reading and the direction.

### Reading a passage

**Breaks are made even** (`tidyBreaks` in `src/lib/dream/beats.ts`). Models
write `\n\n<beat/>\n\n` between paragraphs, which drawn as written (the
passage is `white-space: pre-line`) was a blank line, the beat's space and
another blank line: three times a plain paragraph break, and it varied from
passage to passage. Now any run of blank lines is one paragraph break, the
line breaks beside a beat or a block go, and a paragraph break is drawn as
the same space a beat is. Read aloud, both end a sentence.

**Cards say what they are**: each known element type has an icon
(`element-icons.ts`: a person, you, a place, a thing, a pressure; a tag for
any other), on its card, its chips and the setup's cast.

### Playing

`DreamStory` shows the branch being read: each passage drawn by `DreamMarkup`,
the user's turns between, and where each passage ends, a rule across the page
with its versions (`‹ 2 / 3 ›`, hidden with one), Retry when it needs one, and
a `⋯` menu in the middle (More for this passage) with what else can be done
to it: Listen when reading aloud, Another take, Different direction, Edit. The
rule is what tells one passage from the next when two come in a row. None of
them throws anything away; each adds a turn beside the passage:

- **Retry**, only on a passage that stopped short, was refused or failed part
  way: writes it again for the same turn.
- **Another take**: the same events in new words. The passage being replaced
  is sent, marked to be rewritten.
- **Edit**: the user's own version of the passage, which later passages build
  on. For now it edits the passage's source, markup included.
- **Continue** (in the turn area, see "Your turn"): the next passage with no
  turn from the user.
  It reaches the model as handing it the next step (`CONTINUE` in
  `prompts/passage.ts`), not as the user's character staying silent, which
  the characters then reacted to, nor as their going along: the model
  decides the most interesting way on, which may be the character going
  along with what is asked of them or pushing back.
- **Stop**: what had arrived is kept as a version, marked stopped.

**How a turn is read** (`src/lib/dream/readings.ts`), from the first engine's
readings. When the user wrote words, the model says first, before the
passage, how it read them, as `<reading as="…"/>` (`READING` in
`prompts/passage.ts`): **action**, something they say or do, a plain bubble;
**direction**, where the story should go, drawn as a marker rather than a
bubble, since it is no turn in the story; **instruction**, what their own
turn should be ("Tell her I'm staying"), which the model writes out first as
`<yours>` in the first person and then answers: the bubble shows it,
"Written out for you", with "Show what you sent" for the words sent, set apart
as a note; **story**, part of the story they wrote; and **ooc**, out of
character, which a turn in out-of-character syntax (`(`, `[`, `//`, `OOC:`)
always is (`explicitOoc`). Asked after the passage instead, a model named
whatever reading its passage had already acted on. Both tags stay in the
history the model reads, and are never drawn in the passage. **Read it
differently**, the menu on each turn, answers the turn again with the
reading chosen, as a version beside the passage (`reread`): the reading is
kept on the new passage (`readAs`) and sent with the turn from then on, as a
note before the user's words, and the turn says "as you asked".

**Pull to continue.** On a touch screen, pulling the page up past the end of
the story and letting go is Continue, with "Pull to continue" stretching
into view as it is pulled and "Release to continue" past the point where it
will (`pullToContinue` in `DreamStory`). Only when the newest turn is a
passage and nothing is being written, and only for touch: a trackpad's fling
runs on past the end by itself and would continue by accident. The Continue
button is still there for everyone.

**Suggestions.** Each passage's footer offers two to four things the user
might write next (`{"suggest": [...]}`), in their own voice and varied: one
going along with the moment, one resisting or turning it, one somewhere
unexpected. They are never sent back to the model.

**Your turn** is one centred list of chips under the story, the three ways
to take it each drawn as what it is:

- the newest passage's **suggestions**, solid: a tap sends one. Held (half a
  second), or its menu opened (a right click, Android's long press, the menu
  key), it goes into the box instead, to change before sending
  (`holdToChange`; iOS sends no `contextmenu` for a long press, hence the
  timer). A long press selects nothing and opens no menu of the browser's;
- **Continue daydream**, outlined, with a forward icon: handing the story on;
- **Write response…**, outlined, with a pen, which grows into the box,
  focused, with Send and Cancel (a view transition, at once where the
  browser has none or the device asks for less motion). Cancel puts it away
  keeping what it holds for when it is opened again; the box stays mounted
  while put away, so a draft is restored on load.

The turn is in the **dock**, with the read-aloud player under it when
reading aloud is on. The dock is sticky at the bottom of what scrolls, as
the kink list's pinned bar is at the top: at the story's end it sits on the
page with no background, and scrolled up it stays in sight with a
background, faded in, right across the page (`watchStuck`, a sentinel just
after it that is out of sight below exactly when it is stuck). It is never
more than half the screen tall, so the story stays in sight on a phone: the
player keeps its room, and what of the turn does not fit scrolls inside it,
kept scrolled to its end, nearest the thumb (`startAtEnd`). The scroller is
inside the sticky box rather than the box itself, because a scroller clips
what is drawn beyond it, and the stuck background reaches right across the
page. The player used to stick on its own, just above the turn, where the
two could overlap.

While a passage is being written, the area holds only Stop. The box empties
as its words are sent, not once the answer has finished, and gets them back
if sending failed. It used to keep them until the end and then put them
back: superforms writes the submitted form into the box after `onUpdate`,
so the submitted copy is emptied too once they are taken.

Switching versions moves `activeTurnId` to the newest end of that version's
branch and reads the branch.

**Memory** (`memoryFor`): finished scenes on this branch go as their
summaries, and the passages since word for word, never fewer than the last 6
nor more than 16. After a passage, if a scene has ended (a
`<beat kind="scene"/>`, or 8 passages since the last summary), a summary is
written and kept on its last turn. Summaries are only added to.

**Elements as they stand** (`elementsAt`): the build's, then along the path
the people and things a footer adds (`{"new": …}`, a name and a seed), stats a
footer's `set` moves, and detail written after a turn, the latest winning.
After each passage one background call keeps facts in the elements (and
fills in new ones); its answer changes only elements that exist.

**Detail on tap.** A name is linked wherever it appears, by code
(`src/lib/dream/inline.ts`); tapping it opens its card (`DreamCard`). A card
that is still only a name and a seed is filled in with one small call, kept
against the turn the user is on. Fields marked not to show are under "Behind
the scenes". A `<more>` is expanded in place with one to three sentences on
tap, once, kept on its passage. Each branch keeps its own.

**The repetition guard** (`repeatedAt`): three- and four-word phrases
repeated across the last four passages' words go at the end of the prompt as
"do not reuse".

**Nothing typed is lost.** Every box (the brief, a limit, "change it", the
answer, the turn, an edit) keeps an encrypted draft on the device
(`src/lib/messaging/drafts.ts`, plain-text scopes) until what it holds is
taken.

## Interactive text (phase 3)

Everything below is drawn by `DreamMarkup`
(`src/lib/components/dreams/`), from the capabilities' tags. Each interactive part is a real button whose name says what it does,
in reading order, so the keyboard and a screen reader reach all of it:

| Markup | Drawn as | Its name |
| --- | --- | --- |
| `<hidden label="the card">…</hidden>` | Blurred until tapped | "Reveal: the card" |
| `<more>her ring</more>` | Dashed underline; one to three sentences written on tap | "Read more: her ring" |
| `<cycle id="wear" label="what you wear">a\|b\|c</cycle>` | The first option, in the accent; a tap moves to the next | "Change: what you wear, now a" |
| `<whisper>`, `<loud>`, `<slow>` | Smaller and quieter, bold, spaced | (text) |

**Passages with interaction.** Only the passage being answered takes input.
What the user sets there (choices, and fields as below) is kept in the
session (`choices`, `values`) and in an encrypted draft
(`dream-inputs`), so half-filled fields survive a reload, and goes with
their next turn (`turnInputs` in `src/lib/dream/fields.ts`): a choice only
where it was changed, every field of every block, an untouched field as
skipped. Earlier passages show what was sent after them, and take no input.

**What the model is told.** The turn reaches the model as the user's words,
then plain lines (`describeTurn` in `prompts/passage.ts`):
`The user's choices in the passage: wear = "nothing"` and
`The user filled in contract-1: c1: "initialled"; sig: skipped`.

**Tag hygiene.** A model imitates its own history: on a 20-passage
simulated session, a `<sound>` the daydream had not enabled turned up in
every passage. Passages now go back to the model with any tag their daydream
did not enable unwrapped to its words (`historyPassage`), and the build no
longer offers `voice`, which is on only when the user listens.

### The block gallery

`<block kind="…" title="…">`, with `<texts>` and `<letter>` as shorthands
(`blockKind`). Twelve kinds have their own layout, plus `letter`; every other
kind is a labelled card:

| Kind | Layout |
| --- | --- |
| contract | Numbered clauses, a serif face, fields inline, "Sign and return" |
| rules, schedule | Plain lines as a numbered list; `now="…"` marks the current slot |
| report | A letterhead with the title and `date` |
| questionnaire | Fields as a form, "Hand it in" |
| punch-card | `filled` of `of` stamps |
| texts, group-chat | Bubbles from `<say who>`, the user's (`who="you"`) on the right; group chat names each sender |
| email | A From, To, Cc and Subject header from the attributes |
| voice-note | A waveform and the transcript (read aloud comes with phase 8) |
| call-response | The leader's lines in bold, a "Say it" button for the user's |
| lines | The line in a handwriting face, with its counter, "Finish lines" |

**Fields** are one markup for every fill-in block:
`<field id="c1" type="…">label</field>`, where type is `initial`, `sign`,
`say` and `check` (toggles, native buttons with `aria-pressed`), `tap-count`
(`target="20"`, a button that counts, with the count announced), `choice`
(`<option>`s, as a `RadioButtonGroup`) or `text` (a `wa-input`). Each takes
its accessible name from its own words ("Initial: You will kneel."). A block
with fields has a Done button, labelled by its kind, that sends the turn.
Deck and draw wait for dice in phase 7.

### Designed blocks

A block of a kind no layout covers can be designed for the daydream
(`src/lib/dream/designs.ts`). The first time the story model uses one, it
describes it, `design="what it looks like, and what each slot is for"`, with
its content in named slots: `<slot name="days">x Mon; Tue</slot>`. The page
then asks for its design (`/api/dreams/design`): the story model again, with
a designer's prompt (`prompts/design.ts`), given only the description, the
slots and what first filled them, and replying with a layout in a small
language of a few parts (stacks, rows, grids, text in a handful of styles,
label-and-value pairs, lists, punch boxes, meters, dividers, and a frame:
card, paper, ticket, screen, badge or plain). Never HTML: `parseDesign` checks
the reply against the language, its size (40 parts, 5 deep) and that it draws
only the slots given, and keeps nothing that fails, so a design can shape a
block but never put anything else on the page. Each part is drawn from the
app's palette (`DreamDesign.svelte`).

A design is kept with the daydream (the setup's `designs`, twelve at most)
and listed in every later passage's prompt by kind, slots and description,
so using it again is its kind and slots with no `design`, and nothing is
designed twice. Until a design comes, or if it fails, the block is the
generic card with each slot labelled, and "Designing this…" while it is
asked for. Fields in a designed block are drawn under it, and work as in
any block. Capabilities are untouched: this is something the blocks
capability can do.

### Views

**The view is the build's choice** (`presentation.view`: as a story, one
beat at a time, as messages, as a monologue), and the user's to change from
**Reading settings** on the story page (`session.setView`), which keeps it
with the daydream, so it holds on every device.

**Tap-through** shows the passage being answered a beat at a time
(`splitBeats` in `src/lib/dream/beats.ts`: at `<beat/>` and paragraph breaks,
never inside a block or a spoiler), with Back and Next buttons and a tap
anywhere on the passage as a pointer's shortcut. The newest beat fades in,
unless the device asks for reduced motion.

**There are no themes.** The build used to choose one of seven looks for
the passages' area; blocks, which give a part of a passage the style of what
it is, do that better, so themes went (2026-10-30). An older setup's stored
theme is read and ignored.

### Colours

Each person in a daydream has a colour, so who is speaking shows at a
glance (`src/lib/dream/colours.ts`). The user is always the blue of the
"Me" context (`--space-colour-me`), the blue that is theirs everywhere
else, whether or not the daydream has a `<you>` element; each character is
given one of the contexts' colours (`SPACE_COLOURS`), in the order they came
into the story, so two never share one until there are more characters
than colours, and a character keeps theirs when others join. Code assigns
them, never the model, and nothing is stored: the order of the elements
decides, and it only ever grows. Places, things and pressures have none.

A person's colour is used for their speech (`<say>`, and a message's bubble
in a texts or group-chat block, tinted with it), their name where it links
to their card, the icon on their chip and on their card, and the player's
"who is speaking" line. A `<say>` for an id the elements do not know keeps
the shade of the theme its id hashes to, as all speech used to.

### Writing styles

Left to itself a model writes the same ornate prose for everything, so how a
daydream reads is chosen apart from what happens in it
(`src/lib/dream/styles.ts`). There are seven presets, each a short set of
concrete instructions:

| Preset | Suits |
| ------ | ----- |
| Plain and close (`plain`) | almost anything; the default |
| Raw and filthy (`filthy`) | explicit daydreams about the sex itself; crude or degrading dynamics |
| Lush and slow (`lush`) | slow burns, romance, sensual daydreams about anticipation |
| Cold and clipped (`clipped`) | strict or cold dominance, clinical or procedural settings |
| Light and teasing (`playful`) | flirtation, romantic comedy, bratty or playful dynamics |
| Pulpy and breathless (`pulp`) | adventure, thrillers, heists, plot-driven romps |
| Dark and heavy (`dark`) | horror, noir, captivity and menace |

They follow the craft advice on prose that is too ornate: concrete nouns and
strong verbs, little imagery and only fresh imagery, no atmosphere for its
own sake, the failure modes named (stock phrases like "a shiver ran down"),
and telling allowed where it gets from one moment to the next. `filthy` is
the user's own prompt for explicit roleplay, with everything but its style
and tone taken out (crude words over clinical ones, concrete physical detail
over metaphor, bodies specific to the scene, the feel of two people sexting).

**The build chooses** one, as `<style preset="…">notes</style>`, for the
brief's tone and the chosen direction; what the user's preferences say about
how things are written decides it over the tone. Notes adjust a preset for
this daydream. When the brief calls for a particular style and none fits,
the build writes `preset="own"` and describes the style itself. The build is
given every preset in full, since it writes the opening in the one it
chooses; a missing or unreadable tag is `plain`.

**Every passage is written in it**: `<writing-style>` in the system prompt,
the preset's instructions then the notes, and expanding a `<more>` gets it
too. A setup from before there were styles is sent `plain`, which is what its
menu shows.

**The story can change it** with a footer line, `{"style": "dark", "notes":
"…"}` or `{"style": "own", "notes": "…"}`, when the story has moved
somewhere another style would serve better. Unlike telling notes, the change
applies at once, with a notice saying so and an **Undo**; undoing makes the
style before it the user's choice. A line naming no preset and no notes is
dropped.

**The user can choose another**: from the summary before Start (a change by
hand, see "Changing what was made"), or from **Reading settings** while
playing, where it applies from the next passage. A style the user chose is
marked `by: 'user'`. Passages are told never to change it unless the user
asks; only the prompt can tell whether they did, so code does not refuse a
change, and every change can be undone. A rebuild is told to keep it, and
keeps it (`keptStyle`) while the build keeps its preset; a different preset
is the build following a change the user asked for.

## Variety (phase 4)

Every source of randomness is code's, never the model's habits:

- **Nudges**: two or three drawn per step 1 from lists of settings, eras,
  forms, who holds power and so on (`src/lib/dream/nudges.ts`); the build
  gets the chosen direction's own draw.
- **The weighted pick** (`pickDirection`): each direction weighted by its
  likelihood raised to a power set by the spread, so a wide brief favours
  the less obvious. "Surprise me" (when the brief asked to choose) is the
  same pick; "Try another idea" picks again leaving out the ideas tried, and
  when none is left reads the brief again with them all marked "not these".
- **Recent directions and names** (`recentFrom` in `src/lib/dream/assemble.ts`):
  the page opens the user's 20 most recent other daydreams' setups (the
  server cannot) and sends the directions taken for briefs like this one
  (word overlap of 0.2 or more), which step 1 is told not to repeat, and
  every name given, which the build avoids. The plan had a separate
  `dream-recent` record for this; every setup already holds its brief, its
  direction and its names, so they are read from there, and a deleted
  daydream simply drops out.
- **Leanings left out**: each "usually" preference is left out of a given
  daydream a quarter of the time (`LEANING_DROP`); limits never are.
- **Sampling per step** (`src/lib/server/dream/sampling.ts`): hotter where the
  model lists possibilities (step 1, directions), steadier where it keeps
  records; the bench uses the same table unless `--temperature` overrides it.

### What the variety run found

Eight runs of "a training dynamic" on GLM 5.2, with code's variety and with
`--plain` (no nudges, the model's most likely direction, no name pool), on
2026-10-30, about 50¢ in all:

- **Plain** gave eight versions of one idea: a first session or a handler
  with a pet, in a quiet studio or training room, in "spare prose with
  deliberate beats", the characters mostly given German names (Dagmar,
  Constanze, Astrid).
- **With variety**: a trainee's journal, domestic pet play threaded through
  chores, a monologue, old rivals at a kink club, military drill, a merchant
  and his clerk; set in a shared flat, an office, a club; told as a journal,
  a monologue, vignettes, a stat-tracked story.
- Not yet solved: one name from the pool, Constance, was chosen in three of
  the eight; the fingerprint model answered for only three and five of the
  runs; and the build's first words took 40 to 75 seconds on this model,
  far over the 12-second target, which wants measuring on other models.

### Names

Models name characters from a tiny set, so code draws real names and the
model chooses among them (`src/lib/server/dream/names/`):

- **Lists** for twelve broad backgrounds (`lists.ts`), each a few dozen
  uncommon-but-real first names by gender and family names, hand-compiled to
  start with; the plan's openly licensed datasets can replace them a
  background at a time.
- **The pool**: the build route draws about five names of each gender and
  four family names per background into the build prompt (`drawPool`),
  leaving out the overused list and the user's recent names. Every model can
  use it, so the names tool the plan describes (the model asking with a
  description, mid-build) waits for phase 6's tool loop.
- **`name-from`**: the build writes, on each character, what their name
  should suit ("German woman born in the 1970s, uncommon").
- **"Another name"** on a card asks `/api/dreams/names` for ten names drawn
  for that description (`drawNames`: its background and gender, or a broad
  mix with each pair from one background), leaving out every name in the
  story. The chosen name is kept from the turn the user is on, and the old
  one becomes one of its other names, so earlier passages still link to the
  card.

### Different direction, and escaping a loop

"Different direction" changes what happens, not just the words. The page asks
`/api/dreams/directions` for where the passage could go instead (the same
passage prompt, asking for 3 to 5 `<direction p>` lines, the turned-down
passage marked "not this"), picks one leaning towards the unlikely, and asks
for the passage with it (`steer`), as a version beside the old one. The other
directions are offered as chips under it ("Or steer it"); a chip writes the
passage again taking that direction. Chips last while the page is open.

**Escaping a loop** (`isStuck` in `src/lib/dream/story.ts`): when the last
three next-step notes are too alike (word overlap of 0.5 or more), or the user
has pressed Continue four times running, the next passage is steered the same
way, with code's pick and no chips.

## Asking and remembering (phase 5)

### Preferences

One store, from "I like surprises" to hard limits
(`src/lib/dream/preferences.ts`). Each has a firmness: **Never** (`hard`, a
limit: in the core of every prompt, never left out), **By default**
(followed unless the brief says otherwise) or **Usually** (a taste, left out
a quarter of the time). General ones are the user's own
(`dream-preferences`) and may be limited to a kind of brief ("for training
stories"), which the prompt asks the model to judge; story ones are saved
with the daydream's setup.

**Where they come from.** Typed on the preferences page; an answer to a
question with "Remember" on; or a `{"pref": …}` line the model writes in a
passage's footer when the user says something about what they want.

**Saved for this story when unsure.** A noticed preference, or an answer
remembered in play, is kept for this daydream only, since one wrongly made
general would shape every future story unnoticed. At setup the question's
"Remember the answer for" defaults to this daydream, and can be every
daydream or neither. Making one general always takes a tap.

**Always shown, always undoable.** A notice above the input
(`DreamNotices`) says what was remembered and where, with "Make it general"
and "Undo". It sits in the page rather than floating as a toast, so its
buttons stay put and it is announced as it arrives. A noticed preference
the user already has is not saved again. The story's own preferences are
listed under "How this daydream was set up", each with "Make it general"
and "Forget".

**The preferences page** (`/dreams/preferences`, "What I keep in mind")
lists the user's own preferences by firmness, each with where it came from,
and adds new ones, limits included: the simple limits list from phase 2
moved here. A story preference that turns up in three daydreams or more is
suggested as general there (`promotable`), never made so by itself. Saving
is compare-and-swap; when another device saved first, nothing is merged
(that would bring back one just removed): the stored ones are shown and the
user tries again.

**Seeing why.** The setup page lists "What I'm keeping in mind": the limits
and the preferences in play for this daydream, as the prompts get them.

### Questions in play

With the questions capability a passage may ask one question,
`<ask id="pace" as="ottilie">…<option>…</option></ask>`, in a character's
voice (`as`) or plainly; any after the first are dropped (`passageAsk`).
It shows its options and a "Remember for this daydream" toggle. Tapping an
option sends it as the turn (`answers` on the input turn), which the model
reads as `The user answered your question "pace": "Slower"`. Typing anything
else, or carrying on, counts as an answer too. Earlier passages show what
was answered.

### Telling notes that change with the story

When the story's shape changes, a passage's footer may propose new telling
notes (`{"telling": …}`). They are shown in a notice with "Use these" and
"Keep as it is", and applied only if accepted. A new writing style is applied
at once instead, and can be undone (see "Writing styles").

## Research (phase 6)

A brief can link pages ("like this: https://…") or ask for something to be
looked up ("research common phrases in…"). Step 1 then looks them up before
answering, and its reply's `<research>` keeps what it found for the build and
every passage after (carried in the setup).

**Two tools**, both OpenRouter's own server tools, both on Parallel's engine
(`webFetch` and `WEB_SEARCH` in `src/lib/server/dream-api.ts`), so they need
no key or setting beyond the OpenRouter one. Parallel because the first
engine had measured it as the one that reads reddit, which briefs link most
(Exa answered nothing for a subreddit, Firecrawl refuses reddit, OpenRouter's
own fetch returned raw RSS). A step with tools goes through OpenRouter's
Responses API (`streamResponses`), because only its stream says what each
tool did: a fetch's item has its `url`, a search's (`openrouter:web_search`)
its `action.query`.

- **Fetch** (`openrouter:web_fetch`): for a brief with links. The brief's
  first five links, and up to four more pages they lead to (an index read
  for its entries), eight at most (`max_uses`), and only on the sites the
  brief's own links are on (`allowed_domains`). The model chooses every URL,
  so a page could otherwise send it to a URL of the page's choosing with the
  brief in the query string. Each page is cut short (`max_content_tokens`),
  so a brief cannot fill the context.
- **Search** (`openrouter:web_search`): for a brief with links or one that
  asks for something looked up (`asksForResearch` in `src/lib/dream/links.ts`,
  a list of words such as "research", "look up", "real examples"). Its
  `max_uses` reaches only Anthropic's own search, so the cap is on results:
  five a search, fifteen in all, each cut to 4,000 characters. A result
  comes with its text, so the fetch tool stays limited to the brief's own
  sites. **A search query can repeat the brief's words to the search
  provider**, which a fetch of a link the user gave does not; that was
  weighed and accepted (2026-10-30). The model is told to search for the
  subject, never the user's words or anything about them, and other briefs
  are not offered search at all.

What a page or a result says is material, never instructions (the core
rules).

**What the user sees.** Each page read and each search appears on the setup
page as it happens: "✓ Read" or "✗ Could not be read" with the URL, "✗ Not
opened" for a page on another site (the provider enforces the same list;
`isAllowedPage` is the check the page shows), and "✓ Searched for" with the
query. The research fills a "Background" panel.

**A story model that cannot call tools** (a preset, or a custom one
OpenRouter does not list as calling them) has the **research model** do it,
when the server has one (`researchModel`, see
[server-settings.md](server-settings.md#choosing-a-model)). The read route
runs a research step first (`researchFirst`, `prompts/research.ts`): only the
brief goes to that model, with the same tools; its pages and searches are sent
as they happen, and what it wrote as a `research` event. Step 1 then reads the
brief with that research included, told not to repeat it, and the page keeps
the research as the research model wrote it. The step is routed as the story
is, to the research model's best providers. If it refuses, fails or finds
nothing, step 1 goes on without, told the links could not be read, and so
does a server with no research model.

## Stats, dice and more views (phase 7)

**Stats** live on elements (`<stat name kind value max>`: a meter, a count, a
list or a line). The model changes one by wrapping the words that earned it,
`<set you.composure="+5">You hold still.</set>`, or with a bare `<set …/>`
where no phrase fits (a report that states the number), or a footer `set`
line. Code applies the changes along the branch being read, in order
(`elementsAt`, `changedStat`): "+5" and "-10" move a number, anything else
replaces it, a meter stays within its range and a count at or above zero, a
list gains the item. So each branch has its own values, and nothing is
stored apart from the passages. An element written again after a passage (a
card filled in, facts added) keeps code's stats: the model writing it is
sent both the passage that moved a stat and the stat already moved, and
moved it again (a count the opening raised to 1 showed 2). Only a stat the
element did not have yet is taken from it. The words that earned a change are marked,
with the change beside them ("+5 composure"), and the stats as they stand
show above the story.

**Dice.** `<roll id sides="6"><on n="1-2">…</on><on n="3-6">…</on></roll>`
offers a roll at an uncertain moment. Every outcome shows with its faces;
"Roll a d6" rolls in the browser and sends the roll as the turn (`rolls` on
the input turn, read as `The user rolled 4 on the d6 you offered ("door")`),
and the outcome it landed on is marked. A **deck** or wheel is a block with
a `draw` field whose options are the cards: "Draw a card" picks one in the
browser and it goes with the turn like any field. A **countdown** block's
lines are drawn as large numbers.

**Pictures.** With the pictures capability, a passage may offer one at a
moment worth seeing: `<picture of="ottilie study">a caption</picture>`. On a
server with an image model, it shows "Show a picture"; nothing is made
until it is tapped. The description is built only from the elements'
`appearance` (and a place's `feel`) fields plus the caption
(`picturePrompt` in `src/lib/dream/pictures.ts`), never from what the
passage says about anyone's looks, so it is a description the user can read
on a card and correct. It goes through the same path as the first engine's
pictures (`pictureResponse` in `src/lib/server/daydream/picture.ts`, which
both engines now share): checked for anything coded as a minor before it is
counted or sent, everyone anchored as an adult, nothing stored or logged on
the server. The browser encrypts the picture under a key of its own, stores
the ciphertext (`/api/dreams/[id]/pictures/[pictureId]`, under
`permanent/dreams/<id>/` in the media store), and seals the key in a
`dream-detail` on the passage (version 2 of the kind, which added the
picture variant; version 1 reads unchanged). So it is drawn once, the same
on every visit, and each branch keeps its own. Deleting a daydream deletes
its pictures by prefix.

**Views.** Besides scroll and tap-through, a build may choose `texts` (each
passage a message bubble from the other side) or `monologue` (one voice in
large, centred lines).

## Read aloud (phase 8)

Any daydream can be listened to, behind a feature of its own,
`dreamVoice`, because speech costs money per character spoken; a server
needs a Fish Audio key (Admin → Server settings → Voices,
[server-settings.md](server-settings.md#voices)).

**Off until asked.** "Read aloud" beside the title turns it on for the page
(`session.listening`); nothing ever plays on load, because sound in a public
place is a privacy risk and browsers block it anyway. It adds a Listen button
to each passage and a player in the dock, under the turn (see "Your
turn"): who is speaking, back a
sentence, play and pause, speed (0.75× to 2×, tapping cycles), "Read new
passages" (each passage that arrives from then on is read once it is
finished), "Highlight" and "Keep going". With read aloud on, tapping any word of a
passage plays from that word, before play has been pressed as much as
while it reads: the whole utterance it is in is asked for, so the cues
before the word still shape how it is said, and playback starts at the word
(a moment before it, so its start is not clipped, with the word itself lit
from the start). Pause works while a clip is still loading: it arrives and
waits for play. Listening also turns the `voice`
capability on for the passages asked for (`passageRequestFor`), so the story
model writes delivery cues (`<say how="low, amused">`, `how` on a tone tag)
and `<sound>`s for them; without listening it never does (see "Tag hygiene").

**Reading carries on.** A passage read to its very end is not a pause the
user asked for: once the passage after it is there and finished, it is read
next, whether it came while the last was still being read or after
(`finishedTurn` on the reader, and the effect beside "Read new passages" in
`DreamStory`). Pausing, stopping or playing another passage ends that.
**Keep going** goes further: when what is left of the newest passage to
play falls under 20 seconds (`NEAR_END_SECONDS`, at the speed it plays),
the story carries on as Continue would, so the next passage is being
written while this one finishes, and is read once it is there. Not while
the user is writing or anything else is running. It is checked on the
audio's `timeupdate`, which goes on firing with the screen locked, where an
animation frame does not: listening with the phone in a pocket is the case
it is for.

**What is read is what is drawn** (`passageRuns` in
`src/lib/dream-browser/reader.svelte.ts`). The reader walks the passage's
element on the page, so a spoiler is read only once it is open, an expansion
once it is expanded, a cycling word as it is set, a tap-through passage up to
the beat shown. Anything marked `data-unspoken` (speaker labels, stat changes,
a block's kind, the question's hints, pictures) or `aria-hidden`, and every
button and field, is left out. The markup marks who says what and how:
`data-who` and `data-how` on speech, `data-tone` on the tone tags, a
`.sound`. Speaker labels are not read: a line is said in its speaker's
voice instead.

**Utterances** (`utterances` in `src/lib/dream/speech.ts`): the runs are
split into a sentence or a few (at a sentence's end once there are about 160
characters, never past 280), never two speakers in one. A block's edge ends a
sentence, so a heading is read as one. Cues become Fish's own: free words in
square brackets, which its S2 models read as directions and do not speak.
`how` passes straight through, `<whisper>` is `[whispering]`, `<loud>`
`[shouting]`, `<slow>` `[slowly]` with `[break]` after each sentence, and a
sound is its words in brackets (`[sighs]`). Square brackets in the text itself
are dropped, so nothing becomes a cue by accident.

**Voices** (`src/lib/dream/voices.ts`): the narration and the user's own
lines are in the narrator's voice (a setting); each character is matched by
code to one of the curated voices (`FISH_VOICE_PRESETS`) from their `voice`
field, then manner and appearance: never the other gender when the
description says one (`genderOf`, shared with names), older or younger as
described, then by how many of the voice's tags the description uses. Among
the best and anything one short of them, one is chosen by a hash of the
daydream and the character, so a character keeps their voice, and the same
description need not sound the same in every daydream. The narrator's own
preset is left out while there are others. A request names a voice by our id
(`narrator`, or a preset), never Fish's, so it cannot spend on any voice it
likes.

**One clip per utterance**, each `POST /api/dreams/speak`, fetched ahead of
the one playing until about twelve seconds of playback are in hand at the
speed it plays (`#lookAhead`): what is left of this clip, then each next
utterance by its length, measured once its clip has come and guessed from
its words until then, four fetches at most. A short line played at 2× is
over in a second, so one clip ahead was not always enough. The route checks the
feature, the disclosure and the daily limit (`spendVoice`, counted before the
request, in UTF-8 bytes as Fish bills; a day is a UTC date), then relays
Fish's stream (`/v1/tts/stream/with-timestamp`, S2.1 Pro at `balanced`
latency, mp3; S2 Pro cut each clip's last word short, see `FISH_MODEL`) as the engine's
events: `audio` pieces and `words`, the latest timings for each of Fish's
chunks. The browser joins the pieces into a clip and keeps it for the page,
so replaying costs nothing; nothing is stored anywhere, and the server keeps
only how much was read today (`dream_voice_usage`).

**The output is held open between clips** (`#holdOutput`): from play until
pause, stop or the end, the reader plays silence through Web Audio beside the
clips. Without it the page sent no audio between two clips, and Bluetooth
headphones, which close their link when nothing plays and take about a second
to open it again, cut off the start of each clip. It starts as play is
tapped, before the first clip is fetched, so they are awake for its first
word.

**Highlighting** uses the CSS Custom Highlight API (`::highlight(dream-reading)`),
which marks a range of the page without changing it. `alignWords` places
Fish's timed words in the utterance's visible text, each looked for a few
words on from the last; one it cannot place (a number Fish spelled out) is
skipped, and the light stays on the word before. Before its first word is
said, that word is lit, never the whole utterance, which used to flash up at
the start of each one; only a clip with no timings at all is lit whole. Nothing is guessed at. Auto-scroll keeps the line in view
and stops once the user scrolls.

**The lock screen** shows "Bound Up" and nothing else (Media Session), with
play, pause, back and next: it is the most public surface the app has.

**Fish Audio** (`src/lib/server/dream/fish.ts`). Its S2.1 Pro, like S2 Pro,
reads adult text as written: measured 2026-10-30 by reading an explicit line
in the default voice and transcribing the audio with Fish's own speech-to-text, which gave
it back word for word. Its terms do not address adult content either way.
Speech is $15 a million bytes, so a 2,000-character passage is about 3¢, and
the default limit (30,000 a day) about 45¢ an account a day.

**Not done from the plan:**

- Playback starts when a clip is whole, not while it streams (the plan's
  MediaSource route), and a passage is read once it is finished, not while
  it is written. Each clip is a sentence or a few, so the wait is a few
  seconds.
- Clips are kept for the page only, not cached encrypted on the device.
- A voice is not changed on a character's card, and the voice field is not
  written by the build (`voice` is a field the model may use; the matching
  falls back to manner and appearance).
- A question's options are not read with it, nor the texts view's messages
  one at a time; they are read as drawn.
- No second route through OpenRouter's speech endpoint, and no automated
  adult-content check for voice providers: the check above was by hand.

## Not built yet

The switch-over (phase 9). A block's Done sends its fields without the words
in the input box. Step 1
and the build are still two calls for a spread of 1, and an edit works on the
source rather than the rendered tree. See the plan. The judge's agreement with your votes
comes once there are votes to compare.
