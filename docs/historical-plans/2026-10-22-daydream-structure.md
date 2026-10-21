# Daydreams: structure for what popular cards do

## Context

A survey of ~1,400 popular NSFW character cards (Chub, Wyvern, RisuRealm;
findings in `.local/bound-up-research/findings.md`) showed techniques that
daydreams cannot express today: a character's private thoughts set against what
they say, several starting points for one idea, a cast the story fills in
itself (foils, crowds), state the user can see moving (meters, counts, rules in
force), and character/idea detail that varies per card (what they hide, what
they won't do, a twist kept for play). Openings that start at the threshold and
end on a handover are what the most-played cards share.

This plan changes how daydreams are structured so the ready-made presets can be
reworked on top of it (the preset rework is a separate, later piece of work).
Agreed with the user:

- **Parts nobody is cast in are played by the story** — no flag; deleting the
  part is how to leave someone out.
- **Openings**: an idea carries named starting points; a story opens from one,
  and "Start somewhere else" adds another as a new root.
- **Fields of your own** replace the fixed character/idea text fields, over a
  small fixed core; the model may propose fields; any field can be a
  **spoiler** (covers the "twist kept from the user").
- Plus the original suggestions: a **thoughts channel**, **threshold openings
  that end on a handover**, and **trackers**.

## Decisions

- **One version bump per record, shipped reader and writer together** (as setup
  v4 and setup v5 + idea v2 did): `daydream-character` v2, `daydream-scene` v3,
  `daydream-setup` v7, `daydream-turn` v9. No D1 migration — everything is
  sealed. All schema changes land in the first phase that needs any of them, with
  empty defaults, so later phases add behaviour only.
- **Fixed core** (code depends on these):
  - character: `name`, `archetype` (label "Type": card summary, suggestion
    context, library list), `appearance` (pictures keep people's look);
  - idea: `title`, `premise` (naming, summary, search, starter cards),
    `yourRole` (side/stance, dropped for watchers);
  - dials unchanged (they become words and heat is the ceiling).
- **Everything else is a field**: `{ id, label, value, kind: KnownFieldKind | null, spoiler: boolean }`.
  - Known kinds keep a label, hint, cap and curated chips. Character:
    `personality`, `speech` (How they talk), `likes` (What they enjoy),
    `hides` (What they hide), `wontDo` (What they won't do), `wonOver` (How
    they're won over), `notes` (Anything else). Idea: `setting` (Where),
    `tone`, `notes` (Anything else; "Sayings to build on" for a monologue).
  - Custom fields have a free label (≤ 40 chars), no curated chips ("More
    ideas" still asks the model, sending the label as the field's meaning).
  - Caps: ≤ 12 fields per record, value ≤ the known kind's cap or 1,000.
  - A new character starts with `personality` and `speech` added; a new idea
    with `setting` and `tone`; any can be removed.
  - "Won over" is a field, not a dial (simpler, and wording is richer than a
    scale).
- **Spoiler fields** are hidden behind "Show" in dialogs and the library, never
  in a summary or card, and go to the model with an instruction to reveal them
  in play, never in the opening and never stated outright before the story
  earns it.
- **Openings**: `idea.openings: { id, label, situation }[]` (≤ 4). The setup
  keeps the chosen one (`setup.opening: id | null`, null = from the premise).
  Each root passage records the opening it was written from as a snapshot
  (`meta.opening: { label, situation }`), so replaying its request is exact
  (cache chain) even after the idea is edited.
- **Trackers**: `idea.trackers: { id, name, kind: 'meter' | 'count' | 'list' | 'text', start, about }[]`
  (≤ 4; `about` says what moves it and what happens at the ends). A reply's
  metadata may carry `trackers` changes; the page stores the full values after
  each passage on that passage (`meta.trackers`), so each branch has its own
  state (current = latest on the path, else the idea's starts). The model is
  told the current values in a note at the end of the last message, exactly as
  the buttons note is, and each passage's request replays the note it was sent
  with. Display only; the user changes them by asking in their own words.
- **Thoughts**: `<thought who="Mara">…</thought>` tags beside `<say>` and
  `<sound>`; a story dial `thoughts: 'shown' | 'hidden'` (default shown).
  Hidden tells the model to keep the camera outside every head. The user's own
  thoughts are never written (the existing rule), except a monologue's inner
  voice. Not offered for a monologue or the system voice.

## Workflow

- Work in a separate git worktree on a new branch from `main`
  (`feat/daydream-structure`), so the main checkout (currently on
  `feat/daydream-model-progress`, with uncommitted work of its own) is left
  untouched. The worktree's e2e suite gets its own port and database
  (`e2e/run-paths.ts`).
- Commit per phase with conventional messages; the husky hooks run.
- When every phase is done and the verification loop is clean: merge the
  branch into `main`, then remove the worktree and delete the branch.

## Phase 1 — prompt-level changes (no schema)

1. **Uncast parts are played by the story.**
   - `describeCastParts` (`src/lib/server/daydream/prompt.ts` ~299): list every
     part; an uncast one as "played by the story: invent them from this; a part
     described in the plural is as many people as the story needs, each given
     something of their own". Update its comment and the `RULES`/telling wording
     if it implies only the cast exist.
   - Setup form "Who's in it" (`DaydreamSetupForm.svelte` ~995): an uncast part
     reads **Played by the story** with **Cast someone** (the existing
     `castPicker`), and still shows that text at the character cap. Summary's
     `castNote`/`remainder` (`daydream/summary.ts`) mention story-played parts.
   - Tests: reverse `prompt.test.ts` "not.toContain('the observer')";
     `DaydreamSetupForm.svelte.test.ts` casting describe. Prompt catalogue: add
     an uncast-part value to the reply fixtures (`fixtures.ts` `idea()` /
     `replySetup`) and an axis in `axes.ts`.
2. **Threshold openings, ending on a handover.**
   - `openingRequest` (prompt.ts ~849): open just before the hook lands (a
     discovery, an arrival, the moment itself — not a wind-up), and end on
     something the user must answer — a question, an offer, a choice — never a
     static pose. For a watcher (`stance: 'absent'`) drop "end at a point where
     the user can respond" (currently sent to watchers too).
   - `TELLING` (`writing-guide.ts`): when the user is in the story (stance self
     or persona, narrator not monologue/impersonal), end each passage where the
     user has something to answer; watchers unchanged. Requires `writingGuide`
     to take the stance.
   - Tests: replace `prompt.test.ts` ~685 ("not.toContain('End every
     passage')") with per-stance assertions. Catalogue: stance already an axis;
     re-export.

## Phase 2 — the records (all schema changes)

- `src/lib/sealed-kinds/daydreams.ts`: new `fieldShape`, `openingShape`,
  `trackerShape`; character v2, idea v3, setup v7 (characters/idea copies,
  `dials.thoughts`, `opening`), turn v9 (`passageMetaV9` adds `opening`,
  `trackers`). Upcasters: fixed text fields → `fields` with their known kind
  (empty ones dropped; idea `notes` keeps its lines), `openings: []`,
  `trackers: []`, `opening: null`, `thoughts: 'shown'`; turn v8 → v9 identity.
  Fixtures: new entries in `src/lib/sealed-fixtures/fixtures.json` sealed per
  its README; older fixtures' `expected` moved to the upcast values only.
- `src/lib/daydream.ts`: types, `DaydreamField`, `KnownFieldKind`, field caps
  in `DAYDREAM_LIMITS` (and the duplicates in `schemas/daydreamForm.ts`,
  `daydream/suggestions.ts` `FIELD_LIMITS`); `EMPTY_CHARACTER`/idea defaults;
  `fieldValue(record, kind)` helper for code that still wants a known field
  (monologue sayings, catch-up). Remove `CHARACTER_TEXT_FIELDS` /
  `IDEA_TEXT_FIELDS` as data lists; keep core lists.
- `src/lib/daydream/catalog.ts`: `CHARACTER_FIELD_KINDS` / `IDEA_FIELD_KINDS`
  (label, hint, cap, chips; monologue labels via `ideaFieldLabels`);
  `CHARACTER_TEMPLATES` / `IDEA_TEMPLATES` converted mechanically (a builder
  from the old shape) — content unchanged until the preset rework.
- `src/lib/daydream/starters.ts`: `assembleSetup` / `starterSetup` /
  `DaydreamPieces` carry fields, openings, trackers.
- `src/lib/daydream/copy-differences.ts`: compare core fields, then fields by
  id (added / removed / changed), openings and trackers as wholes; take-one
  helpers per field id.
- `src/lib/schemas/daydreamForm.ts`: field/opening/tracker arrays with caps.
- Prompt (`prompt.ts` `describeCharacter`, idea section, `describeNotes`):
  render core, then each non-spoiler field as `Label: value`, then spoilers
  under "Kept from the user until the story reveals it" — all inside the
  existing `<character>` / `<idea>` tags (labels are user text too).
- Suggestions (`suggest-prompt.ts`, `daydream/suggestions.ts`, `suggest.ts`):
  - `draftSchema`, `castingRequestSchema`, `catchUpRequestSchema`,
    `recordRequestSchema` take `fields`; chips target a field id + label.
  - Fill: fill empty known fields and may add up to N new fields suited to the
    record (`fields: [{label, value, spoiler}]`), never over written ones.
  - Surprise / `daydream` answers: characters `{name, archetype, appearance,
    fields}`; idea `{title, premise, yourRole, fields, heat, kink, parts}` (plus
    openings and trackers in phases 3–4); the prompt suggests fitting fields
    (what they hide, won't do, how they're won over, a twist as a spoiler) only
    where relevant.
  - Catch-up: idea fields and characters' `personality` field by id.
- UI: `DaydreamCharacterDialog.svelte`, `DaydreamIdeaDialog.svelte` render core
  inputs, then the field list (`DaydreamChipField` per field; custom fields get
  a label input; remove button; spoiler toggle with an eye-slash icon labelled
  for screen readers; **Add a field** dropdown: unused known kinds, then "Your
  own…"). Dials stay under "More detail". `DaydreamLibrary.svelte`,
  `DaydreamCopyCard`/`castSummary` never show spoilers.
- `src/lib/server/daydream/prompt-catalogue/fixtures.ts`: build fields; add a
  spoiler-field descriptive axis.

## Phase 3 — openings

- Idea dialog: **Where it can start** list (label + situation, add/remove, ≤ 4).
  Fill / surprise / `daydream` may write 2–4 openings for an idea with none.
- Setup: summary second paragraph gains "It starts [label]" as a blank (menu of
  the openings + "From the premise"); full layout shows the same menu in the
  idea fieldset. Stored as `setup.opening`.
- Story: `DaydreamStory.open()` / `#start` pass the chosen opening; the opening
  request (`openingRequest`) adds the situation in an `<opening>` tag; the root
  passage stores `meta.opening`; `toContextTurn` / `contextTurnSchema` carry it
  and the history replays it (`buildMessages` ~1006). Another take of a root
  keeps its opening. **Start somewhere else** in a root passage's ⋯ menu
  (`DaydreamPassage.svelte`) offers the openings and "From the premise" and
  starts a new root (`#start({ parentId: null, mode: 'opening', opening })`);
  the existing root switcher (`DaydreamSiblings`) moves between them.
- Tests: `DaydreamThread.svelte.test.ts` (opening from a chosen opening; start
  somewhere else makes a second root with its own opening; replay sends it);
  `prompt.test.ts` history-chain test gains an opening; catalogue `state` axis
  gets "opening from an opening".

## Phase 4 — trackers

- Idea dialog: **What the story keeps track of** (name, kind, start, what moves
  it; ≤ 4). Suggestions may propose trackers where the idea has a progression
  (training, debt, days kept, rules in force).
- Prompt: trackers described in the idea section; reply format adds optional
  `"trackers": {"<name>": value}` (changes only), said only when the idea has
  any; `trackersNote(current)` appended beside `buttonsNote` at the tail and
  replayed per passage (same reasoning and tests as the buttons note, `Cost`).
- Reply parsing (`reply-format.ts`): schema + `salvageMeta` part for trackers;
  coerce to kind (meter clamped 0–100, count integer, list of short strings,
  text ≤ 200).
- Page (`story.svelte.ts` `#generate` ~866): merge changes into the current
  values for the path and store the full set as `meta.trackers` (not for a
  rewrite or check-in); `trackersAt(turnId)` folds along the path like
  `currentDirections` (`daydream/tree.ts`).
- Display: a compact readout above the directions row (meters as thin bars,
  counts, lists as chips, text as a line) — new `DaydreamTrackers.svelte`; a
  per-passage change note as a sibling `<li>` like `DaydreamSettingsNote`
  ("Submission 40 → 55").
- The system voice: its guide mentions keeping a "rules in force" list tracker
  when the idea has one.

## Phase 5 — thoughts

- `passage-format.ts`: `THOUGHT_TAG`, extend `PARTIAL_TAG`, a `thought` mark
  and `Run.thought` with the speaker; hidden while streaming like say tags;
  `plainPassage` keeps the words.
- `DaydreamProse.svelte`: `.thought` style — italic, the speaker's colour at
  reduced strength (new `--daydream-thought` token in `theme.css` for unknown
  speakers), never in quotation marks.
- Prompt `passageFormat`: when thoughts are shown, put a character's unspoken
  thoughts in a thought tag naming them, sparingly and where they contradict or
  add to what they say; never the user's (except a monologue's inner voice,
  unchanged); when hidden, no thoughts — the camera stays outside every head.
  Replaces the "thoughts always in italics" clause.
- Dials: `DaydreamDials.svelte` gains Their thoughts: Shown / Hidden (not for a
  monologue or the system voice); "Settings the story changes" does not set it.

## Phase 6 — docs and records

- `docs/daydreams.md`: Ideas, Characters and ideas, casting ("Parts nobody
  plays…" reversed), Guided over free text (fields), How it's told (thoughts),
  Moving the story on / The story is a tree (openings, start somewhere else),
  new "Trackers" section, Reading a passage (thought tags), The reply format,
  How a passage is written (the handover line replacing "Passages are not told
  to end on a cue"), Cost (trackers note), Tests.
- `docs/encryption.md` only if its kind list names versions.
- `src/lib/roadmap/roadmap.json`: twigs under Daydreams for openings, trackers,
  fields of your own.
- Copy this plan to `docs/historical-plans/2026-10-22-daydream-structure.md`.
- `npm run prompts:export` after each prompt phase, and read the diff.

Out of scope: reworking the ready-made presets and the catalog's blood-relations
line (next piece of work, using these structures).

## Verification

- `npm run check`, `npm run lint`, `npm test` (vitest node + browser, then
  Playwright), `npm run test:e2e`; `npm run test:e2e:image` once at the end.
- Unit: sealed upcasts and fixtures (`sealed-fixtures.test.ts`); field caps
  and parsing (`suggestions.test.ts`); `copy-differences`; `passage-format`
  thought tags (streaming, unclosed, inside dialogue); tracker parsing/folding;
  `prompt.test.ts` (uncast parts, stance-specific endings, spoilers placement,
  opening replay and trackers note in the history chain).
- Component: dialogs (add/remove/spoiler fields, known vs custom), setup form
  (played by the story, opening blank), thread (start somewhere else, trackers
  readout, thought rendering).
- e2e (`e2e/daydreams.spec.ts`, stub in `e2e/model-stub.mjs`): extend the stub
  to emit a thought tag, a tracker change and to honour an opening; specs for
  picking an opening and starting somewhere else, a custom spoiler field kept
  out of the summary, and the tracker readout updating.
- Manual: run `npm run dev`, play a ready-made daydream with an uncast part, an
  added opening and a tracker; read the prompt with debug mode's "Show prompt".
