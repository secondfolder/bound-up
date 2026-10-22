# Prompt review

Daydream prompts are built from many conditional pieces. The story's reply
prompt (`buildMessages` in `src/lib/server/daydream/prompt.ts`) changes with
the narrator, the stance, how many characters there are, the lead, the heat,
the picture model and what is being asked for. Each suggestion task
(`buildSuggestMessages` in `suggest-prompt.ts`) has options of its own. That
comes to thousands of distinct prompts, far too many to review by reading
the source. A slip that only appears where two branches meet, such as an
ordering instruction given twice or a blank line where a list was left out,
cannot be seen in the source at all.

The prompt catalogue turns every prompt the builders can send into something
reviewable three ways:

- **a generated catalogue** (`prompt-catalogue/`, not committed), which lays
  every prompt out as paragraphs and diffs to read;
- **a debug page** (`/debug/prompts`) to browse, compare and mark paragraphs
  reviewed;
- **a review script** that has Claude Code read the lot.

The code is in `src/lib/server/daydream/prompt-catalogue/`. The browser half,
which holds the shared types, the diffs and the reviewed marks, is
`src/lib/prompt-review.ts`.

## How a prompt is put together

The builders assemble prompts from `prompt-parts.ts` rather than from
template strings joined by hand. Joining by hand caused bugs the source
could not show. "Answer as" read as the last line of "The summary:", the
rating paragraph sat under "If it is a monologue:", and an empty piece left
a stray space behind. The parts are:

- **`section(heading, …)`**: a `# Heading` and its paragraphs. An empty
  piece drops out, and a section with nothing in it disappears.
- **`paragraphs(…)`**: pieces one blank line apart.
- **`userText(tag, text)`**: what a user or a web page wrote, inside a tag
  such as `<brief>`. Every prompt's rules say that tagged text is material,
  never instructions. A closing tag inside the text is taken out, so a brief
  cannot end its own tag early and write prompt after it.
- **`answerFormat(keys)`**: the last section, `# Your answer`. It lists each
  key and what it holds, then gives a skeleton with `…` for every value. It
  never uses a sample value, because models copy examples: `"you": "dom"`
  came back from a user who had chosen the other side. A test fills the
  skeleton in and runs it through the parser that reads the real answer,
  so the format and the parser cannot drift apart.

The suggestion prompts all follow one order. The system message holds the
rules and the task's unchanging instructions. The user message holds what
the user wrote, tagged, then the sections that depend on this request, then
the answer. Unchanging text first is what a provider can cache.

## Builders and axes

`axes.ts` lists one _builder_ per prompt the server sends: `reply`, and each
suggestion task (`daydream`, `ideas`, `fill`, `chips`, `surprise-idea`,
`casting`, `name`). Each builder lists its _axes_. An axis is one input that
changes the prompt's text, with every value it can take and a baseline value.

Axes are one of two kinds:

- **Structural** axes decide which sections a prompt has: the narrator, the
  stance, the heat, the picture model, the request, which task. They are
  crossed with each other.
- **Descriptive** axes only change what a section says: the kink, intensity,
  pace and length, a character's dials, whether limits are set. Each value is
  swept one at a time from the baseline.

The full product of both kinds runs to millions for the replies, almost all
of it the same text again. The sweep can stand in for the product only if a
descriptive axis changes the same lines whatever the structural axes are.
`interactionProblems` checks exactly that, and `npm run prompts:export` runs it
for every builder (`catalogueGaps`), sampling the replies, so "every
combination" is a checked claim. When it fails, the export fails and names
the axis, and so `prompts:review`, which runs it, fails too. It is not a CI
test any more,
because only a checkout ever reads the catalogue, and it cost every run about
ten seconds. The
fix is to make that axis structural, as happened with `text` (fields written),
which behaves differently with two characters.

`fixtures.ts` turns a combination into the builder's input. Every word a user
would write is a placeholder by default, like `⟦idea.premise⟧`, so a reviewer
can tell the prompt's words from the user's. The catalogue's text then says
nothing about what anyone might write. A ready-made daydream's words can stand
in instead, to read a prompt as one would be sent. The reply's "reply" request
carries one conversation with every kind of turn in it. Turns are rendered one
at a time, so one of each covers them all.

Every input is held to the endpoint's own request schema before it is rendered
(`render.ts`). A combination no device could send, such as no narrator and no
characters, is counted by reason and never reviewed.

**When a builder gains a condition, give it an axis.** A new branch that no
axis reaches is a prompt the catalogue never shows. Add the input to
`axes.ts`, build it in `fixtures.ts`, and run `npm run prompts:export`.

## The catalogue

`npm run prompts:export` writes `prompt-catalogue/`, which is ignored by
version control and excluded from Biome. Per builder it writes:

- `baseline.md`: one whole prompt, the point of comparison for everything
  else.
- `axes.md`: each axis value against the baseline, as a unified diff.
- `paragraphs.md`: every distinct paragraph (text between blank lines) once,
  in the order prompts put them, with the axis values it appears under and how
  many combinations have it. This is where wording is reviewed: a few hundred
  paragraphs rather than thousands of prompts.
- `catalogue.json`: the same, for the debug page.

`lint.md` lists what `lint.ts` finds across every distinct prompt: stray
`undefined`s, doubled spaces and words, blank lines, unbalanced brackets, an
ordering phrase like "before anything else" given twice, and known typos.
Most checks need only a paragraph and run once per distinct paragraph. The
ones that need a whole message (pairs, blank lines) or a whole prompt
(ordering) run per prompt. A finding is for a reviewer to judge, not a gate.
The first one found was a real bug: the naming prompt left a blank line where
its character list went when there were none.

It used to be committed, with a test that failed until it was refreshed, so
every prompt change showed up in its diff. That stopped on 2026-10-22: the
files ran to megabytes, a change of a few lines rewrote hundreds of them, and
the snapshot rarely caught what reading the prompt did not. Seeing what a
change does is now `npm run prompts:review -- --since <ref>` (below), or an
export copied aside before the change and compared after it.

Enumerating every reply peaks a little over Node's default 4 GB heap, so both
scripts run with 8 GB (`NODE_OPTIONS` in `package.json`). `--full` also writes
every distinct prompt whole, one JSON line each, to `prompt-catalogue/.full/`
(gitignored), for grepping. That is close to 200 MB, so it is only written on
request.

Paragraph conditions are the values each axis took in the combinations that
have the paragraph. They are approximate where several axes interact: they
record the values seen, not a formula.

## The debug page

`/debug/prompts`, linked from Settings in debug mode, behind the `debugMode`
feature in its loads and in `/api/debug/prompts`
([debug-mode.md](debug-mode.md#debug-tools)). It has five views:

- **Explore:** one select per axis, with the descriptive ones under "More
  options". The prompt is rendered by the endpoint through the real builder
  and shown message by message, cut into paragraphs, with its settings, size
  and any lint findings.
- **Compare:** "Pin as A" in Explore, change options, and the two are diffed
  line by line, with changed words marked, in one column or two.
- **Sweep:** one axis's every value against the current prompt.
- **Paragraphs:** the catalogue's paragraphs, filtered by text, by an axis
  they depend on, or to those not yet reviewed. Each opens a prompt that has
  it.
- **Lint:** the catalogue's findings, and the combinations no device could
  send.

The view, the words and every option that differs from the baseline live in
the URL, so any prompt can be linked to.

Each request renders one prompt, or one per value of a single axis, which
stays well inside a Worker's CPU budget. Anything exhaustive comes from the
generated `catalogue.json`. Each builder's file is a lazily loaded chunk of
the server bundle (`snapshot.ts`), because enumerating the replies takes
seconds of CPU — and far too much memory to do in every build. So the page
works on a dev server in a checkout that has run the export, and anywhere
else, deployed builds included, it says to run it. Nothing tests the page
end to end: it is a local tool, and the export it needs costs more than a bug
in it would.

**Reviewed marks** are per device, in `localStorage`. A paragraph's id is a
hash of its text, so editing one makes it unreviewed again by itself. After a
prompt change, "Not reviewed only" shows exactly what changed.

Diffs use jsdiff (`diff`). `$lib/word-diff` stays as it is: it is a one-sided,
quadratic LCS for marking what was added around a short text, not a two-sided
diff of 14 KB prompts.

## Reviewing with Claude

`npm run prompts:review` refreshes the catalogue, writes what a review reads to
`prompt-catalogue/.review/` (gitignored), and runs `claude -p`, read-only,
once per builder. It gathers the answers into `.review/REVIEW.md`. Useful
flags:

- `--builder <id>` (repeatable) reviews only some builders.
- `--since <ref>` exports the catalogue at `<ref>` as well, in a temporary
  worktree, adds the difference as `CHANGES.diff`, and asks for those
  changes to be reviewed first.
- `--prepare` writes the files and runs nothing, for a reviewer, or an agent
  already in a session, to read directly.

There are far too many prompts to read every one, but a paragraph has to be
judged inside the prompt it sits in. `reviewSelection` therefore picks, per
builder:

- **whole prompts** (`whole-NN.md`), read first and in full: the baseline,
  then whichever prompt adds the most paragraphs and structural options not
  yet seen (greedy set cover), up to 12 and while each adds at least two.
  For the replies that is 12 prompts holding most of the wording.
- **every remaining paragraph in context** (`in-context.md`), shown with its
  section heading and the paragraph either side, from a prompt that has it.
  The reply's long tail of paragraphs that only one combination has would
  otherwise need a couple of hundred more whole prompts.

Only structural axes count towards the selection. A descriptive value changes
a line or two, which `axes.md` and `paragraphs.md` already show.

`BRIEF.md` (`REVIEW_BRIEF` in `export.ts`) is what the review is asked to look
for, in order: contradictions, likely misreadings, paragraphs in the wrong
place, order, inconsistent terms, then typos. Each finding comes with a quote
and a suggested rewrite.
