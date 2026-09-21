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

## Widgets: objects in the text, not characters

A **widget** is this app's name for a `DecoratorNode` that is _inline in the
model and a block on screen_. It lives inside a paragraph, among the text, but
takes a row to itself when it is drawn. The URL embed is the only one today; a
poll, an uploaded image or a quoted message would be the same shape. Everything
in `richtext-widgets.ts` keys off `WidgetNode`, not off embeds, so a new one
gets the whole set of behaviours by extending it and supplying a class name, a
label and a `decorate()`.

The shape is forced rather than chosen, and the reason is in the next section:
a paragraph's line breaks are `LineBreakNode`s, so something that belongs to _a
line_ has to live inside the paragraph that holds the line.

**Lexical's own decorator machinery is written for the other kind** — the
block-level node that is a sibling of paragraphs. `registerRichText` selects
those on a click, steps on and off them with the arrow keys, navigates lines
around them and gives them a block cursor either side. Every one of those paths
tests `!isInline()` first, so none of it reaches a widget, and
`$needsBlockCursorBeside` never fires for one either. `registerWidgetSelection`
is what `registerRichText` would do if it knew about this kind, and it is
registered in `createRichTextEditor` alongside it — above it in priority, so it
gets each key first and hands back what is not its business.

What has to be dealt with is the caret. A widget's row holds no text position
at all, and the model points immediately either side of it are drawn by nothing
— there is no line box beside a block to put a caret in. Measured in Chromium,
not assumed. Those points are perfectly good model positions, so Lexical parks
the caret on them and the browser then draws it somewhere else entirely, or not
at all. Reported three times over: as the caret warping to the end of the
message, as the way back taking one press more than the way out, and as up from
the line under an embed jumping to the line over it.

So, in each direction:

- **Left and right, off a selected widget.** The nearest position that _is_
  drawn: the end of the line above, an empty line (which has a line box of its
  own), a widget stacked alongside — selected in turn — or the end of the block
  next door. A widget that opens the document has none of those to its left, so
  the press does nothing at all and the widget stays selected, which is what
  the left arrow does at the start of any document. Letting the key through
  instead is what put the caret on the undrawable point and, from there, at the
  end of the message.
- **Right, onto a widget.** Stepping onto its row selects it rather than
  stopping in front of it, so the way back takes the same number of presses as
  the way out — browsers disagree about whether that spot is a caret stop at
  all. "About to step onto" allows for the positions in between that nothing
  draws separately: the break that ends the line the caret is already on, whose
  following position the browser draws at the end of that same line, and a
  paragraph boundary when the next paragraph opens with a widget. Each is
  crossed once, so a _second_ empty line still stops the way it should: it has
  a row of its own to visit. Left needs no equivalent, because
  `RangeSelection.modify` lands on a decorator and converts to a node selection
  by itself.
- **Up and down.** A line move over a widget's row lands on the row beyond, so
  without this the widget cannot be reached from above or below at all. Both
  keys select it when the row they are stepping onto is its own. Note that a
  widget and whatever follows it are line-_mates_ in the model — an embed is
  inserted at the head of its link's line, with no break between them — and
  neighbours on screen only because the widget is a block; "the row above" is
  read accordingly.

That reading is a model's, and **a model cannot see a wrapped line**: a long URL
is several rows on screen and one line to Lexical, so taking the up press on the
second row would jump the caret clean out of the line it is in. `Selection.modify`
is the only thing that knows where the rows are, so it is asked where the move
would land, the answer is put straight back, and the press is taken over only if
it was leaving this line regardless. Lexical probes the same way for its own
block decorators.

A **press** on a widget selects it, because clicking a thing is how a pointer
says which one it means; without it a click did nothing at all and the caret
stayed where it was. The press is cancelled, so focus never moves and the caret
is never dropped on the undrawable point beside the widget — the editor is
focused by hand instead. Two exceptions, both inside the widget: anything
interactive (the embed's remove button) keeps its own press, and a press over a
frame belongs to the document inside it. The frame is found by geometry rather
than from the event's target, because a widget's content is `pointer-events:
none` all through — a click in the editor belongs to the editor, not to a video
— so every press inside it lands on the widget element and the target says
nothing about where.

Selection has to be **visible**, because none of it otherwise is. A widget that
is the selection outlines itself and the surface hides its caret: there is no
text position to draw, and Lexical clearing the DOM selection leaves the browser
parking one at the very start of the field, which reads as the caret having
jumped to the top of the message. A widget merely _inside_ a range selection is
outlined too — it goes when the range is typed over, the same as the words
either side of it — but the caret stays, because the range has one. A collapsed
caret marks nothing at all, whatever it happens to be beside: marking the stop
next to a widget made it look selected across two presses of the arrow key, only
one of which meant it.

The classes are `richtext-widget`, `is-selected` on the widget and
`widget-selected` on the surface, all applied by the plugin and styled in
`RichTextEditor.svelte`. `createDOM` returns a `<div>` inside the paragraph's
`<p>`, which is invalid markup a parser would unnest — but nothing ever parses
it. Lexical builds it and inserts it programmatically, and the editor's surface
is server-rendered empty. The read-only renderer, whose markup _is_ parsed, uses
a `span` for exactly this reason.

`richtext-widgets.svelte.test.ts` drives all of the above through a widget that
is not the embed, which is the point of it: rules written against the only
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
widget, in the sense the previous section gives the word. It sits immediately
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

### An embedded link stops being an auto-link

`@lexical/link` unwraps an `AutoLinkNode` whose previous sibling is not text
ending in a separator, a line break, or nothing at all — the rule that keeps
`foo` and `https://x` from being read as one link. An embed at the start of the
link's line is none of those, so the link was silently turned back into plain
text: on load, on the next edit, and with no way back. For a description that
meant the loss was then saved over the top.

So a link that gets an embed is converted to a plain `link` node, which every
branch of that transform skips. `settleLinksAfterEmbeds` does the same to a
document on its way into the editor, for the ones hoisted from the older
root-level shape. The renderer draws `link` and `autolink` identically, so
nothing downstream notices.

What it costs is the auto-link's one extra behaviour: editing the URL text
afterwards no longer retargets the link. That is arguably better here — the
embed above it is pinned to the original URL, so a link that quietly followed
the text would disagree with the preview.

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

The embed is a **widget** — see the section above — so everything about
selecting it, stepping on and off it with the arrow keys and pressing it comes
from `richtext-widgets.ts` and is not embed knowledge at all. `EmbedNode`
extends `WidgetNode` and adds only what is its own: it holds a URL, it is drawn
by `ComposerEmbed`, and it sits at the head of its link's line.

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
