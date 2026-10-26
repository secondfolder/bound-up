# Scene designer: plan

## Context

The roadmap's "Play and scene sessions" (`scene-sessions`, planned) starts with
designing a scene. People differ a lot in what they care about and how much they
want to write down, so the designer is loose by default: a co-edited page, with a
column of gentle prompts beside it, and structure only where someone adds it.
Decisions made in conversation (2026-10-25):

- A scene is a **new kind of notebook entry** (`kind: 'scene'`), so it gets the
  notebook's live co-editing, outbox, versions, sealing, solo and shared scopes.
- **Split screen**: the page, and a prompts column holding open questions,
  questions with answers to pick, shared kinks as chips, blocks to insert, and
  roleplay (story) ideas. The column **collapses** for focus, and each prompt
  type has its own **Fewer / More** control. No global planning dial.
- **Menu** is an insertable block.
- **Nothing is ever required.** No gating, no "incomplete" states.
- **The model helps only when explicitly asked.**
- **Parts can be hidden from the partner**, shown to them as a visible
  "A surprise" placeholder. Front-end hiding is fine: both can still decrypt.
- **Notebook access rule change (all kinds)**: the control holder may make an
  entry read-only or hidden; when control is shared (`'both'`), only the
  entry's creator may.
- **No comments yet**; add a roadmap item for commenting on notebook entries.

Running a scene live and reviewing it afterwards are out of scope; they get
roadmap twigs.

Everything ships behind a new `scenes` feature (`src/lib/features.ts`) so it can
land in milestones.

---

## Milestone 1: access rule, the scene kind, the two-column page

### 1a. Access rule (all notebook entries)

`src/lib/notebook.ts`
- Add `createdByUserId: string | null` to `EntryForAccess`; fill it in
  `forAccess(row)` (`src/lib/server/notebook.ts:141`).
- New pure helper `holdsAccessAuthority(partnership, entry, userId)`:
  `control !== 'both'` → `holdsControl`; `control === 'both'` → the creator, or
  either member if `createdByUserId` is null (creator's account deleted).
- Rewrite `canSetAccess`:
  - The member who set a restriction may always lift it back to `edit`.
  - Otherwise the viewer needs access authority.
  - A restriction set by someone who no longer has authority can be overridden
    by whoever has it now. Under `'both'` that lets the creator lift one a
    non-creator set before this change, so nothing is ever stuck.
- `entryAccessFor` is unchanged (the setter keeps edit).
- `getEntryContext`, the hidden-entry listing (`listEntries`' "liftable") and
  `setAccessAction` already go through `canSetAccess`; check each still reads
  the stored rows (invariant 14).
- Tests: extend `src/lib/notebook.test.ts` (each control value × creator /
  non-creator × existing restriction by the other, creator null) and
  `partner/[id]/notebook/[entryId]/page.server.test.ts` (403 for a non-creator
  under `'both'`).
- `docs/notebook.md` → Access section; `AccessControl.svelte` copy if it
  mentions control.

### 1b. The `scene` kind

- `NotebookKind = 'journal' | 'note' | 'scene'` and `isNotebookKind`
  (`src/lib/notebook.ts:14-20`); no migration (plain text column).
  `notebookCreateSchema` message: "Expected a journal entry, a note or a scene".
- `loadNotebookList` (`src/lib/server/notebook-pages.ts:70`): a third
  `listEntries(..., 'scene')` call, only when the user has `scenes`; scenes
  ordered by `lastEditedAt` like notes.
- `requireFeature(db, userId, 'scenes')` wherever a scene is served: the create
  action when `kind === 'scene'`, `loadNotebookEntry`, and the four
  `api/notebook/entries/[entryId]/*` endpoints when the entry's kind is
  `scene` (one helper in `getEntryContext`'s callers, e.g.
  `requireKindFeature(ctx)`).
- UI: a "Scenes" tab in `NotebookList.svelte` (extend `initialTab` /
  `rememberTab`), the `NewEntryForm` icon and label ("New scene",
  `masks-theater`), `NotebookEntryRow`, `NotebookEntryPage.svelte`'s `kind`
  type, `NotebookEntryView.kind` in `src/lib/types.ts:754`, and
  `createTestNotebookEntry`.

### 1c. The scene page layout

- `NotebookEntryPage.svelte` renders a new `ScenePage.svelte`
  (`src/lib/components/scenes/`) for `kind === 'scene'`: the existing
  `CollaborativeEditor` on the left and `PromptColumn.svelte` on the right.
- **Collapsing**: a toggle at the top of the column; when collapsed, a slim edge
  strip remains. On a phone the column is a `ResponsiveDialog` sheet, opened
  from a floating button. The collapsed state is per device (localStorage,
  try/catch).
- `PromptColumn` has one `PromptSection` per type, each with its own header,
  **Fewer · More**, and hiding at the lowest step:
  `think` (things to think about), `ask` (questions to answer), `kinks` (what
  you both like), `blocks`, `story` (story ideas).

### 1d. The considerations catalogue

`src/lib/scenes/considerations.json` + `considerations.ts` (alias-free, loaded
and checked like `src/lib/roadmap/` and the kink catalogue; a bad edit fails
tests and `npm run check`). Each entry:
- `id`, `type` (`think` | `ask`), `group` (want / not tonight / during / after /
  before), `level` 1–5 (which More step shows it), `title`, `why` (one line,
  warm, no jargon)
- `ask` only: `answers` (tappable options) plus free text
- `when`: `always` | kink tags (`risky`, …) | kink ids | a block present or
  absent
- `insert`: what Add puts on the page: a section kind and text (`{answer}`
  substituted)

Each card's actions: **Add** (inserts), **We've got this**, **Not for us**
(this scene / all scenes).

Initial content: about 25 entries across the four negotiation questions, drawn
from the research: signals and non-verbal signals; "does 'no' mean stop
tonight?"; limits for tonight; the do / talk about only / never split; body
areas and visible marks; how you are feeling today (tired, sore); warm-up
before intense parts; check-ins; gear and safety shears; opening and closing
rituals; each person's aftercare; next-day check-in; who each part is for.

### 1e. Where prompt state lives

- **Per scene** ("We've got this", "Not for us" for this scene): a third Yjs
  shared type, `prompts` (`Y.Map`), in the entry's document, next to `root` and
  `title` in `src/lib/notebook/collab.ts`. It syncs, is sealed and is versioned
  for free, and both partners see what was handled. `firstEdit` and
  `readDocument` ignore it.
- **Per person** (Fewer / More steps per type, "Not for us" in every scene): a
  sealed record, kind `scene-preferences` v1 in the self vault
  (`src/lib/sealed-kinds/scenes.ts`, plus a frozen fixture), stored in a new
  `scene_preferences` table (`userId` primary key, `ciphertext`, `vaultId`,
  `revision`, `...timestamps`), modelled on `daydreamPreferences`
  (`src/lib/server/db/schema/app.ts:1718`). It is sealed because dismissing
  prompts says something about what someone is into. Endpoint
  `PUT /api/scenes/preferences` with a revision check, saved with `tryFetch`.
  Migration: `npx drizzle-kit generate --name add_scene_preferences`, then read
  the SQL.

### 1f. Recognising what the page mentions

`src/lib/scenes/recognise.ts` (pure): matches catalogue kink names (from
`src/lib/kink-list/catalog.ts`: `liveItems`, `searchKinks`) against the page's
plain text, debounced in the browser. The resulting set of kink ids and tags
feeds `when` triggers. In v1 it only drives prompts; there are no underlines in
the editor.

---

## Milestone 2: blocks, Menu, surprises

### 2a. Node design

Use **element nodes**, not decorator blocks. Their text is ordinary Lexical
text, so Yjs merges partners typing in the same menu character by character,
whereas a decorator's JSON property is last-writer-wins as a whole (see the
`@lexical/yjs` notes in the exploration). Loose to structured is then a matter
of wrapping or unwrapping paragraphs, which keeps every word typed.

New nodes in `src/lib/lexical/nodes/scene/`:
- `SceneSectionNode`: root-level element. Props: `section` (`signals` |
  `limits` | `aftercare` | `ritual` | `prep` | `story` | `notes`) and
  `hiddenFrom: string | null`. Its children are ordinary paragraphs and lists.
  A heading row is drawn from `section`.
- `MenuNode` (props: `orderedBy`: `bottom` | `top` | `turns` | `dice`,
  `hiddenFrom`) → `MenuCourseNode` (title as text) → `MenuItemNode` (text;
  props: `intensity: number | null`, `forWhom: 'me' | 'them' | 'both' | null`,
  `talkOnly: boolean`, `kinkId: string | null`, `hiddenFrom`).
- Each constructor works with no arguments and sets every `__field`
  (`@lexical/yjs` builds `new klass()`). Every edit to a property replaces the
  value, never mutates it in place.

Wiring:
- Add the nodes to `RICH_TEXT_NODES` (`src/lib/richtext-editor.ts:87`).
- Add a `'scene'` `RichTextFeature` and `SCENE_FEATURES = [...DOCUMENT_FEATURES,
  'scene']`. It gates the insert commands (`INSERT_SCENE_SECTION_COMMAND`,
  `INSERT_MENU_COMMAND`), which insert through
  `$insertNodeToNearestRootAtCaret` + `$markBlockContinuation`, as
  `$insertEmbedBefore` does. `CollaborativeEditor` takes `features` from its
  caller.
- Read path: add each type to `RichTextBlockNode` and `blockNodeSchema`
  (`src/lib/richtext.ts:76-171`), `documentToPlainText` and
  `isRichTextDocumentEmpty`, and render branches in `RichText.svelte` before
  the embed `{:else}` (L185-212). `document-shape.ts` needs no change: these
  are root blocks in both shapes. The message schema keeps them out of
  messages and task descriptions (they validate only under a scene-document
  parse).
- Loose ↔ structured: "Make this a menu" turns the selected paragraphs or list
  into courses and items. "Back to text" turns a menu back into a list, with
  each item's props written as text. Both keep every word.
- Menu controls: an inline item toolbar (intensity via `Slider.svelte`, for
  whom, talk only, the surprise toggle) and the who-orders choice on the menu
  header.

### 2b. Surprises (hidden parts)

- Anyone can mark a section, menu or menu item **Only me**
  (`hiddenFrom = partner id`). Only the person who hid it can unhide it.
- The partner's editor draws an "A surprise" placeholder: the node's
  `createDOM` reads the viewer id from a `WeakMap<LexicalEditor, string>` set
  by `ScenePage`, adds `contenteditable=false` and a placeholder, and hides
  the children with CSS.
- A command guard (backspace, delete, cut, paste, typing over a selection)
  refuses edits whose range includes a node hidden from the viewer, so they
  cannot delete what they cannot see.
- Kept out of every other surface:
  - the **header excerpt**: `#saveHeader` (`session.svelte.ts:771`) skips
    every hidden node, whoever saves it, because both partners share the
    header;
  - **version previews**: `RichText` gets a `viewerId` prop and draws the
    placeholder;
  - **model requests**: parts hidden from the requester are removed before
    sending (milestone 4).
- Docs say plainly that this is a courtesy on screen, not encryption, matching
  the notebook's "hidden".

### 2c. The blocks section of the column

Lists Menu, Signals, Limits, Aftercare, Ritual, Prep, Story and Notes, each
with a one-line description. Insert puts the block at the caret. When a
section of that kind already exists, `ask` answers go into it.

---

## Milestone 3: shared kinks and story ideas

### 3a. What you both like

- The scene page load returns your own kink list and, for a shared scene, the
  partner's shared copy: `getKinkList(db, userId, {partnershipId})` and
  `getPartnerKinkList` (`src/lib/server/kink-lists.ts:75,309`), as the compare
  route's layout does.
- In the browser: `compareLists(effectiveList(...), asList(theirs))`
  (`src/lib/kink-list/compare.ts:150`, `partner.ts:67,94`). Fewer shows
  `groups.both` only; More adds `explore`. Never shown: limits, mismatches, or
  anything the partner did not say yes to.
- A solo scene shows your own `like` and `love` answers.
- If the partner has not shared their list, show one gentle card linking to
  sharing.
- Tapping a chip adds a menu item (with `kinkId`) to the selected menu course,
  or otherwise inserts the name as text at the caret.

### 3b. Story ideas

- `src/lib/scenes/story.ts` (pure, alias-free): scene starting points (about 12,
  sweet to extreme, like `IDEA_TEMPLATES`) and chip sets for premise, where,
  your parts, tone and lines to use.
- A starting point inserts a Story section with labelled lines ("Premise: …").
  A chip toggles its phrase on the matching line with `toggleChip`
  (`src/lib/daydream/chips.ts:43`), adding the line if it has gone.
- With the `daydreams` feature, "Play as…" lists library characters
  (`/api/daydreams/characters`) and inserts their name, personality and how
  they talk.
- A **Dice** entry adds a "roll for it" line using `roll`
  (`src/lib/daydream/dice.ts:73`) when chosen. The menu's `orderedBy: 'dice'`
  uses it too.

---

## Milestone 4: model help, on request only

- Buttons appear only where they act, and each says what it will do: **More
  ideas** (a story field), **Fill in the rest** (a story section), **Turn this
  into a menu** (a selection), **What might we have missed?** (the page, which
  returns cards for the `think` section).
- `POST /api/scenes/suggest`: `requireFeature(…, 'scenes')`, then
  `readDaydreamConfig` (503 when no model is configured), the existing
  model-disclosure acceptance, and the rate limit. It streams like
  `/api/daydreams/suggest`, with its own Zod request union. Parts hidden from
  the requester are stripped in the browser before sending.
- The prompts go into the prompt catalogue (`prompt-catalogue/axes.ts`) and are
  read with `npm run prompts:review`, per AGENTS.md.

---

## Roadmap, docs, plan copy

- `src/lib/roadmap/roadmap.json`:
  - `scene-sessions` → `in-progress`, with children `scene-design` (shipped,
    with `shippedOn`, when milestone 3 lands), `scene-run` (planned) and
    `scene-review` (planned).
  - Under `journal-notes`, add `notebook-comments` (planned): "Comment on an
    entry, including one you can only read."
- New `docs/scenes.md` (and a row in AGENTS.md's feature-docs table): the
  layout, the catalogue, prompt state, the nodes, surprises and their limits,
  model help.
- Update `docs/notebook.md` (the access rule, the scene kind, the `prompts`
  map), `docs/rich-text.md` (the scene nodes and why they are element nodes),
  `docs/features-and-admin.md` (`scenes`), and `docs/kink-list.md` (scenes
  read the comparison).
- Copy this plan to `docs/historical-plans/2026-10-25-scene-designer.md`.

## Tests

- **Pure** (node project): access rules; `considerations.ts` loader and
  `when` evaluation; `recognise.ts`; story chips; loose ↔ structured
  conversions as pure document transforms; the excerpt skipping hidden nodes.
- **Server**: the `scene` kind created, listed and loaded behind `scenes`
  (403 without it, on the pages and all four API endpoints); `setAccess` under
  each control value; scene preferences PUT and revision conflict; sealed
  fixture for `scene-preferences`.
- **Component** (browser project): the `PromptColumn` collapse and Fewer / More
  steps; the menu nodes in `decorator-blocks`-style editor tests; a two-writer
  test in `collab.svelte.test.ts` with both typing in one menu and both edits
  kept; the surprise placeholder and the delete guard; `RichText` rendering
  of each new type with and without `viewerId`.
- **E2E** (`e2e/scenes.spec.ts`, using `newAccounts` and `sharedNotebook`):
  - create a scene, add a menu, and see the partner's edits live;
  - hide an item and check the partner sees "A surprise" and cannot delete it;
  - shared kinks appear only after sharing, with no limits shown;
  - a sentinel phrase in a scene never appears in stored rows (as
    `notebook.spec.ts` does);
  - a non-creator under shared control has no access control.

## Verification

`npm run check`, `npm run lint`, `npm test`, `npx playwright test
e2e/scenes.spec.ts e2e/notebook.spec.ts` while iterating, then the full
`npm run test:e2e` before each milestone is called done. Open the app on a phone
width and a desktop width to check the column and the sheet by eye.
