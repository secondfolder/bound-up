import {
	$applyNodeReplacement,
	$getRoot,
	$isElementNode,
	COMMAND_PRIORITY_NORMAL,
	FORMAT_TEXT_COMMAND,
	createEditor,
	type EditorState,
	type Klass,
	type LexicalEditor,
	type LexicalNode,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread
} from 'lexical';
import { registerRichText } from '@lexical/rich-text';
import { registerHistory, createEmptyHistoryState } from '@lexical/history';
import { ListItemNode, ListNode, registerList } from '@lexical/list';
import {
	AutoLinkNode,
	LinkNode,
	$createLinkNode,
	$isAutoLinkNode,
	$isLinkNode,
	registerAutoLink,
	type LinkMatcher
} from '@lexical/link';
import {
	BOLD_STAR,
	INLINE_CODE,
	ITALIC_UNDERSCORE,
	ORDERED_LIST,
	STRIKETHROUGH,
	UNORDERED_LIST,
	registerMarkdownShortcuts,
	type TextFormatTransformer,
	type Transformer
} from '@lexical/markdown';
import { find as findLinks } from 'linkifyjs';
import { embedSpecFor, isSafeHttpUrl } from '$lib/embeds';
import { WidgetNode, registerWidgetSelection } from '$lib/richtext-widgets';
import type { RichTextDocument, RichTextInlineNode } from '$lib/richtext';

/**
 * The editor half of rich text: the node set, the typing shortcuts, and the
 * rules that turn a typed URL into a link and, where we can, into an embed.
 *
 * This module imports Lexical; `richtext.ts` does not, and must not. Only
 * screens with an editor on them pay for the library — see the note there.
 */

/* ── features ──────────────────────────────────────────────────────────── */

export type RichTextFeature = 'bold' | 'italic' | 'strikethrough' | 'code' | 'link' | 'list';

/**
 * What a message may contain. No lists: a chat box that turns "- " into a
 * bulleted list because someone started a line with a dash is a worse chat
 * box, and Messenger does not do it either.
 */
export const MESSAGE_FEATURES: readonly RichTextFeature[] = [
	'bold',
	'italic',
	'strikethrough',
	'code',
	'link'
];

/** What a description may contain. Written in a form, read as prose later. */
export const DOCUMENT_FEATURES: readonly RichTextFeature[] = [
	'bold',
	'italic',
	'strikethrough',
	'code',
	'link',
	'list'
];

/* ── the embed node ────────────────────────────────────────────────────── */

export type SerializedEmbedNode = Spread<{ url: string }, SerializedLexicalNode>;

/**
 * A preview for one URL, inline in the document and block-level on screen.
 *
 * Its own node rather than a flag on the link that produced it, and that is
 * the whole design: because it is a real node, a writer who does not want the
 * embed removes it, and there is no opt-out flag to store anywhere. The chip
 * carries an explicit remove button, because a block that appeared on its own
 * needs a visible way out; selecting it and pressing backspace works too.
 *
 * A `WidgetNode`, which is this app's name for a decorator that is inline in
 * the model and a block on screen. Everything that makes one behave like an
 * object — selected as a unit, deleted in one keystroke, reachable with the
 * arrow keys, selected by a press — comes from `richtext-widgets.ts` and knows
 * nothing about embeds. The note there explains why the shape is forced.
 *
 * What is specific to an embed is only this: it holds a URL, it is drawn by
 * `ComposerEmbed`, and it sits at the start of the line its link is on. The
 * alternative, splitting the paragraph in two around a block node, leaves the
 * halves apart for good once the embed is removed.
 */
export class EmbedNode extends WidgetNode<string> {
	__url: string;

	static getType(): string {
		return 'embed';
	}

	static clone(node: EmbedNode): EmbedNode {
		return new EmbedNode(node.__url, node.__key);
	}

	constructor(url: string, key?: NodeKey) {
		super(key);
		this.__url = url;
	}

	getUrl(): string {
		return this.__url;
	}

	getWidgetClass(): string {
		return 'richtext-embed';
	}

	getWidgetLabel(): string {
		return `Embedded preview of ${this.__url}`;
	}

	updateDOM(prevNode: EmbedNode): boolean {
		// The label carries the URL, so a new URL needs a new element.
		return prevNode.__url !== this.__url;
	}

	/**
	 * The URL, which is all the composer needs to draw the embed.
	 *
	 * Lexical has no renderer of its own: it collects whatever `decorate()`
	 * returns into a record keyed by node, hands that to every decorator
	 * listener after each commit, and leaves the mounting to the host
	 * framework. `RichTextEditor.svelte` is that host — see the note there.
	 */
	decorate(): string {
		return this.__url;
	}

	static importJSON(serialised: SerializedEmbedNode): EmbedNode {
		return $createEmbedNode(serialised.url).updateFromJSON(serialised);
	}

	exportJSON(): SerializedEmbedNode {
		return { ...super.exportJSON(), url: this.__url };
	}
}

export function $createEmbedNode(url: string): EmbedNode {
	return $applyNodeReplacement(new EmbedNode(url));
}

export function $isEmbedNode(node: LexicalNode | null | undefined): node is EmbedNode {
	return node instanceof EmbedNode;
}

/** Every node type the document may contain. A type absent here cannot exist. */
export const RICH_TEXT_NODES: readonly Klass<LexicalNode>[] = [
	ListNode,
	ListItemNode,
	LinkNode,
	AutoLinkNode,
	EmbedNode
];

/* ── typing shortcuts ──────────────────────────────────────────────────── */

/**
 * Messenger/WhatsApp shorthand: `*bold*`, `_italic_`, `~struck~`.
 *
 * These are **typing** shortcuts only. They never appear in the stored
 * document, which is Lexical's own JSON — so unlike a markdown-backed editor
 * there is no dialect to round-trip and no escaping to get wrong. Someone who
 * types `5 * 3 * 2` gets exactly that, stored exactly that way.
 *
 * The CommonMark doubles are kept alongside, because people who know markdown
 * reach for them and there is no reason to refuse.
 */
const BOLD_SINGLE_STAR: TextFormatTransformer = {
	format: ['bold'],
	tag: '*',
	type: 'text-format'
};

const STRIKETHROUGH_SINGLE: TextFormatTransformer = {
	format: ['strikethrough'],
	tag: '~',
	type: 'text-format'
};

const TRANSFORMERS_BY_FEATURE: Record<RichTextFeature, Transformer[]> = {
	// `**` before `*`, so the double is matched as bold rather than as an empty
	// single-star pair wrapping a star.
	bold: [BOLD_STAR, BOLD_SINGLE_STAR],
	italic: [ITALIC_UNDERSCORE],
	strikethrough: [STRIKETHROUGH, STRIKETHROUGH_SINGLE],
	code: [INLINE_CODE],
	link: [],
	list: [UNORDERED_LIST, ORDERED_LIST]
};

export function typingTransformersFor(features: readonly RichTextFeature[]): Transformer[] {
	return features.flatMap((feature) => TRANSFORMERS_BY_FEATURE[feature]);
}

/* ── links ─────────────────────────────────────────────────────────────── */

/**
 * The one answer to "is this a URL", shared by the editor and by the legacy
 * reader in `richtext-legacy.ts`.
 *
 * linkifyjs rather than a regex because it is what the app linkified with
 * before rich text existed — it catches `www.` prefixes and bare domains that
 * a naive URL pattern misses. Keeping it means converted and newly typed
 * content agree about what counts as a link.
 */
export const linkifyMatcher: LinkMatcher = (text: string) => {
	const match = findLinks(text).find(
		(candidate) => candidate.type === 'url' && isSafeHttpUrl(candidate.href)
	);
	if (!match) return null;
	return {
		index: match.start,
		length: match.end - match.start,
		text: match.value,
		url: match.href
	};
};

/* ── embeds ────────────────────────────────────────────────────────────── */

/**
 * Insert an embed at the start of the line holding `link`, if we can embed it
 * and have not already.
 *
 * "The start of the line" is the node just past the previous `LineBreakNode`,
 * or the head of the paragraph when there is none. Not *before* that line
 * break, which is the obvious reading: a block-level embed placed there ends
 * the line itself, and the break it was put in front of then renders as an
 * extra empty row above the URL. Measured in Chromium, not assumed.
 *
 * Must run inside an `editor.update()`. Returns true when it inserted one.
 */
export function $insertEmbedForLink(link: LexicalNode): boolean {
	return $isAutoLinkNode(link) ? $insertEmbedBefore(link) : false;
}

function $insertEmbedBefore(link: AutoLinkNode | LinkNode): boolean {
	const url = link.getURL();
	if (!embedSpecFor(url)) return false;

	const block = link.getParent();
	if (!block || !$isElementNode(block) || block.getParent() !== $getRoot()) return false;

	// Idempotent, and document-wide rather than per line: typing the same URL
	// again, or leaving and re-entering the link, must not stack duplicates.
	if ($embeddedUrls().has(url)) return false;

	const lineStart = $lineStartFor(link);
	// When the link *is* the start of its line the embed lands directly in
	// front of it, which is the arrangement the auto-linker refuses — settle it
	// first, and hang the embed off what that leaves behind.
	const anchor = lineStart === link && $isAutoLinkNode(link) ? $settleLink(link) : lineStart;
	anchor.insertBefore($createEmbedNode(url));
	return true;
}

/**
 * Turn an auto-link into an ordinary link, so the auto-linker stops policing it.
 *
 * `@lexical/link` unwraps an `AutoLinkNode` whose previous sibling is not text
 * ending in a separator, a line break, or nothing at all — the rule that keeps
 * `foo` + `https://x` from being read as one link. An embed at the start of the
 * link's line is none of those, so the link would be silently turned back into
 * plain text: on load, on the next edit to it, and with no way back. Not a
 * hypothetical — loading a saved description did exactly that, and the plain
 * text is what got saved over the top.
 *
 * A `LinkNode` is skipped by every branch of that transform. What it costs is
 * the auto-link's one extra behaviour: editing the URL text afterwards no
 * longer retargets the link. That is arguably the better answer here anyway —
 * the embed beside it is pinned to the original URL, so a link that quietly
 * followed the text would disagree with the preview above it.
 */
function $settleLink(link: AutoLinkNode): LinkNode {
	const settled = $createLinkNode(link.getURL());
	link.replace(settled, true);
	return settled;
}

/**
 * The same settling, applied to a document on its way into the editor.
 *
 * Every path that puts an embed in front of a link has to do this, and loading
 * is one of them: a document hoisted from the older root-level shape arrives
 * with an auto-link directly after an embed, which the auto-linker would unwrap
 * on the very first commit — turning a link into plain text that then gets
 * saved. Documents written since carry `link` there already, so this is a
 * no-op for them.
 */
export function settleLinksAfterEmbeds(doc: RichTextDocument): RichTextDocument {
	let changed = false;
	const children = doc.root.children.map((block) => {
		if (block.type !== 'paragraph') return block;
		const nodes = block.children.map((node, index) => {
			if (node.type !== 'autolink' || block.children[index - 1]?.type !== 'embed') return node;
			changed = true;
			// `isUnlinked` is an auto-link's flag and means nothing on a link, so
			// it goes rather than travelling along as dead state.
			return {
				type: 'link',
				url: node.url,
				children: node.children
			} satisfies RichTextInlineNode;
		});
		return { ...block, children: nodes };
	});
	return changed ? { root: { type: 'root', children } } : doc;
}

/**
 * The node a new embed for `link` goes in front of.
 *
 * The first thing on the link's line — or the first thing after the embeds
 * already sitting there, so that two URLs on one line stack their previews in
 * the order the links appear rather than in reverse.
 *
 * The link itself when nothing else is on the line before it.
 */
function $lineStartFor(link: LexicalNode): LexicalNode {
	let candidate: LexicalNode = link;
	for (const previous of link.getPreviousSiblings().reverse()) {
		if (previous.getType() === 'linebreak' || $isEmbedNode(previous)) return candidate;
		candidate = previous;
	}
	return candidate;
}

/**
 * The auto-links that ought to have an embed above them and do not.
 *
 * `exceptKey` is the link the caret is currently inside, which is skipped: an
 * embed must not pop up while someone is still halfway through typing the URL.
 * Everything else is fair game, which is what makes a **pasted** block of text
 * — or several URLs typed in one go — get its embeds immediately rather than
 * only the one the caret happened to leave.
 *
 * `dismissed` holds the URLs whose embed the writer has already removed. They
 * are skipped forever after, because otherwise the next caret move would put
 * back the thing they just took away — and there is no keystroke that means
 * "and I meant it".
 *
 * Must be called inside a `read` or an `update`.
 */
export function $autoLinksAwaitingEmbeds(
	exceptKey: string | null,
	dismissed: ReadonlySet<string> = new Set()
): AutoLinkNode[] {
	const embedded = $embeddedUrls();
	const waiting: AutoLinkNode[] = [];
	for (const block of $getRoot().getChildren()) {
		if (!$isElementNode(block)) continue;
		for (const child of block.getChildren()) {
			if (!$isAutoLinkNode(child) || child.getKey() === exceptKey) continue;
			if (dismissed.has(child.getURL())) continue;
			if (!embedSpecFor(child.getURL())) continue;
			if (embedded.has(child.getURL())) continue;
			waiting.push(child);
		}
	}
	return waiting;
}

/**
 * Put an embed back for a URL the writer removed one from.
 *
 * Matched by URL rather than by node, because the caller is a pointer hovering
 * an anchor in the DOM, and the first occurrence still missing an embed is the
 * one that gets it — the same order the sweep would have used. `LinkNode` as
 * well as `AutoLinkNode`, because a link that has had an embed before is a
 * settled link now; see `$settleLink`.
 *
 * Must run inside an `editor.update()`. Returns true when it inserted one.
 */
export function $insertEmbedForUrl(url: string): boolean {
	for (const block of $getRoot().getChildren()) {
		if (!$isElementNode(block)) continue;
		for (const child of block.getChildren()) {
			if (!$isLinkNode(child) && !$isAutoLinkNode(child)) continue;
			if (child.getURL() !== url) continue;
			if ($insertEmbedBefore(child)) return true;
		}
	}
	return false;
}

/** Every URL the document currently has an embed for. */
export function $embeddedUrls(): Set<string> {
	const urls = new Set<string>();
	for (const block of $getRoot().getChildren()) {
		// Root level should not happen any more — `parseStoredRichText` moves
		// legacy block embeds inline before the editor ever sees them — but it
		// costs one branch to stay right if one slips through.
		if ($isEmbedNode(block)) urls.add(block.getUrl());
		else if ($isElementNode(block)) {
			for (const child of block.getChildren()) {
				if ($isEmbedNode(child)) urls.add(child.getUrl());
			}
		}
	}
	return urls;
}

/** Every URL the document links, embed or no embed. */
export function $linkedUrls(): Set<string> {
	const urls = new Set<string>();
	for (const block of $getRoot().getChildren()) {
		if (!$isElementNode(block)) continue;
		for (const child of block.getChildren()) {
			if ($isLinkNode(child) || $isAutoLinkNode(child)) urls.add(child.getURL());
		}
	}
	return urls;
}

/**
 * Fold one update's embed changes into the dismissal set, in place.
 *
 * An embed that disappeared while its link stayed behind was removed on
 * purpose; one that appeared cancels any earlier dismissal, which is what
 * makes undo behave — redoing the deletion marks it again on the next pass.
 *
 * An embed whose link went with it is **not** dismissed: deleting the whole
 * sentence is not a statement about the URL, and typing it again later should
 * embed the way it did the first time.
 */
export function trackEmbedDismissals(
	before: EditorState,
	after: EditorState,
	dismissed: Set<string>
): void {
	const had = before.read($embeddedUrls);
	const has = after.read($embeddedUrls);
	if (had.size === 0 && has.size === 0) return;

	for (const url of has) dismissed.delete(url);
	if (had.size === 0) return;

	const linked = after.read($linkedUrls);
	for (const url of had) {
		if (!has.has(url) && linked.has(url)) dismissed.add(url);
	}
}

/* ── the editor ────────────────────────────────────────────────────────── */

/**
 * The class names Lexical hangs on formatted text.
 *
 * Not cosmetic — without this, formats silently go missing on screen.
 * Lexical draws a text node as a **single** tag: `getElementInnerTag` returns
 * `strong` for bold, `em` for italic and `span` otherwise, so a node that is
 * both bold and italic renders as `<strong>` alone, and strikethrough renders
 * as a bare `<span>`. Every format past that first tag is expected to come
 * from a theme class. The document had the bits set the whole time; the editor
 * just had no way to show them.
 *
 * Styled in `RichTextEditor.svelte`, which has to reach them through
 * `:global()` because Lexical owns the markup inside the surface.
 *
 * `code` needs no entry: Lexical gives it a real `<code>` element as the outer
 * tag, which is exactly what the reader sees. `underline` is absent on
 * purpose — it is not part of the stored format (the editor swallows Ctrl+U)
 * and the read-only renderer ignores the bit too, so a class here would make
 * the editor show something no reader ever would.
 */
const EDITOR_THEME = {
	text: {
		bold: 'rt-bold',
		italic: 'rt-italic',
		strikethrough: 'rt-strikethrough'
	}
};

export type RichTextEditorHandle = {
	editor: LexicalEditor;
	destroy: () => void;
};

/**
 * Build an editor and wire every behaviour it needs.
 *
 * Note the ordering constraint that is easy to get wrong: `registerAutoLink`
 * works through **node transforms, which run after the update callback
 * returns**. Anything that needs to see auto-link nodes — inserting embeds
 * above them, for instance — has to happen in a later update, which is why
 * embed insertion hangs off the selection listener rather than off the
 * keystroke that produced the link.
 */
export function createRichTextEditor(options: {
	features: readonly RichTextFeature[];
	namespace: string;
	onError?: (error: Error) => void;
}): RichTextEditorHandle {
	const editor = createEditor({
		namespace: options.namespace,
		nodes: [...RICH_TEXT_NODES],
		theme: EDITOR_THEME,
		onError:
			options.onError ??
			((error) => {
				// Never throw out of the editor: a broken paste must not take the
				// whole composer down with it.
				console.error('[richtext]', error);
			})
	});

	const teardown: (() => void)[] = [
		registerRichText(editor),
		// Everything the arrow keys, the pointer and the eye need for a node that
		// is inline in the model and a block on screen. Above `registerRichText`
		// in priority, which is why it is registered after it here.
		registerWidgetSelection(editor),
		registerHistory(editor, createEmptyHistoryState(), 300),
		registerAutoLink(editor, {
			matchers: [linkifyMatcher],
			changeHandlers: [],
			excludeParents: []
		}),
		registerMarkdownShortcuts(editor, typingTransformersFor(options.features)),
		/**
		 * Underline is bound natively by lexical core (Ctrl+U → FORMAT_TEXT_COMMAND)
		 * but has no place in the stored format, so it is swallowed rather than
		 * left to apply a style that silently disappears on save.
		 */
		editor.registerCommand(
			FORMAT_TEXT_COMMAND,
			(format) => format === 'underline',
			COMMAND_PRIORITY_NORMAL
		)
	];

	if (options.features.includes('list')) teardown.push(registerList(editor));

	return {
		editor,
		destroy: () => {
			for (const off of teardown) off();
		}
	};
}
