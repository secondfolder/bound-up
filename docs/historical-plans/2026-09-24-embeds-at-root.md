# Plan: embeds at the root, by splitting the paragraph around them

_Written 2026-09-20, refreshed 2026-09-24 against the current tree (Biome,
`src/lib/lexical/`, browser-mode component tests, "no real users yet")._

## What this is

Today a URL embed is an **inline** `DecoratorNode` living inside a paragraph, at
the head of its link's line. Everything about moving the caret past it, selecting
it and pressing it is hand-written in `src/lib/richtext-widgets.ts` (714 lines),
because Lexical's own decorator handling is written for block-level decorators —
nodes that are children of the root.

This plan moves the embed to the root and lets Lexical do that work. The line
structure the writer typed is preserved by **splitting the paragraph** around the
embed and **merging it back** when the embed goes:

```
<p>hello<br>foo<br><br>bar https://embeddable.url</p>

becomes

<p>hello<br>foo<br><br></p>
[embed]
<p continues>bar https://embeddable.url</p>
```

## Why it is worth doing

- **~370 lines of caret code go away** (the four arrow directions, the wrap
  probe, the step-off helpers and their tests), replaced by Lexical paths
  maintained upstream.
- **`$settleLink` and `settleLinksAfterEmbeds` go too.** They exist only because
  an inline embed is the link's previous sibling, which makes `@lexical/link`
  unwrap the auto-link (`isPreviousNodeValid` allows `previousNode === null`).
  With the embed at the root the link is its paragraph's first child, so the rule
  is satisfied — and auto-link retargeting, which `$settleLink` gives up, comes
  back.
- **The behaviour is known-good**: the playground's YouTube node is exactly this
  shape (`DecoratorBlockNode`, `isInline(): false`, a child of the root).

## Behaviour this must not regress

Every one of these was asked for explicitly over the course of the work that
produced the current implementation. They are the acceptance criteria for the
refactor, not a wishlist:

- **Placement.** The embed sits at the head of the line its URL is on — not above
  the paragraph. Two URLs on one line stack their previews **in link order**, the
  second after the first.
- **No caret stop beside it.** There is no cursor position immediately left or
  right of the embed, in either direction of travel, and left/right past it cost
  the same number of presses each way.
- **Up and down reach it.** From the line under the embed, up selects it rather
  than jumping to the line above it; down from above is the mirror. A line that
  wraps is not hijacked — the second row of a wrapped line moves within the line.
- **Selected means selected.** The embed is marked only when it really is the
  selection, never merely because the caret is beside it; a text selection that
  runs across it marks it too; and while it is *the* selection the text caret is
  hidden, because Lexical clears the DOM selection and the browser parks a caret
  at the top of the field.
- **A press on the card selects it**, but a press over the player does not —
  distinguished by geometry, because the whole preview is `pointer-events: none`.
- **A composer holding one embed and no text is not empty** (the placeholder
  stays out of its way).

## Why it is not free

Measured during research:

- A block decorator **inside a paragraph** does not get the good behaviour:
  up/down skip its row (`$tryDecoratorLineNavigation` wants the decorator as a
  sibling of the *top-level block*), and left/right go three presses out, one
  press back, never selecting it. The node must genuinely be a root child;
  `isInline(): false` alone is a trap. Settled: we simply never put one inside a
  paragraph — the insert splits, and the transform is the safety net for the
  routes that do not go through it (paste, stored documents).
- "This paragraph boundary is an artefact of an embed" is not something Lexical
  models. It has to be carried in the document and maintained by a transform.

## The design

### The invariant

1. No `EmbedNode` is a descendant of a block. If one is, split its block at the
   head of the embed's line so the embed becomes a root child.
2. A paragraph marked **`continuesPrevious`** immediately follows an embed. If it
   does not, merge its children onto the end of the previous block and delete it.

Rule 1 covers insertion, paste and documents loaded from storage. Rule 2 covers
removal by any route — the remove button, Backspace on a selected embed,
select-all-delete, undo.

### Where it runs

A **`RootNode` transform**, registered in `createRichTextEditor`. Lexical
guarantees the hook: the root is treated as intentionally dirty whenever anything
is dirty, and its transforms run **last** — the source calls it "a sort of update
finalizer". So it runs once per update, after `registerAutoLink` and friends. It
must reach a fixed point in one pass; Lexical aborts after ~100 transform passes,
so both rules must be idempotent and never undo each other.

**The split is a library call.** `$insertNodeToNearestRootAtCaret(node, caret)`
in `lexical` splits the ancestor chain from that caret up to the root and inserts
the node between the halves; `$insertNodeToNearestRoot(node)` in `@lexical/utils`
is the selection-based wrapper the playground's YouTube plugin uses, which is why
inserting a video mid-paragraph there splits the paragraph. We want the caret
form, because our insert is driven by a sweep rather than by where the caret
happens to be: build a sibling caret at the head of the link's line and hand it
over. Note it wraps an **inline** node in a new paragraph instead, so this only
does the right thing once the node is `isInline(): false`.

Nodes keep their keys through the split, so a caret inside the moved text
survives. `$splitNode(block, index)` is the lower-level alternative if the caret
form turns out not to fit.

**The playground does not merge back** — delete its video and the paragraph stays
in two halves. That half is ours, and it is the only genuinely new machinery in
this plan.

**The writer's blank lines survive the split**, which is not obvious and was
measured: `<p>foo<br>bar<br><br>baz</p>` is four rows, and splitting it before
`baz` leaves `<p>foo<br>bar<br><br></p>` at three rows plus `<p>baz</p>` at one —
because a *single* trailing `<br>` collapses (`<p>foo<br></p>` is one row) while
the one before it still ends a row. The arithmetic only works out because of that
collapse, so it is worth re-measuring if the CSS around embeds changes.

### The marker

`continuesPrevious` on the right-half paragraph. Two ways to carry it:

1. **Lexical node state** (`createState` / `$setState`), serialised under the `$`
   key. No new node class; `richTextDocumentSchema` grows a narrowly typed
   optional `$` on paragraphs and `serialise()` carves out that one key from the
   node-state stripping it does today.
2. **A `ParagraphNode` subclass** by node replacement, with a plain field in
   `exportJSON`. Cleaner stored shape, more moving parts, and needs care that the
   stored `type` stays `"paragraph"`.

Recommend (1), with (2) as fallback. **Spike it first** — it decides the schema
diff. The marker earns its keep twice: the transform needs it to tell artificial
boundaries from real ones, and the renderers need it to suppress `p + p` spacing
so a split message looks exactly like an unsplit one.

### What stays hand-written

Press-to-select (Lexical does not select a decorator on click at any level — the
playground does it per component) and selection marking. `richtext-widgets.ts`
shrinks to roughly that half, and `WidgetNode` becomes our Svelte equivalent of
`DecoratorBlockNode`.

## Order of work

### 0. Spikes (half a day, throwaway)

- **0a. Root-level behaviour in our editor.** Temporarily `isInline(): false`,
  insertion via `$splitNode`, `registerWidgetSelection` off. Confirm in Chromium,
  against the contract above: arrow onto it gives a `NodeSelection`, arrow off
  lands in the adjacent paragraph, up/down reach it, presses are symmetric, and
  — the one to watch — **no extra caret stop appears either side**.
  `$needsBlockCursorBeside` returns true for every non-inline decorator, and a
  block cursor beside the embed is exactly the position the current rules exist
  to remove. In arrow traversal it should never appear (`modify` converts
  straight to a node selection), but check what a click in the gap does.
  **If any of this fails, stop.**
- **0b. The caret through a split.** Type `x https://vimeo.com/1 tail` in one go;
  the split lands a tick or two after the URL finishes, while the writer is still
  typing. Highest-risk behaviour in the change.
- **0c. The marker's stored shape.** Node state → `serialise()` → schema →
  `parseStoredRichText` → editor, unchanged.

Since component tests now run in real Chromium, 0a and 0b can be written as
`*.svelte.test.ts` from the start rather than as throwaway e2e probes.

### 1–2. The node becomes a block, plus the transform (one commit)

- `WidgetNode.isInline()` → `false`; drop the parts of its header comment that
  explain the inline compromise.
- Insertion switches to `$insertNodeToNearestRootAtCaret` at the head of the
  link's line, so the paragraph splits on the way in.
- New module under `src/lib/lexical/` (the tree's home for editor-only Lexical
  pieces, one per file): the merge-back rule, plus the hoist rule as a safety net
  for embeds that arrive inside a paragraph by some other route, registered in
  `createRichTextEditor` beside `registerWidgetSelection`.
- Transform tests in the style of `richtext-widgets.svelte.test.ts`: split cases
  (embed mid-paragraph, at a paragraph head — no split, no empty half, two embeds
  on one line, an embed on the last line), merge cases, idempotence, and
  non-cases (a real paragraph break in a description is never merged).

### 3. Retire what the transform replaces

- From `richtext-widgets.ts`: `$selectBeforeWidget`, `$selectAfterWidget`,
  `$selectWidgetAheadOfCaret`, `$selectWidgetOnAdjacentLine` and helpers,
  `$selectStartOf`/`$selectEndOf`, the four arrow registrations, and their test
  tables. Keep press + marking.
- `$settleLink`, `settleLinksAfterEmbeds`, and the call site in
  `RichTextEditor.svelte`.
- Decide whether insertion keeps putting the embed inline and lets the transform
  hoist it (**recommended** — one normalisation path for typing, paste and stored
  documents) or inserts at the root directly.

### 4. The read path

- `RichText.svelte`: the root-level embed branch stops being the rare case. Fix
  the asymmetry while there — an inline embed whose provider is gone renders
  nothing, while a root-level one degrades to a plain link.
- `richtext-legacy.ts` already emits root-level embeds, so legacy conversion
  becomes correct by accident rather than needing the hoist to fix it up.
- `$embeddedUrls()` and `documentEmbedUrls()` already walk both root children and
  block children, so the send-time metadata cache and the emptiness check keep
  working untouched — do not "tidy" those branches away.
- Paragraph spacing must not apply across a `continuesPrevious` boundary, in both
  the reader and the composer.
- `UrlEmbed.svelte`'s span-only markup is no longer required; leaving it is fine,
  but its comment should stop claiming the constraint.

### 5. Schema and legacy

**Changed 2026-09-24:** with no real users yet, drop the old shapes rather than
carrying them. The earlier version of this plan budgeted for three stored eras
(legacy root-level, inline, split-root) coexisting forever because encrypted
message bodies cannot be migrated. Instead: delete `hoistBlockEmbeds` and the
inline-embed read path outright, alongside whatever `richtext-legacy-migrate.ts`
is already doing, and let the schema describe one shape. The comment on the
root-level embed in the schema ("nothing produces one any more") becomes wrong in
the opposite direction and has to go with it. That removes most of
step 4's risk and a chunk of `richtext.ts`.

### 6. Tests

~40 embed cases across six unit files plus the e2e embed specs. Expect to touch
the golden stored shape and migration cases in `richtext.test.ts`, the settle and
"keeps the embed on the line its link is on" cases in
`RichTextEditor.svelte.test.ts` (that assertion inverts), the reveal-placement
cases in `RichText.svelte.test.ts` / `MessageBubble.svelte.test.ts`, and the
caret walk in `e2e/messaging.spec.ts` — most of which should survive unchanged,
which is the point.

### 7. Docs and close-out (per AGENTS.md)

`docs/rich-text.md` rewritten around the new shape, keeping the fork discussion
as the record of why this was not the original design; the `richtext-widgets.ts`
line in AGENTS.md; this plan copied to
`docs/historical-plans/YYYY-MM-DD-embeds-at-root.md` when it lands.

## Estimate

Spikes half a day; steps 1–3 a day, mostly deletion; steps 4–6 a day, less than
before now that legacy shapes can go rather than being supported. Net roughly
−370 in the widget module, −60 in link settling, an unknown negative in
`richtext.ts` from dropping the old shapes, against +150 to +250 for the
transform and marker. **Call it −300 lines and materially less code we own.**

## Risks, in the order they would bite

1. **The caret during a split while typing** (spike 0b).
2. **Undo across a split** — history records post-transform states, so undo
   should restore the unsplit paragraph atomically. Verify.
3. **A document that is only an embed.** Lexical refuses a root with no children
   and the composer seeds an empty paragraph; a message whose whole content is
   one embed has to stay non-empty for the placeholder rule without acquiring a
   stray blank line. Cover it in the transform tests.
4. **Transform convergence** — two rules that can fight would hit Lexical's
   100-pass abort. Write both as pure functions of the current children and test
   idempotence explicitly.
5. **Descriptions** — same editor, real paragraph breaks. The marker is the only
   thing keeping "remove an embed" from merging paragraphs the writer meant.
6. **Paste** — a pasted document with inline embeds gets normalised, which is a
   feature, but it means paste rewrites block structure. Test it.
7. **IME composition** — transforms skip nodes being composed; a split landing
   mid-composition would be bad. One manual check with a CJK IME.

## Decisions to make before starting

1. Marker mechanism: node state vs `ParagraphNode` subclass (spike 0c decides).
2. Insertion: inline-then-hoist (recommended), or split at insertion time.
3. How much of the legacy read path goes with it (see step 5).
