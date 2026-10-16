# Daydreams: ways to steer, branch and roll

## Context

Daydreams v1 (`docs/daydreams.md`, plan `docs/historical-plans/2026-10-16-daydreams.md`)
is a linear chat with one character. The only controls are a composer, Stop,
"Write this reply again" on the newest reply, and a typed safeword.

The user wants a richer set of ways to take part in the story, all built
together in this change:

- **The composer.** One text box whose intent the model works out: an in-story
  action, a request about where the story should go, or the next part of the
  story written co-writing style. Explicit out-of-character syntax (`(…)`,
  `[…]`, `OOC:`) is always taken as out of character.
- **Direction buttons.**
  - **Continue** is always there.
  - The rest are dynamic, and the model adds or removes them each turn: slower,
    crueler, "skip to the next morning", and so on.
  - **Surprise me** is explicitly offered to the model as a candidate.
- **Suggested responses.** Tapping one sends it; a small edit icon puts it in
  the composer instead.
- **One structured reply per turn**: a passage, then a metadata block.
- **Sticky dials**: intensity, pace and length.
- **Shaping what's already written:**
  - select a passage's text to get "more of this", "rewrite this" or "not this";
  - "not this" adds a limit;
  - reactions on passages.
- **Rewind and branch inside one chat.**
  - Sibling switchers at each fork.
  - A branch map to see the tree and move around it.
  - No separate chats.
- **Bookmarks**: save points in the tree, and highlighted quotes.
- **Dice**: the model proposes a roll, the browser rolls with real randomness,
  and the story must honour the result.
- **Safety controls replace the typed safeword.**
  - **Stop the scene** (red): halt, plus an out-of-character check-in.
  - **Ease off** (yellow).
- **Noted in the docs only, not built**: auto-continue, "Previously…" recaps,
  and a book-page layout for narrated stories.
- **A new setup made of reusable parts**:
  - a **voice** setting, separate from the characters: who tells the story
    (characters speak for themselves, a second-person narrator, a third-person
    narrator, or an impersonal authority), and where the user stands (as
    themselves, as a persona they name, or absent and watching). Together these
    cover every shape so far:
    - character chat: one character, no narrator, as yourself;
    - guided fantasy: no characters, second-person narrator;
    - voyeur story: two characters, third-person narrator, absent;
    - the facility: no characters, impersonal narrator.
  - **one or more characters** picked from a personal library, or none when
    the voice allows it;
  - **character dials**: a friendly way to make or adjust a character
    (a tone pick of warm, teasing, cold or clinical, plus sliders) alongside
    the free text;
  - a **scene** picked from a library, created new, or "Surprise me".
  - Characters and scenes are created in a **guided dialog**: chips and
    suggestions, both curated and model-written, over free text the user can
    always edit.
  - A daydream keeps **copies** of what it picked, and offers to update when
    the library version changes.

**Treat v1 as live.** Every schema change is a new migration that carries
existing rows forward. Every sealed-kind change is a new payload version with
an upcaster; the v1 fixtures stay frozen.

## Data model

### Turns become a tree

Migration via `npx drizzle-kit generate --name daydream_turn_tree`.

Changes to `daydream_turns` (`src/lib/server/db/schema/app.ts`):

- **Add `parent_id`** (text, nullable). Null marks a root: the opening, and any
  retried opening.
  - **No `.references()`.** An `ALTER TABLE … ADD COLUMN … REFERENCES` gets no
    `ON DELETE` (AGENTS.md, Traps), and a rebuild would empty the table on D1.
    Turns are only ever deleted with their daydream, whose cascade removes them
    all. Say so in a comment.
  - Parent validity is checked in code.
- **Drop the unique index `(daydream_id, position)`.** Drizzle emits
  `DROP INDEX`, which is not a rebuild. Add a plain index on
  `(daydream_id, parent_id)`.
- **`position` is kept and re-defined as depth along its branch** (root = 0).
  - On the existing linear chains, position already equals depth, so it needs
    no backfill.
  - Renaming the column needs drizzle-kit's interactive rename prompt; a
    comment explains the name instead.
- **`role` becomes `'user' | 'story'`** (who wrote it). The column is plain
  `text` with no CHECK constraint (`$type` is TypeScript only), so this is a
  data `UPDATE` in the backfill migration and needs no rebuild. The rename
  matters because a turn may now be written by a narrator rather than a
  character. The sub-type (direction, roll, safety…) lives in the sealed
  payload, not the role, so the server learns nothing new.
- **`revision` stays but is no longer written.** Turns are now immutable,
  which keeps quote offsets valid. The comment says why.

On `daydreams`, **add `active_turn_id`** (text, nullable, no FK, for the same
reason). It records the leaf the user is on and is plaintext structure: the
doc says exactly that.

**Backfill.** A second, custom migration via
`npx drizzle-kit generate --custom --name backfill_daydream_turn_tree`:

- set each turn's `parent_id` to the turn in the same daydream at
  `position - 1`;
- set each daydream's `active_turn_id` to its highest-position turn;
- `UPDATE daydream_turns SET role = 'story' WHERE role = 'character'`.

A test in `src/lib/server/db/migrations.test.ts` runs both migrations against
a three-turn v1 chain and checks the parents, the active turn and the renamed
roles, following
the timezone test. That file's no-`DROP TABLE` guard must stay green.

### Marks: bookmarks and reactions

New table **`daydream_marks`** (purely additive):

- `id`, `daydream_id` → daydreams (cascade), `turn_id` → daydream_turns
  (cascade; ON DELETE works here because it is a `CREATE`);
- the sealed columns (`ciphertext`, `vault_id`, `payload_version`,
  `revision`) and `timestamps`;
- an index on `(daydream_id)`.

Export the `$infer*` types beside it.

### Character and scene libraries

Two new tables, purely additive, with the same shape as each other:
`daydream_characters` and `daydream_scenes`.

- `id` (chosen by the browser, as it is part of the AAD);
- `owner_id` → user (cascade);
- the sealed columns and `revision` (CAS on edit, as `updateDaydreamSetup`
  does);
- `timestamps`;
- an index on `(owner_id, updated_at)`.

Deleting from a library is always safe, because daydreams hold copies.

### Sealed kinds (`src/lib/sealed-kinds/daydreams.ts`)

**New `daydream-character` v1.** It has two layers. The free text is the
truth; the dials are a friendly shortcut that the prompt reads alongside it.

- Free text (chips only ever edit it, and the user can always rewrite it):
  - `name` (required);
  - `archetype`, `personality`, `speech` (how they talk), `appearance`,
    `relationship` (to you), `likes`, `notes`.
- `dials`:
  - `tone: 'warm'|'teasing'|'cold'|'clinical'|null`;
  - four sliders, each `1..5|null`, where null means "not set":
    - `control` (follows ↔ takes charge);
    - `strictness` (lenient ↔ strict);
    - `edge` (gentle ↔ cruel);
    - `talk` (terse ↔ chatty).
- Free text wins where the two disagree, and the prompt says so.

**New `daydream-scene` v1**:

- `title` (required), `setting`, `premise` (required), `yourRole`, `tone`,
  `notes`.

**`daydream-setup` v2**:

- `title`;
- `voice`:
  - `narrator: 'none'|'second-person'|'third-person'|'impersonal'`;
  - `stance: 'self'|'persona'|'absent'`;
  - `protagonistName?`: required for `persona`. Under `self` the user's
    turns are theirs and third person uses "you", or this name if given.
- `characters`: an array of 0–4
  `{ sourceId: string|null, sourceRevision: number|null, ...character fields }`,
  each a copy;
- `scene`: `{ sourceId: string|null, sourceRevision: number|null, ...scene fields }`,
  also a copy;
- `lead`, `limits`;
- `dials: { intensity: 1..5, pace: 1..5, length: 'short'|'medium'|'long' }`.
- No `safeword`.
- Validation is a pure `voiceProblem(voice, characterCount)` in
  `src/lib/daydream.ts`, shared by the form and the kind:
  - `narrator: 'none'` needs at least one character, and a stance other than
    `absent`: someone has to be spoken to.
  - `stance: 'absent'` needs a narrator, and at least one character to watch.
  - `second-person` needs `self` or `persona`, because "you" has to be
    someone.
  - With a narrator and no characters, the narrator alone tells it. With a
    narrator and characters, the narrator voices them.
  - `lead` (they / me / shared) is shown only where it means something: with
    characters, and not `absent`.
- The upcaster from v1:
  - `voice` becomes `{ narrator: 'none', stance: 'self' }`;
  - `characters` becomes
    `[{ sourceId: null, sourceRevision: null, name: characterName, personality: persona, dials: all null }]`;
  - `scene` becomes
    `{ sourceId: null, sourceRevision: null, title, premise: scenario, tone }`;
  - the default dials are added (3, 3, medium);
  - `safeword` is dropped. Removing the word is deliberate: the Stop control
    replaces it (see Safety).
  - Upcast copies with no source get a "Save to my characters / scenes"
    action, so existing daydreams can seed the library. No data migration is
    needed.

**`daydream-turn` v2**, a discriminated union on `type`:

- `text { text, meta? }` covers prose either side; `role` says who wrote it.
  The v1 upcaster maps `{text}` to `{type:'text', text}`.
  - `meta` exists only on story turns (the reader enforces that):
    - `suggestions` (≤4, each ≤300 characters);
    - `directions: { add: {id,label}[], remove: id[] }` (labels ≤40);
    - `roll?`: a dice proposal, below;
    - `readAs?: 'action'|'direction'|'cowrite'|'ooc'`, saying how the model
      read the user turn before it;
    - `ooc?: true`, for an aside or check-in rather than story;
    - `rewriteOf?: { turnId, quote?, instruction? }`.
- `direction { id, label }`: a pressed direction button. Continue is not a
  turn; see Flow.
- `steer { action: 'more'|'rewrite'|'not-this', targetTurnId, quote: { start, end, text } }`.
- `safety { signal: 'red'|'yellow'|'resume' }`.
- `roll { proposalTurnId, sides, result, outcome }`.

**New `daydream-mark` v1**:

- `bookmark { label?, quote?: { start, end, text } }`;
- `reaction { reaction: 'love'|'like'|'not-for-me' }`.

All the new and changed kinds get frozen fixtures added to
`src/lib/sealed-fixtures/fixtures.json` beside the untouched v1 ones, and are
registered in `ALL_SEALED_KINDS`. Caps go in `DAYDREAM_LIMITS` in
`src/lib/daydream.ts`. Add `openedDaydreamMark`, `openedDaydreamCharacter` and
`openedDaydreamScene` to `sealed-views.svelte.ts`.

## Pure modules (alias-free under `src/lib/daydream/`, each with a node test)

- **`tree.ts`**:
  - `pathTo(structure, leafId)`, `childrenOf`, `siblingsOf`;
  - `latestLeafUnder(nodeId)` (newest `createdAt`, then `id`);
  - `isHalted(path)`: the last safety turn is `red` with no later
    `resume`/`yellow`;
  - `currentDirections(path)`: fold every passage's add/remove along the path,
    cap at 6 and drop the oldest first.
  - Shared by server (path selection) and client.
- **`reply-format.ts`**. The model ends each reply with
  `\n<meta>\n{json}\n</meta>`.
  - `visiblePassage(soFar)` cuts at `<meta>` and hides any trailing partial
    prefix of it while streaming.
  - `parseReply(full)` returns `{ passage, meta | null }`. It validates the
    meta with the kind's Zod schema and is tolerant: bad or missing meta keeps
    the passage and yields `null`, which leaves the previous directions in
    place and shows no suggestions or roll.
- **`ooc.ts`**: `explicitOoc(text)` matches a leading `(`, `((`, `[`, `OOC:`
  (any case) or `//`. Used by the server's prompt rendering and by the client
  to label the turn.
- **`dice.ts`**:
  - `roll(sides, random = crypto.getRandomValues)` without modulo bias, by
    rejection sampling;
  - `outcomeFor(proposal, result)`;
  - the proposal schema: `{ prompt ≤140, sides 2..20, outcomes: { min, max, label ≤80 }[] }`.
    It must cover 1..sides exactly once each; an invalid proposal is dropped,
    not shown.
- **`catalog.ts`**: the curated suggestions, as plain data.
  - Character chips per free-text field: archetypes, personality traits,
    speech styles, appearance hints, relationships, likes.
  - Scene chips: settings, premises, your role, tones.
  - Starter templates for characters and scenes, each a full set of fields
    plus dials.
  - It is content like the seed prose, so it is added to Biome's exclusions,
    keeping one entry on one line.
- **`chips.ts`**:
  - `hasChip(text, chip)`, `toggleChip(text, chip)`: add a phrase to, or
    remove it from, a comma or line separated field, keeping the rest of the
    free text intact.
  - `outOfSync(copy, libraryRevision)`: compares the copy's `sourceRevision`
    with the library row's plaintext `revision`. Noticing a newer version
    needs no decryption.
- **`dial-words.ts`**: the words each dial value means (slider labels, and
  the phrases the prompt uses), shared by the UI and `prompt.ts`, so the
  screen and the model read the same thing.
- **`context.ts`** (extended):
  - trims the active path, not a flat list;
  - renders typed turns to model text (below);
  - carries each passage's reaction;
  - never sends `meta` for past turns, so buttons, suggestions and rolls cost
    no context.

## Server

### Reply endpoint and prompt

`src/routes/api/daydreams/[id]/reply/+server.ts` and
`src/lib/server/daydream/prompt.ts`.

`replyRequestSchema` becomes:

```
{ mode: 'opening'|'reply'|'rewrite',
  setup: setupKind v2,
  turns: ContextTurn[],                      // typed: text | direction | steer | safety | roll, + reaction
  currentDirections: {id,label}[] ≤6,
  rewrite?: { targetText, quote?, instruction? } }   // required iff mode = rewrite
```

The budget is counted over the rendered text, under the same
`MAX_CONTEXT_CHARS`.

`buildMessages`:

- **Rendering user turns:**
  - `text` goes as written, or as `[Out of character] …` when `explicitOoc`
    matches;
  - `direction` becomes `(Direction: <label>)`;
  - `steer` becomes `(More of this: "<quote>")`;
  - `roll` becomes `(Roll: <result> on d<sides> → <outcome>. Honour this.)`;
  - `safety` becomes the fixed notices below.
- **Character turns** send only `text`.
- **Halted conversations.** If `isHalted(turns)`, the server **forces a
  check-in** whatever mode was asked for: a short, warm out-of-character
  check-in, with no directions, suggestions or roll. That is server-side, so a
  stale page can't continue a stopped scene.
- **`RULES`:**
  - Drop the safeword lines.
  - A red notice: stop the scene at once, step out of character, check in
    briefly.
  - A yellow notice: keep the story, ease off noticeably, lower the intensity.
  - Keep: "if the user steps out of character to say they want to stop,
    stop", so distress in plain words still works.
  - The adult, real-people and limits rules are unchanged.
- **New server-owned sections:**
  - **Reading the user's turn:** infer action, direction or co-writing; treat
    explicit OOC as out of character.
  - **Reply format:** the `<meta>` block and its JSON shape.
  - **Directions:** the current set is listed. Add buttons that suit where the
    story is and remove stale ones. Never add Continue, Stop or Ease off. Use
    "Surprise me" when an unexpected turn would suit. The examples are slower,
    faster, crueler, gentler, skip ahead, and more about the waiting.
  - **Suggestions:** 2–4, varied (an action, a co-written line, a
    take-it-somewhere request), in the user's voice.
  - **Dice:** propose a roll only at a genuinely uncertain moment and rarely.
    Outcomes cover every face. A rolled result must be honoured.
  - **Dials:** intensity, pace and length as plain words.
  - **Rewrite:** rewrite the target passage, applying the quote and
    instruction, and keep it consistent with what came before.
- **`describeSetup` rewritten for the v2 setup:**
  - **Voice:** a "How the story is told" section per narrator and stance
    combination. It replaces the fixed "You play one character… second person
    for the user" lines in `RULES`. The "never write the user's words or
    choices" rule applies only to `self` and `persona`. Under `absent`, the
    user directs from outside, so their turns are read as direction or
    co-writing.
  - **Each character:** their free-text fields, then their dials in words
    (`dial-words.ts`), and "where the description and the dials disagree,
    follow the description".
  - **The scene's fields.**
  - The e2e stub's `Your character: ` line search changes to match.
- **`max_tokens`** goes from 900 to 1200, to fit the meta block.
- Bodies are still never logged, and the console-spy test is kept.

### Turns and the rest

`src/lib/server/daydreams.ts`:

- **`appendTurn`** takes `parentId | null`. It:
  - checks the parent is in this daydream;
  - sets `position = parent.position + 1`, or 0 for a root;
  - inserts, idempotent on `id`;
  - sets `active_turn_id` and `last_turn_at`.

  With no unique position there is no `conflict` for concurrent appends: two
  devices simply make two branches.
- **Remove `replaceLatestCharacterTurn`, the PUT handler and the `not-latest`
  refusal.** Retry is now an append of a sibling.
- **`getDaydream`** returns:
  - the setup;
  - `activeTurnId`;
  - `structure` (id, parentId, role, position, createdAt; no ciphertext;
    capped at `MAX_TREE_NODES = 2000`);
  - the active `path`'s sealed turns, fetched by id in chunks of 100 for D1's
    bound-parameter limit, capped at the newest `MAX_LOADED_TURNS`;
  - `marks` (capped at 500).
- **`setActiveTurn`**, **`readTurns(ids ≤100)`**, **`createMark`**, and
  **`deleteMark`** (both checked against owner and daydream). Everything stays
  owner-scoped, with explicit columns.

Endpoints under `src/routes/api/daydreams/[id]/`, each running `guard()`
(session plus `requireFeature`) as `turns/+server.ts` does:

| Route | Does |
| --- | --- |
| `turns` POST | append, with `parentId` (`appendTurnSchema` gains it) |
| `turns/read` POST | `{ ids }` returns sealed refs, for switching branch and labelling the map |
| `active` PUT | `{ turnId }` |
| `setup` PUT | sealed setup + `expectedRevision` (CAS via `updateDaydreamSetup`), for the dials and "not this" |
| `marks` POST / DELETE | create, or remove by id |

### Libraries and suggestions

In `src/lib/server/daydreams.ts`:

- `listCharacters`, `createCharacter`, `updateCharacter` (CAS),
  `deleteCharacter`;
- the same four for scenes;
- each checks the envelope and the self vault through `contentProblem`, and
  is owner-scoped.

`getDaydreamSetup` and the setup pages also return each library row's
`{ id, revision }`, so the page can compute `outOfSync` without opening
anything.

Endpoints, each with `guard()`:

| Route | Does |
| --- | --- |
| `api/daydreams/characters` POST, `…/characters/[cid]` PUT / DELETE | the character library |
| `api/daydreams/scenes` POST, `…/scenes/[sid]` PUT / DELETE | the scene library |
| `api/daydreams/suggest` POST | model-written suggestions (below) |

**`api/daydreams/suggest`** is a second model endpoint under the same
plaintext rules as `reply`:

- checks the session, `requireFeature`, the disclosure and a rate limit;
- never logs anything but the status;
- sends `provider.data_collection: 'deny'`.

The body:

```
{ task: 'chips' | 'fill' | 'surprise-scene',
  target: 'character' | 'scene',
  field?: string,
  draft: <the partial character/scene>,
  context: { voice, characters (names + dials only), limits, dials } }
```

- **`chips`** returns about 8 more chips for one field.
- **`fill`** completes the empty fields of the draft.
- **`surprise-scene`** writes a whole scene from the characters, voice,
  limits and dials.

The prompts live in `src/lib/server/daydream/suggest-prompt.ts`. They are
server-owned, reuse the safety rules from `RULES` (adults only, no real
people, never crossing the limits), and ask for JSON only, non-streaming.

The server passes the provider's response through unread, as `reply` does.
The browser parses and validates it with the kind's Zod schema, in
`src/lib/daydream/suggestions.ts`, and drops anything invalid.

Rate limit: a separate `daydream-suggest|user|<id>` scope (for example 30 a
minute and 200 a day) in `rate-limit.ts`, so filling in forms never uses up
someone's story replies. Add it to `docs/rate-limiting.md`.

The disclosure is checked before any suggestion. The setup pages already
need it accepted. If it isn't, `/daydreams/new` shows `DaydreamDisclosure`
first, as the list does. Curated chips work without it, but the page asks
before anything goes to the model.

`DaydreamTurnView` / `DaydreamView` in `src/lib/types.ts` change to
`{ id, parentId, role, position, createdAt, sealed? }`, plus a
`DaydreamMarkView`.

## Client

### Setup (`/daydreams/new`, `/daydreams/[id]/edit`)

`DaydreamSetupForm.svelte` is rebuilt as sections. It stays a superform that
seals on submit, under `daydreamSetupFormSchema`, which is rewritten for v2.

1. **Title.**
2. **Voice** (`DaydreamVoicePicker.svelte`):
   - Preset cards fill both settings in one tap: Talk with a character /
     A story told to you / Watch a story unfold / The rules.
   - Below them, the two explicit pickers: who tells it, and where you
     stand. Choices that `voiceProblem` would refuse are disabled, each with
     a line saying why.
   - The protagonist name field appears for `persona`.
3. **Characters** (`DaydreamCharacterPicker.svelte`):
   - The selected characters as cards (0–4), each with Edit and Remove.
   - "Add a character" offers the library list, or New character.
   - The section's own message says whether characters are needed, optional,
     or "people the narrator voices", from `voiceProblem`.
   - **Out of sync:** a card whose copy has `outOfSync` shows "Updated in
     your library", with **Use the latest** (copy it over) and **Keep this
     version** (store the library's revision as seen, so it stops asking).
   - A copy with no source, from an upcast or an unsaved creation, shows
     **Save to my characters**.
4. **Scene** (`DaydreamScenePicker.svelte`):
   - The selected scene card, then **Choose a saved scene**, **New scene**,
     and **Surprise me**.
   - Surprise me calls `suggest` with `surprise-scene`, then opens the scene
     dialog filled in, with **Try another**. Saving to the library is a
     checkbox, on by default.
   - The same out-of-sync and save-to-library actions as characters.
5. **Lead**, shown only where `voiceProblem` says it applies; **limits**;
   and the **story dials** (`DaydreamDials.svelte`, the same component as in
   the thread).

**`DaydreamCharacterDialog.svelte`** is a `wa-dialog` with its own
superform, schema in `src/lib/schemas/daydreamCharacterForm.ts`. It seals and
posts to the library endpoint, then hands the saved character, with its new
revision, back to the picker as a copy. Editing from a daydream's setup
updates the library, and that daydream's copy updates straight away. Other
daydreams then see "Updated in your library".

- **Quick start:** starter templates from `catalog.ts`, as cards.
- **Dials first:**
  - tone as four `wa-radio`-style buttons;
  - four `wa-slider`s with word labels from `dial-words.ts`;
  - each dial can be cleared back to "not set".
- **Then each free-text field**, as a `wa-textarea`:
  - curated chips under it, which toggle phrases with `toggleChip` and are
    highlighted when present;
  - a **More ideas** button, which adds model chips for that field.
- **Fill in the rest** asks the model to complete the empty fields. It only
  fills empty ones, never overwriting what was written.
- **"Save to my characters"** is on by default. Unticked, it becomes a copy
  with no source, kept only in this daydream.

**`DaydreamSceneDialog.svelte`** works the same way for scene fields, with
the curated scene chips and templates. It has no dials of its own; the story
dials sit in the setup.

**Library pages:** `/daydreams/characters` and `/daydreams/scenes`.

- They list the library, with edit (the same dialog) and delete. Delete
  needs no warning about daydreams that use the item, because daydreams hold
  copies.
- Each page has a load and actions with `requireFeature`.
- Both are linked from `/daydreams`.

### The thread

`DaydreamThread.svelte` is split, because it is already 441 lines.
`DaydreamThread` keeps orchestration:

- the structure, the path, the opened text in `written`, streaming, Stop;
- one `generate({ parentId, mode, rewrite? })` used by send, Continue, retry,
  rewrite, roll and the check-in.

### Flow

- **Send.**
  - Seal and append a `text` turn under the active leaf, then generate under
    it.
  - Explicit OOC gets a faint "out of character" label.
  - After the reply, the user turn shows a faint `readAs` label when the
    model's reading differs from plain action.
- **Continue.** Generate a story turn whose parent is the current
  story leaf. No user turn is stored, and the prompt's existing continue
  nudge applies.
- **A direction button** (including Surprise me): append a `direction` turn,
  then generate.
- **Suggestions.**
  - Tapping one sends it as a `text` turn.
  - The edit icon fills the composer instead. `MessageComposer` gains an
    exported `replaceText(text)`, built on a plain-text-to-document helper in
    `richtext-editor.ts`, and that also updates the draft.
- **Retry ("Write again")**, available on any story turn: generate a
  sibling with the same parent. The new turn becomes active and the old one
  stays as a branch.
- **Stop** works as now (abort, keep what had arrived).

### Components (new, in `src/lib/components/`)

- **`DaydreamPassage.svelte`**:
  - passage text, with bookmarked quotes highlighted in `<mark>`;
  - a sibling switcher (`‹ 2/3 ›`) wherever the turn has siblings;
  - a reactions row (love / like / not for me), which toggles one mark per
    turn;
  - a `wa-dropdown` menu: Bookmark, Write again, Continue from here;
  - out-of-character turns render as an aside.
- **`DaydreamUserTurn.svelte`**: text turns as bubbles; direction, steer, roll
  and safety turns as compact markers (`→ Slower`, `🎲 5 — you hold still`,
  `Stopped the scene`).
- **`DaydreamSelectionToolbar.svelte`**:
  - On `selectionchange` inside one passage, it shows a bar under that passage
    (not at the caret, to avoid fighting the native mobile menu) with More of
    this, Rewrite this, Not this, and Bookmark quote.
  - Offsets come from a Range measured against the passage element. Turns are
    immutable now, so the offsets stay valid.
  - **More of this:** append a `steer` turn under the active leaf, then
    generate.
  - **Rewrite this:** generate a sibling of the target with `mode: 'rewrite'`;
    its context is the path up to the target's parent. On an older passage this
    starts a branch.
  - **Not this:** opens `DaydreamNotThisDialog.svelte`, prefilled with
    `Avoid: "<quote>"` and editable.
    - Saving appends a line to `setup.limits` through `setup` PUT. If the
      limits would exceed their cap, the dialog says so and links to the setup
      page.
    - If the target is the newest passage, it is then rewritten as a sibling.
- **`DaydreamDirections.svelte`**: a pinned Continue plus
  `currentDirections(path)` as small pill buttons above the composer. They are
  hidden while halted.
- **`DaydreamSuggestions.svelte`**: under the newest passage, one row per
  suggestion with tap-to-send and an icon-only edit button (`wa-icon label`).
- **`DaydreamRollCard.svelte`**:
  - Shown when the newest passage's `meta.roll` is valid: the prompt, the
    outcome table and a Roll button.
  - Rolling uses `dice.roll`, appends a `roll` turn, then generates.
  - Ignoring it and writing anything else is fine; the card goes away.
  - A re-roll is honest: rewind to the proposal ("Continue from here") and roll
    again, which makes a branch.
- **`DaydreamSafety.svelte`**:
  - **Stop the scene** and **Ease off** are always visible beside the composer,
    including while a reply streams.
  - **Stop the scene** aborts any stream (discarding the partial), appends
    `safety: red` under the leaf, and generates, which the server forces to a
    check-in. A halted banner then offers:
    - **Resume**: a `resume` turn.
    - **Ease off and resume**: `yellow`, plus intensity −1.
    - **End here**: back to the list. The story stays halted; reopening it
      shows the banner.
  - While halted, the composer stays usable, and the server keeps the replies
    out of character until the user resumes.
  - **Ease off** aborts any stream, appends `yellow`, lowers intensity by one
    through `setup` PUT, and generates.
  - The copy never says "safeword" or "unlock".
- **`DaydreamDials.svelte`**:
  - A `wa-popover` from a "Dials" button: `wa-slider` for intensity and pace, a
    radio group for length.
  - Saved through `setup` PUT, debounced, CAS on revision. A conflict reloads
    the setup and tells the user.
  - The same fields go in `DaydreamSetupForm.svelte`, which loses its
    safeword field.
- **`DaydreamBranchMap.svelte`**:
  - A `wa-drawer` showing the tree from `structure` as an indented, vertical
    outline: depth as indent, forks as nested lists. The active path and
    bookmarks are marked.
  - Labels are the first words of each turn, opened lazily through
    `turns/read` for the nodes in view; role and depth show until they open.
  - Selecting a node activates `latestLeafUnder(node)` (`active` PUT, then
    fetching any missing path ciphertext) and scrolls to the node.
  - "Continue from here" on a node makes that node the leaf.
- **`DaydreamBookmarks.svelte`**:
  - A `wa-drawer` listing bookmarks: each one's label or quote, and its
    passage's first words.
  - Tapping one jumps as the branch map does. Delete is a menu item.
  - A turn bookmark takes an optional label from a small dialog. A quote
    bookmark takes the selected text.

The header gains **Branches** and **Bookmarks** buttons beside Setup. The
composer's placeholder becomes
`Your turn… (start with OOC: to step outside the story)`, and the reminder line
under it drops the safeword sentence. Accessible names stay unique per page
(AGENTS.md). Directions and suggestions are `wa-button`s following the save
button and icon button rules.

### Reused as is

- `tryFetch` / `describeFailure` in `daydream/client.ts`, extended with
  `readTurns`, `setActive`, `saveSetup`, `createMark` and `deleteMark`;
- `sealForSubmit` / `sealTurn`;
- `readReplyStream`, now fed through `visiblePassage`;
- `scrollIntoViewWithin`;
- `openDraft` (the draft scope is unchanged).

## Docs

- **`docs/daydreams.md`** (a substantial rewrite):
  - the tree and why turns are immutable;
  - the plaintext boundary, now including `parent_id`, depth and
    `active_turn_id`;
  - each control, its turn type, how it is sent to the model, and that `meta`
    is never sent for past turns;
  - the reply format and how it degrades;
  - the safety controls, and that the server forces the check-in;
  - why the custom safeword was dropped, and that v1 setups lose it on upcast;
  - dice and their honesty rules;
  - bookmarks and reactions;
  - the updated caps.
  - An **"Ideas, not built"** section covering **auto-continue** (keep
    generating at a chosen pace until interrupted) and **"Previously…"
    recaps** (a summary on return, which could double as memory once old
    turns fall out of context).
    - **A book-page layout for narrated stories**: a prose column instead of
      chat bubbles, the user's turns inline as small italic interjections,
      and choices under the newest passage.
  - A **"Setting it up"** section covering:
    - voice (narrator × stance) and its validity rules;
    - character and scene libraries;
    - copies with out-of-sync detection by revision;
    - character dials vs free text;
    - curated vs model suggestions;
    - that `suggest` is a second plaintext path, under the same rules as
      `reply`.
- **`docs/encryption.md`**: the new kind versions and `daydream-mark`.
- **`AGENTS.md`**: no new invariants. Check the feature table row's wording.
- **Roadmap** (`src/lib/roadmap/roadmap.json`): add a shipped twig for this
  under Daydreams (steer, branch, bookmark, roll, safety controls) with
  `shippedOn`.
- **Historical plan**: copy this plan to
  `docs/historical-plans/<impl-date>-daydreams-interactions.md`.

## Tests

- **Pure:**
  - `tree.test.ts`: paths, siblings, latest leaf, halted states,
    direction folding and the cap;
  - `reply-format.test.ts`: a partial marker hidden mid-stream, valid and
    invalid meta, missing meta;
  - `ooc.test.ts`;
  - `dice.test.ts`: the range, no bias (a seeded fake random over every
    value), coverage validation;
  - `context.test.ts`: path trimming, typed rendering, no past meta;
  - `prompt.test.ts`:
    - the rules always come first;
    - a halted path forces a check-in in any mode;
    - explicit OOC is labelled;
    - roll, direction and steer rendering;
    - the rewrite request;
    - the Surprise me guidance present;
    - no safeword text;
  - the sealed fixtures (the v1 fixtures still open and upcast; the v2 and
    mark fixtures are frozen);
  - the migration backfill test;
  - `voiceProblem` for every narrator × stance × count combination,
    including the four example shapes;
  - `chips.test.ts`: toggling preserves other free text, and out-of-sync
    detection;
  - `suggestions.test.ts`: valid and invalid model JSON;
  - `prompt.test.ts`: each voice's how-to-write section, character dials in
    words, the "description wins" line, and the setup v1 upcast rendering
    the same as before;
  - `suggest-prompt.test.ts`: the safety rules are present, and the limits
    are included.
- **Server** (`createTestDb`):
  - `daydreams.test.ts`:
    - append with parent, root, foreign parent (refused), depth;
    - concurrent siblings both kept;
    - the active turn updated on append and by `setActiveTurn`;
    - `readTurns` scoped to the owner;
    - the marks CRUD and the cascade on daydream delete;
    - a path fetched across more than 100 ids.
  - The library CRUD: CAS conflicts, owner scoping, and that a delete leaves
    daydreams intact.
  - The `suggest` endpoint: 403, 409 before the disclosure, the rate limit
    on its own scope, the stubbed fetch receiving the server prompt and
    `data_collection: 'deny'`, and the console spy.
  - Route tests for each new endpoint: 401, 403 without the feature, 404 for
    another user's daydream, 400 on a malformed body. The reply endpoint
    accepts the new schema and stays quiet on the console.
- **Component** (browser project):
  - `DaydreamThread`: meta hidden while streaming, directions and suggestions
    shown after the reply, tap a suggestion sends, edit fills the composer;
  - the sibling switcher changes the path;
  - Stop the scene aborts and shows the halted banner, and Resume clears it;
  - a roll card rolls and appends;
  - the selection toolbar appears for a selection inside a passage;
  - the voice picker disables invalid choices, and presets fill both
    settings;
  - character dialog chips toggle text, and Fill in the rest leaves written
    fields alone (both through a wrapper, because of `superForm`);
  - the out-of-sync card offers Use the latest.
- **E2E** (`e2e/daydreams.spec.ts`, with `e2e/model-stub.mjs` extended):
  - The stub emits a `<meta>` block with directions (including Surprise me),
    suggestions and, for a turn containing `[roll]`, a roll proposal.
  - It answers a check-in when the last user message is the red notice.
  - The spec covers:
    1. a direction button;
    2. a suggestion, sent and edited;
    3. retry, then switching back with the sibling switcher;
    4. a reload keeps the active branch;
    5. the branch map jump;
    6. a quote bookmark, a reload, then jumping to it;
    7. a roll;
    8. Stop the scene, then Resume;
    9. Ease off lowers the intensity;
    10. "Not this" adds a limit;
    11. a reaction persists;
    12. OOC labelling;
    13. creating a character in the dialog, with dials and a chip, saved to
        the library;
    14. a second daydream picking that character from the library;
    15. editing it from the second daydream, then the first showing "Updated
        in your library" and Use the latest;
    16. Surprise me filling a scene;
    17. a character-less daydream with a second-person narrator, and a
        voyeur setup (two characters, third person, absent), both opening.
  - The stub answers `suggest` tasks with fixed JSON.

## Build order

Each step is verified before the next:

1. migrations and sealed kinds;
2. pure modules;
3. server functions and endpoints;
4. the reply format and prompt, including the voice-aware `describeSetup`;
5. the setup rebuild: voice picker, libraries, the character and scene
   dialogs with dials and chips, `suggest`, Surprise me, out-of-sync handling
   and the library pages;
6. the thread split, directions, suggestions and the composer `replaceText`;
7. the safety controls and dials;
8. retry as sibling, the switcher and the branch map;
9. selection, "not this", reactions and bookmarks;
10. dice;
11. docs, the roadmap and the historical plan.

## Verification

- `npm run check`, `npm run lint`, `npm test`, `npm run test:e2e`, and
  `npm run test:e2e:image` (the stub and migrations in the Docker build).
- Migrations on a local D1 copy: `npm run db:migrate:local-preview` against a
  database holding v1 daydreams, then `npm run preview`. Confirm existing
  daydreams open on their newest turn, that a retry branches, and that
  streaming through workerd still passes the `<meta>` tail through unbuffered.
- A manual run against real OpenRouter with `DAYDREAM_MODEL`, to tune the
  prompt sections. Check that the model reliably emits valid `<meta>`, keeps
  the direction set fresh, offers Surprise me sometimes, proposes rolls rarely,
  and does a check-in after Stop.
