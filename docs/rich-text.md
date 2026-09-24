# Rich text

Messages, task descriptions and reward descriptions are rich text. Formatting
is typed rather than clicked: `*bold*`, `_italic_`, `~struck~`, `` `code` ``,
plus `Ctrl+B`/`I`. Messages have no toolbar at all, the way a chat box should
not; descriptions get a floating toolbar when you select something.

This document is the format and where each half of it lives. The editor is
[Lexical](https://lexical.dev). Messages are encrypted before they are stored —
that is [docs/encryption.md](encryption.md) — and embeds are
[docs/embeds.md](embeds.md).

## The format is Lexical's own serialisation

What gets stored is `editorState.toJSON()`. Not markdown, not HTML, not a shape
of our own. Lexical is the editor, so Lexical defines the document, and a link
is serialised however Lexical serialises a link.

```json
{
	"root": {
		"type": "root",
		"children": [
			{
				"type": "paragraph",
				"children": [
					{ "type": "text", "text": "look ", "format": 0 },
					{ "type": "embed", "url": "https://i.imgur.com/cat.jpg" },
					{
						"type": "autolink",
						"url": "https://i.imgur.com/cat.jpg",
						"isUnlinked": false,
						"children": [{ "type": "text", "text": "https://i.imgur.com/cat.jpg", "format": 0 }]
					}
				]
			}
		]
	}
}
```

Three consequences worth knowing, because they are why this was chosen over
storing markdown:

- **There is no dialect.** Markdown exists only as _typing shortcuts_. Nothing
  parses markdown when reading, so there is no round-trip to get wrong and no
  escaping: type `5 * 3 * 2` and that is exactly what is stored and shown. A
  markdown-backed editor would have rewritten it to `5 \* 3 \* 2` the first
  time anyone edited it.
- **Reading needs no editor.** The serialised state is plain JSON, so
  `RichText.svelte` walks it directly. A page that only displays descriptions
  ships none of Lexical, and the server bundle contains none of it either —
  check with `grep -rl lexical .svelte-kit/output/server` after a build.
- **It costs bytes.** A document is roughly five times the prose inside it, and
  the stored form is the _validated_ form precisely because that strips
  Lexical's default-valued noise and halves it again. Message bodies are
  encrypted and stored in D1, which bills on size, and `MAX_CIPHERTEXT_BYTES`
  (64 KB) has less headroom than it used to.

### Every length limit counts visible text

`MAX_BODY_CHARS` (4,000) and the 500-character description limit are limits on
prose, measured with `documentToPlainText`. Counting the stored string would
call an empty editor full and cut people off after a few hundred typed
characters. A message over the limit is **refused, not truncated** — a document
cannot be cut at a character offset without corrupting it.

## Where the halves live

| File                                              | Role                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/lib/richtext.ts`                             | The document type, its Zod schema, and the read helpers. **Imports no Lexical, and must not.** |
| `src/lib/richtext-editor.ts`                      | The Lexical half: node set, typing shortcuts, the link matcher, `EmbedNode`.                   |
| `src/lib/lexical/nodes/`                          | Editor-only nodes, one per file: the link classes and their shared "Add embed" button.         |
| `src/lib/components/RichText.svelte`              | Renders a stored document. Walks JSON; no `{@html}`.                                           |
| `src/lib/components/RichTextInline.svelte`        | The inline half of the renderer: text, breaks, links, embeds, the `Show` button.               |
| `src/lib/components/ComposerEmbed.svelte`         | One embed inside the editor: the real `UrlEmbed` plus its remove button.                       |
| `src/lib/components/RichTextEditor.svelte`        | The editor, in both moods.                                                                     |
| `src/lib/components/FloatingFormatToolbar.svelte` | The selection toolbar, for descriptions only.                                                  |
| `src/lib/schemas/richTextField.ts`                | The form field: validates, sanitises, limits.                                                  |

The split in the first two rows is load-bearing. A Lexical import in
`richtext.ts` puts the whole editor back on every page that shows a
description.

## The closed node set

`paragraph`, `text`, `linebreak`, `link`, `autolink`, `list`, `listitem`,
`embed`. A node type that is not registered in `RICH_TEXT_NODES` cannot be
created, and one that is not in `richTextDocumentSchema` cannot be stored —
the same guarantee enforced from both ends. There are deliberately no
headings, quotes or code blocks.

`embed` is the only one that appears in both halves of the schema: inline,
where everything written now puts it, and block-level, which is where older
documents have it. See below.

Messages allow a narrower set still (`MESSAGE_FEATURES`): no lists, because a
chat box that turns "- " into a bullet because someone started a line with a
dash is a worse chat box.

### Lexical details that have to be honoured

**`isUnlinked`.** An `AutoLinkNode` maintains `text === url`: edit the text and
Lexical retargets the URL or unwraps the node entirely. `isUnlinked: true` is
its escape hatch for "I removed this link from something that still looks like
a URL". Such a node renders as **plain text** — anything else silently
re-links what somebody deliberately unlinked.

**`format` is a bitfield**, not nested nodes: bold-and-italic is one text node
with two bits set. `richtext.ts` mirrors Lexical's constants rather than
importing them, and `richtext.test.ts` asserts the mirror still matches, so a
renumbering in a Lexical upgrade fails a test instead of silently un-bolding
every message ever written.

**The editor needs a `theme` for that bitfield to be visible.** Lexical draws a
text node as a _single_ tag — `strong` for bold, `em` for italic, `span`
otherwise — so bold-and-italic is `<strong>` alone and strikethrough is a bare
`<span>`. Every format past the first one is carried by a theme class, styled
through `:global()` in `RichTextEditor.svelte`. Without it the document is
right and the screen is wrong, which is a confusing way to lose a format. The
theme therefore covers exactly the formats that have no tag of their own: not
`code`, which Lexical gives a real `<code>` element, and not `underline`, which
is not part of the stored format at all.

**The editor draws links with its own node classes, and never stores them.**
`EditorLinkNode` and `EditorAutoLinkNode` subclass `LinkNode` and
`AutoLinkNode` only to change their DOM. Each one wraps its `<a>` in a
`span.link-with-embed-offer` that also holds the link's "Add embed" button (see
the way back from a removed embed, below), and points Lexical's `getDOMSlot` at
the anchor, so the text is reconciled into the `<a>` and the button is left
alone. They are swapped in through Lexical's node replacement in
`createRichTextEditor`, so `$createLinkNode`, the auto-linker and document
loading all produce them without knowing.

Lexical keys registered nodes by type name and refuses a second class under a
name that is taken, so they serialise as `editor-link` and `editor-autolink`.
**Read an editor's JSON through `exportEditorDocument`, never `toJSON()`
directly**: it maps those names back to `link` and `autolink`, and without it
the schema rejects every document with a link in it. `RICH_TEXT_NODES` stays the
stored node set; the replacements are added only in `createRichTextEditor`.

These live in `src/lib/lexical/nodes/`, one file per node. Code the nodes
share but that is not a node itself goes in `nodes/shared/` — today that is
`embed-offer.ts`, the DOM code the two links share. Each node file exports an
`EditorNodeDefinition` — its class, its own type name, the stored type it
stands in for, and its replacement — and `index.ts` lists them. The editor's
node config (`EDITOR_NODE_REPLACEMENTS`) and `exportEditorDocument`'s renaming
are both derived from that list, so a new editor-only node is a new file and one
line in `index.ts`. Lexical transformers, when there are ones of our own, belong
beside it in `src/lib/lexical/transformers/`, and anything shared between nodes
and transformers in `src/lib/lexical/shared/`.

## Decorator blocks: objects in the text, not characters

A **decorator block** is a `DecoratorNode` that is an object rather than
characters: the URL embed is the only one today, and a poll, an uploaded image
or a quoted message would be the same shape. `DecoratorBlockNode` in
`src/lib/lexical/nodes/decorator-block.ts` is the base — a port of
`@lexical/react`'s, which is React-only because its `decorate()` returns JSX —
so a new one is a subclass supplying a class name, a label and a `decorate()`,
the way `EmbedNode` and the Lexical playground's video block are. Everything
under `src/lib/lexical/` keys off that base, not off embeds.

**A block is at the root of the editor's document, and an inline node in the
stored one.** That split is the point, and it is worth understanding
before changing anything here.

Stored, an embed sits _inline_, at the head of the line its URL is on. It has
to: a paragraph's line breaks are `LineBreakNode`s — in the composer Enter
sends, so a whole message is usually one paragraph full of them — and something
that belongs to _a line_ cannot be a sibling of paragraphs. That is the shape
the reader walks, and the section below describes it.

In the editor, the same embed is a child of the root, with the paragraph cut in
two around it. That is the shape **Lexical's own decorator handling is written
for**: `RangeSelection.modify` reaches across a block boundary and converts to a
node selection, `$tryDecoratorLineNavigation` moves the caret up and down past
it (probing the browser first, so a wrapped line is not hijacked), and
`$needsBlockCursorBeside` draws a **block cursor** either side — a real element,
because there is no line box next to a block to put an ordinary caret in. Every
one of those paths tests `!isInline()` and then looks for the node as a sibling
of a top-level block, so none of it reaches a decorator that is inline, or one
that merely lives inside a paragraph. Writing the equivalent by hand cost
several hundred lines and three rounds of caret bugs — the caret vanishing
beside an embed, the way back taking a press more than the way out, and up from
the line below jumping over it.

`src/lib/lexical/document-shape.ts` is the bridge: `toEditorDocument` on the way
in, `toStoredDocument` on the way out, both pure functions over the JSON, and
exact inverses. Nothing between them sees the other side's shape. It is the same
arrangement as the editor-only node subclasses beside it, one level up.

### Cutting the block, and putting it back

Inserting an embed splits its paragraph, which Lexical does itself:
`$insertNodeToNearestRootAtCaret` cuts the ancestor chain from a caret up to the
root and drops the node between the halves. (The Lexical playground's video
block goes through the same call, which is why inserting one there splits a
paragraph too.) Two details are ours:

- **No empty halves.** `$shouldSplit: () => false` keeps the cut from making a
  half with nothing in it, so an embed at the head of a paragraph does not leave
  a blank row above itself.
- **The far half is marked**, with node state, as the tail of the block the
  decorator was cut out of (`src/lib/lexical/transformers/mend-split-blocks.ts`). Lexical has no notion of a block boundary that exists
  because of something else, so the fact has to be carried. `$mendSplitBlocks`
  reads it back: a marked block whose decorator has gone is joined to the one
  before it. That runs as a transform on the root, which Lexical applies last on
  any update that dirtied anything — its own source calls that "a sort of update
  finalizer" — so it covers every way a block can disappear: the remove button,
  Backspace on a selected one, typing over a selection containing it, a paste.

The mark never reaches storage: the stored document has the embed inline, so
there is no boundary to remember. The playground, for comparison, splits on
insert and never rejoins — delete its video and the paragraph stays in two.

### What is still ours

- **A press selects the block.** Lexical does not select a decorator on a click
  at any level; the playground does it per component, with
  `useLexicalNodeSelection`. Here one listener does it for every block (`src/lib/lexical/plugins/decorator-block-selection.ts`). A press
  over a frame is left alone, tested by geometry rather than by the event's
  target, because a block's content is `pointer-events: none` all through — a
  click in the editor belongs to the editor, not to a video — so every press
  inside it lands on the block element. So is a press on anything interactive
  inside the block, such as the embed's remove button.
- **Saying so on screen.** A block that is the selection outlines itself, and
  the surface hides its text caret: there is no text position then, and Lexical
  clearing the DOM selection leaves the browser parking one at the top of the
  field. A block merely _inside_ a range selection is outlined too — it goes
  when the range is typed over, the same as the words either side of it — but
  the caret stays, because the range has one. A collapsed caret marks nothing at
  all, whatever it happens to be beside.
- **Drawing the block cursor, and refusing it at the top.** Lexical parks a
  caret of its own beside a block, because there is no line box there, and hides
  the text caret while it is up — but it only styles that element if the theme
  names a class, which `EDITOR_THEME` does. Without that the position is
  invisible, which is the bug this whole arrangement exists to fix. Above a
  block that _opens_ the document there is no such position to offer: up and
  left do nothing at all there, the way they do at the start of any document.
  Reported as "I can move up again even though there shouldn't be a line".

`src/lib/lexical/decorator-blocks.svelte.test.ts` drives all of it through a
block that is not the embed, which is the point of that file: rules written against the only
instance of a thing have a way of quietly depending on it.

## Embeds are nodes, not link properties

A link carries no embed information. An embed is its own node, inserted **at
the start of the line the link is on** once the caret leaves a finished
auto-link — typing a space after it, clicking away, blurring the field.

The line, not the paragraph, and that distinction is the whole reason the node
is shaped the way it is. A paragraph's line breaks are `linebreak` nodes rather
than paragraph boundaries, and in the message composer Enter sends — so an
entire message is usually **one paragraph** full of line breaks. An embed above
the paragraph would be an embed at the top of the message, however far down the
URL was.

So the embed node is **inline in the document and block-level on screen** — a
decorator block, in the sense the previous section gives the words. It sits immediately
after the line break that precedes its link and takes a row of its own through
`display: block`:

```json
{
	"root": {
		"children": [
			{
				"type": "paragraph",
				"children": [
					{ "type": "text", "text": "look", "format": 0 },
					{ "type": "linebreak" },
					{ "type": "embed", "url": "https://i.imgur.com/cat.jpg" },
					{ "type": "autolink", "url": "https://i.imgur.com/cat.jpg", "children": [] }
				]
			}
		]
	}
}
```

Not _before_ the line break, which is the obvious reading of "above this line":
a block-level node placed there ends the line itself, and the break it was put
in front of then draws as an extra empty row above the URL.

Splitting the paragraph in two around a block-level embed would place it
correctly too, and was rejected: the halves stay apart once the embed is
removed, so taking an embed away would silently turn a line break into a
paragraph break.

**The other way round — making every line its own paragraph — would work, and
is the real fork in the road.** If Shift+Enter inserted a paragraph break
instead of a line break, `hello` / embed / `world` would be three children of
the root, the embed could be an ordinary block decorator, and Lexical's own
arrow-key and line-navigation handling would apply to it with nothing split.
It is not done because of what a line break _means_ here, not because it could
not be made to work:

- **A chat's Shift+Enter is a new line, not a new paragraph.** One editor
  serves messages and descriptions, and `p + p` carries `margin-block-start:
0.5em` in both the composer and the reader. Paragraph-per-line puts that gap
  between every line of every message, and dropping the gap costs the
  distinction between a line break and a deliberate blank line.
- **Stored documents cannot be migrated.** Message bodies are encrypted, so
  every message already sent keeps the shape it was written in. Embeds have
  already moved once — root-level blocks became inline nodes, which is what
  `parseStoredRichText` fixes up on the way in — and moving back would leave
  three eras to read rather than two.

The behaviour itself would be right, and the playground's YouTube node is the
proof: it is a `DecoratorBlockNode` — a decorator whose `isInline()` is false —
it keeps a line to itself, and there is no caret stop either side of it.
Arrowing towards one never stops beside it, because `RangeSelection.modify`
reaches across the block boundary and converts straight to a node selection on
any keyboard-selectable decorator, inline or not; arrowing off it goes to the
adjacent paragraph. The block cursor appears only when the selection genuinely
lands at an element point beside the node — a click in the gap, or a decorator
that opens or closes the document — and there it _draws_ a position that would
otherwise be invisible, which is the same problem the arrow rules solve by
skipping it. Click-to-select is the decorator's own job there too:
`BlockWithAlignableContents` registers `CLICK_COMMAND` and calls
`useLexicalNodeSelection`.

Plain text is the one thing that would _not_ change: `documentToPlainText`
already joins blocks with `\n` and renders a `linebreak` as `\n`, so every
length limit and preview would come out identical either way.

**Half-measures do not reach it.** Converting only _two_ line breaks in a row
into a paragraph break — the markdown rule, soft break versus blank line — is a
reasonable thing to want for its own sake, but it does not make the embed a
block. An embed goes at the head of the line its URL is on, and a URL whose
line is not the first of its paragraph still has line breaks either side of it:

```
hello
look at this https://youtube.com/…
```

is one paragraph whichever rule blank lines follow, so the embed still has to
live inside it. Only paragraph-per-_line_ gives every line a slot at the root,
and that is the trade the list above describes.

**Older documents have the embed as a root-level block instead**, above the
whole paragraph, because that is where it used to go. Message bodies are
encrypted, so the server cannot rewrite them and there is no migration.
`parseStoredRichText` moves those inline on the way in — to the start of their
URL's line, or the head of the paragraph when the prose does not link to them —
so every reader, and the editor, only ever deals with one shape. The block form
stays in the schema because it is what is stored.

The point of making it a real node is that **opting out is deletion**: the
embed is removed from the document, and there is no stored flag anywhere saying
it was. The chip carries an explicit remove button, because a block that
appeared on its own needs a visible way out; selecting it and pressing
backspace works too.

Four things follow:

- Insertion is idempotent, and only happens when `embedSpecFor(url)` resolves.
  A host with no provider stays a plain link.
- **Removal sticks for the life of the editor.** `RichTextEditor.svelte` keeps
  the URLs whose embed was removed and the sweep skips them, because the caret
  leaving a link is exactly what inserts an embed — without that set, going
  back to fix a typo in the URL would put the embed straight back and the
  remove button would look broken. Removing a link _and_ its embed together is
  not a dismissal: deleting the sentence says nothing about the URL.
- The way back is hovering the link, which shows a small embed button centred
  over it. The button is part of the link's own DOM (see "The editor draws
  links with its own node classes" above), always present and hidden by CSS.
  `registerEmbedOffers` puts `embed-available` on a link's wrapper after every
  update when a provider can embed the URL, the document has no embed for it,
  and the caret is not inside it. The stylesheet shows the button only on
  `.embed-available:hover`, so no script watches the pointer. Pressing it
  dispatches `ADD_EMBED_COMMAND`, which `RichTextEditor.svelte` answers by
  lifting the dismissal and inserting the embed. Deliberately pointer-driven:
  the caret cannot be the trigger, because moving it onto and off a link is the
  gesture that must _not_ re-embed. The button sits on the link rather than
  beside it, inside the hovered wrapper, so the pointer never stops hovering on
  the way to it. That does mean it covers the middle of the link while it is
  showing.
- Because the decision is made while authoring, **adding a provider later does
  not retroactively embed old content.** A document without an embed node has
  no embed, whatever `embedSpecFor` learns afterwards. The one exception is the
  legacy migration, which embeds every supported URL it finds.

`embedSpecFor` still runs at render rather than being stored, so _dropping_ a
provider degrades an embed to its link instead of leaving a hole.

### An embedded link used to stop being an auto-link

`@lexical/link` unwraps an `AutoLinkNode` whose previous sibling is not text
ending in a separator, a line break, or nothing at all — the rule that keeps
`foo` and `https://x` from being read as one link. While embeds were inline,
the embed at the head of the link's line was none of those, so the link was
silently turned back into plain text: on load, on the next edit, and with no way
back. The fix was to convert such a link into an ordinary `LinkNode`, which cost
the auto-link's one useful behaviour — editing the URL text no longer retargeted
the link.

Both are gone. In the editor the embed is a block of its own, so the link is the
first child of its paragraph and `previousNode === null` satisfies the rule.
Stored documents written while the workaround existed still hold `link` nodes
where they would now hold `autolink`; nothing reads them differently.

### The composer shows the real embed

Not a chip standing in for one. What the writer sees while typing is what the
reader gets, which is the only way to tell that the right link was pasted —
including the resolved title, which means the composer asks
`/api/embed-metadata` for the same details the send path is about to cache. For
reddit that is the only way it can draw anything at all, since reddit's oEmbed
is CORS-blocked in the browser. Nothing is drawn until those details land: a
player that appears bare and grows a title card a moment later moves everything
under it.

The embed is capped at a message bubble's width, because that is what it is a
preview of. It also counts as content: a composer holding one embed and no text
is not empty, so the placeholder gets out of its way — an embed carries no text
of its own, which is what made that worth saying out loud.

The embed is a **decorator block** — see the section above — so everything about
selecting it, stepping on and off it with the arrow keys and pressing it comes
from the shared base and is not embed knowledge at all. `EmbedNode`
extends `DecoratorBlockNode` and adds only what is its own: it holds a URL and it is
drawn by `ComposerEmbed`. While it is being edited it is a block at the root,
with the paragraph cut in two around it; stored, it goes back to an inline node
at the head of its link's line.

Lexical renders nothing for a `DecoratorNode` by itself: it collects whatever
each one's `decorate()` returns into a record keyed by node, hands that record
to every decorator listener after each commit, and leaves the mounting to the
host framework. React has portals for that; Svelte has `mount`, so
`RichTextEditor.svelte` keeps a map of node key to mounted `ComposerEmbed` root
and reconciles it against each record. Two consequences worth knowing:

- The listener is registered **before** the initial document is loaded. It only
  fires on commits, so a listener added afterwards never hears about the embeds
  that arrived with the content.
- A component whose DOM disappears is not unmounted, and each one holds an
  `IntersectionObserver` and a scroll listener through `UrlEmbed`. Keys missing
  from the record are unmounted explicitly.

## The reader can ask for one anyway

A link the writer left without an embed renders with a `Show` button after it.
Pressing it inserts a card at the start of that link's line — the same
placement the composer uses, through the same `withInlineEmbeds` helper — and
takes the button away.

The card goes in only once it has something to show. Pressing `Show` looks the
URL's details up first (`fetchEmbedDetailsResult`, the composer's queued,
page-cached lookup), and until that answers the button stays, disabled, with a
spinner in it. Inserting straight away would draw nothing until the lookup
landed — see "no loading skeleton" in [embeds.md](embeds.md) — leaving a button
that vanished with no sign anything was happening. A URL the message already
has cached details for skips the lookup and goes in at once.

A failed lookup still inserts a card, titled with the reason — the server's own
error message where it gave one, otherwise "No preview is available for this
link", "Timed out loading this preview" and the like — and named for the link's
host (`embedErrorDetails`). The reader asked for something, and a silent
nothing reads as a button that does not work. Anything the URL alone can still
draw, a direct image or a curated player, appears under that title. The looked
up details, or the error card, sit under the message's own cached entries, so a
refresh that writes a real entry replaces them.

That reveal lives in `RichText.svelte` as view state keyed by block and URL. It
is never written back: the document belongs to whoever wrote it, and a reader
expanding a link for themselves is closer to opening it in a tab than to
editing what was sent. A reload starts over.

If the card lands outside the scrollport, the reader is smooth-scrolled to it.
A card inserted above a long line is otherwise somewhere they cannot see, and
nothing would appear to have happened.

## Security

**No `{@html}`, ever.** Every character of user prose goes through ordinary
Svelte interpolation and real elements, so the XSS surface is zero. The one
sanitised `{@html}` in the app is inside `UrlEmbed`, and only ever sees
DOMPurify-cleaned oEmbed markup. This is why the renderer walks the document
itself instead of using `@lexical/html`, which returns an HTML string.

**Descriptions are validated server-side.** They arrive as client-supplied
JSON, so `richTextFieldSchema` parses them and **stores its own output**. That
is the sanitisation step: Lexical deliberately preserves unrecognised node
state (a node's `$` key) verbatim so other plugins' data survives a round trip,
which would otherwise make a description column an unbounded arbitrary-data
channel. Invariant 14, the same reasoning as re-checking the thread icon.

Message bodies need no such check — the server holds only ciphertext, and a
sender could always put anything in their own message.

**URLs are checked twice**: `isSafeHttpUrl` on the way in, and again at render
before an `href` reaches the DOM.

## Legacy content

Everything written before this change is a plain string. That is handled by one
boundary function, `parseStoredRichText`, and is **temporary** — see
[docs/temporary-code.md](temporary-code.md) for the removal contract.
