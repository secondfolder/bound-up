import { z } from 'zod';
// LEGACY-RICHTEXT — the one import of the legacy reader; see docs/temporary-code.md
import { legacyTextToDocument } from '$lib/richtext-legacy';

/**
 * The rich-text document: what every freetext field in the app stores, and
 * the only thing the renderer knows how to draw.
 *
 * **The format is Lexical's own `editorState.toJSON()`.** Not markdown, not
 * HTML, not a shape of our own invention. Lexical is the editor, so Lexical
 * defines the document; links serialise however Lexical serialises links.
 * See docs/rich-text.md.
 *
 * **This module deliberately imports nothing from Lexical.** The serialised
 * state is plain JSON, so reading it needs no editor, no DOM and no library —
 * which is why `RichText.svelte` can render a message on a page that has no
 * editor on it without pulling ~90KB of editor into the bundle. Everything
 * that *writes* a document lives in `richtext-editor.ts`, which is browser
 * and editor only.
 *
 * That split is the whole point of the file. Keep it: a Lexical import here
 * puts the editor back on every page that displays a description.
 */

/* ── text format bits ──────────────────────────────────────────────────── */

/**
 * Lexical stores a text node's formatting as a bitfield. These mirror the
 * constants Lexical exports (`IS_BOLD` and friends) rather than importing
 * them, to keep this module Lexical-free.
 *
 * `richtext.test.ts` asserts each one equals the library's own value, so a
 * drift in a Lexical upgrade fails a test rather than silently un-bolding
 * every message ever sent.
 */
export const FORMAT_BOLD = 1;
export const FORMAT_ITALIC = 2;
export const FORMAT_STRIKETHROUGH = 4;
export const FORMAT_UNDERLINE = 8;
export const FORMAT_CODE = 16;

export function hasFormat(format: number, bit: number): boolean {
	return (format & bit) !== 0;
}

/* ── the document ──────────────────────────────────────────────────────── */

export type RichTextInlineNode =
	| { type: 'text'; text: string; format: number }
	| { type: 'linebreak' }
	/**
	 * A preview for a URL in this paragraph, drawn as a block of its own.
	 *
	 * Inline in the document and block-level on screen, which sounds like a
	 * contradiction and is the whole point: a paragraph's line breaks are
	 * `linebreak` nodes, not paragraph boundaries, so an embed that belongs
	 * above *the line* a URL is on has to live inside the paragraph. It sits at
	 * the start of that line — immediately after the preceding line break — and
	 * `display: block` gives it its own row without the paragraph being torn in
	 * two around it. See docs/rich-text.md.
	 */
	| { type: 'embed'; url: string }
	| {
			type: 'link' | 'autolink';
			url: string;
			/**
			 * Only ever on an `autolink`. Lexical sets it when someone removes the
			 * link from text that still looks like a URL: the node survives so the
			 * auto-linker does not immediately re-link it, and it must render as
			 * plain text. See the renderer.
			 */
			isUnlinked?: boolean;
			children: RichTextInlineNode[];
	  };

export type RichTextBlockNode =
	| { type: 'paragraph'; children: RichTextInlineNode[] }
	| {
			type: 'list';
			listType: 'bullet' | 'number';
			start: number;
			children: { type: 'listitem'; value: number; children: RichTextInlineNode[] }[];
	  }
	/**
	 * A root-level embed, which is where every embed used to go: above the whole
	 * paragraph rather than above the line. Still accepted, because documents
	 * written that way are stored and cannot be rewritten, but nothing produces
	 * one any more — `parseStoredRichText` moves them inline on the way in.
	 */
	| { type: 'embed'; url: string };

export type RichTextDocument = { root: { type: 'root'; children: RichTextBlockNode[] } };

/* ── validation ────────────────────────────────────────────────────────── */

/**
 * Descriptions arrive at the server as client-supplied JSON, so the document
 * is validated rather than trusted — invariant 14, same reasoning as the
 * thread icon.
 *
 * Two things this schema does that are load-bearing:
 *
 * 1. **It strips.** Zod's default is to drop keys it does not declare, and
 *    the *parsed output* is what gets stored. That is the sanitisation step:
 *    Lexical preserves unrecognised node state (a node's `$` key) verbatim so
 *    other plugins' data survives a round trip, which would otherwise make
 *    any `text` column an unbounded arbitrary-data channel. Store
 *    `schema.parse(input)`, never the raw input.
 *
 * 2. **It closes the node set.** A node type absent from this union cannot be
 *    stored, which is the same guarantee as not registering it in the editor,
 *    enforced on the other side.
 *
 * URLs are checked with `isSafeHttpUrl` by the caller
 * (`parseRichTextDocument`), which cannot be done here without making this
 * module depend on `embeds.ts`.
 */
const textNodeSchema = z.object({
	type: z.literal('text'),
	text: z.string(),
	format: z.number().int().min(0).max(63).catch(0)
});

const lineBreakNodeSchema = z.object({ type: z.literal('linebreak') });

const embedNodeSchema = z.object({ type: z.literal('embed'), url: z.string() });

const linkNodeSchema = z.object({
	type: z.union([z.literal('link'), z.literal('autolink')]),
	url: z.string(),
	isUnlinked: z.boolean().optional(),
	get children() {
		return z.array(inlineNodeSchema);
	}
});

const inlineNodeSchema: z.ZodType<RichTextInlineNode> = z.union([
	textNodeSchema,
	lineBreakNodeSchema,
	embedNodeSchema,
	linkNodeSchema
]);

const paragraphNodeSchema = z.object({
	type: z.literal('paragraph'),
	children: z.array(inlineNodeSchema)
});

const listNodeSchema = z.object({
	type: z.literal('list'),
	listType: z.union([z.literal('bullet'), z.literal('number')]),
	start: z.number().int().min(1).catch(1),
	children: z.array(
		z.object({
			type: z.literal('listitem'),
			value: z.number().int().min(1).catch(1),
			children: z.array(inlineNodeSchema)
		})
	)
});

const blockNodeSchema: z.ZodType<RichTextBlockNode> = z.union([
	paragraphNodeSchema,
	listNodeSchema,
	embedNodeSchema
]);

export const richTextDocumentSchema: z.ZodType<RichTextDocument> = z.object({
	root: z.object({ type: z.literal('root'), children: z.array(blockNodeSchema) })
});

/* ── reading ───────────────────────────────────────────────────────────── */

/** True when a stored string is a document rather than legacy plain text. */
export function looksLikeRichTextDocument(stored: string): boolean {
	// Cheap enough to run on every message in a thread; the parse is the
	// expensive half and only runs when this passes.
	return stored.startsWith('{"root"') || stored.startsWith('{ "root"');
}

/**
 * Parse and validate a stored document, or null when it is not one.
 *
 * Returns the *stripped* value, so anything the schema does not declare is
 * gone by the time a caller sees it.
 */
export function parseRichTextDocument(stored: string): RichTextDocument | null {
	if (!looksLikeRichTextDocument(stored)) return null;
	let raw: unknown;
	try {
		raw = JSON.parse(stored);
	} catch {
		return null;
	}
	const result = richTextDocumentSchema.safeParse(raw);
	return result.success ? result.data : null;
}

/**
 * The read boundary: turn whatever is stored into a document.
 *
 * Every reader goes through this and nothing else, so no component ever has to
 * know that two formats exist. Once the legacy migration is finished this
 * collapses to `parseRichTextDocument(stored) ?? emptyRichTextDocument()`.
 */
export function parseStoredRichText(stored: string): RichTextDocument {
	const parsed = parseRichTextDocument(stored);
	// LEGACY-RICHTEXT — delete the second branch with the rest, but keep the
	// hoist; see docs/temporary-code.md
	return hoistBlockEmbeds(parsed ?? legacyTextToDocument(stored));
}

/**
 * Move root-level embeds into the paragraph that follows them.
 *
 * Embeds used to be root-level blocks sitting above the whole paragraph. They
 * belong above the *line* now, and documents written the old way are stored
 * and cannot be rewritten — so the read boundary moves them instead, and
 * everything downstream (the renderer, the editor, the send path) only ever
 * deals with one shape.
 *
 * An embed with no paragraph after it is left where it is. That is not a
 * position any writer produced, and dropping it would lose a preview.
 */
function hoistBlockEmbeds(doc: RichTextDocument): RichTextDocument {
	const blocks = doc.root.children;
	if (!blocks.some((block) => block.type === 'embed')) return doc;

	const out: RichTextBlockNode[] = [];
	let waiting: string[] = [];
	for (const block of blocks) {
		if (block.type === 'embed') {
			waiting.push(block.url);
			continue;
		}
		if (waiting.length > 0 && block.type === 'paragraph') {
			out.push({ type: 'paragraph', children: withInlineEmbeds(block.children, waiting) });
			waiting = [];
			continue;
		}
		// A list, or a paragraph that never came: the embeds stay as blocks.
		for (const url of waiting) out.push({ type: 'embed', url });
		waiting = [];
		out.push(block);
	}
	for (const url of waiting) out.push({ type: 'embed', url });
	return { root: { type: 'root', children: out } };
}

/**
 * A paragraph's inline nodes with an embed added for each of `urls`.
 *
 * Each one lands at the start of the line its link is on, or at the start of
 * the paragraph when the paragraph does not link to it at all — which is where
 * a root-level embed used to draw, so a document that names a URL only in
 * prose still looks the way it did.
 */
export function withInlineEmbeds(
	children: RichTextInlineNode[],
	urls: readonly string[]
): RichTextInlineNode[] {
	let out = children;
	// Front to back, recomputing against what has already been inserted: each
	// embed lands after the ones before it, so two URLs on one line stack their
	// previews in the order the links appear.
	for (const url of urls) {
		const at = embedInsertIndexFor(out, url) ?? 0;
		out = [...out.slice(0, at), { type: 'embed', url }, ...out.slice(at)];
	}
	return out;
}

/**
 * Where an embed for `url` belongs among a paragraph's inline nodes.
 *
 * The start of the line the link is on: just past the line break before it, or
 * past the last embed already sitting at that line's head, or index 0 when
 * there is neither. Null when this paragraph does not link to that URL, which
 * is how a caller tells "not here" from "at the front".
 *
 * Line breaks inside a paragraph are what make this necessary at all — see the
 * note on the inline `embed` node.
 */
export function embedInsertIndexFor(children: RichTextInlineNode[], url: string): number | null {
	const linkIndex = children.findIndex(
		(node) =>
			(node.type === 'link' || node.type === 'autolink') &&
			node.url === url &&
			node.isUnlinked !== true
	);
	if (linkIndex === -1) return null;
	for (let index = linkIndex - 1; index >= 0; index -= 1) {
		const type = children[index]?.type;
		if (type === 'linebreak' || type === 'embed') return index + 1;
	}
	return 0;
}

/** An empty document — what an untouched editor and a blank field both mean. */
export function emptyRichTextDocument(): RichTextDocument {
	return { root: { type: 'root', children: [] } };
}

/**
 * The document as unformatted text.
 *
 * Used for previews, and for **every length limit**: the JSON is several
 * times the size of the prose it carries, so counting it would cut people off
 * after a few hundred typed characters.
 */
export function documentToPlainText(doc: RichTextDocument): string {
	const lines: string[] = [];
	for (const block of doc.root.children) {
		if (block.type === 'paragraph') lines.push(inlineText(block.children));
		else if (block.type === 'list')
			for (const item of block.children) lines.push(inlineText(item.children));
	}
	return lines.join('\n').trim();
}

function inlineText(nodes: RichTextInlineNode[]): string {
	let out = '';
	for (const node of nodes) {
		if (node.type === 'text') out += node.text;
		else if (node.type === 'linebreak') out += '\n';
		// An embed contributes no prose: its URL is already in the link that
		// produced it, and a preview reading out a raw URL twice is noise.
		else if (node.type !== 'embed') out += inlineText(node.children);
	}
	return out;
}

/**
 * The URLs of the document's embed nodes, in order, deduplicated.
 *
 * The send path caches embed metadata from this. Because an embed is an
 * explicit node rather than something re-derived from the prose, this is an
 * exact list — the set cached at send time cannot drift from the set drawn at
 * read time, which is what `findRenderableLinks` existed to guarantee by
 * convention.
 */
export function documentEmbedUrls(doc: RichTextDocument): string[] {
	const seen = new Set<string>();
	const walk = (nodes: RichTextInlineNode[]) => {
		for (const node of nodes) {
			if (node.type === 'embed') seen.add(node.url);
			else if (node.type === 'link' || node.type === 'autolink') walk(node.children);
		}
	};
	for (const block of doc.root.children) {
		if (block.type === 'embed') seen.add(block.url);
		else if (block.type === 'paragraph') walk(block.children);
		else for (const item of block.children) walk(item.children);
	}
	return [...seen];
}

/**
 * The URLs a run of inline nodes links to, in order, with duplicates removed.
 *
 * The reader uses this to work out which links in a paragraph could be offered
 * an embed they do not already have. `isUnlinked` nodes are skipped: Lexical
 * sets that when somebody deliberately removed the link from text that still
 * looks like a URL, and offering to embed it would undo that decision by
 * another route.
 */
export function inlineLinkUrls(nodes: RichTextInlineNode[]): string[] {
	const urls: string[] = [];
	const walk = (children: RichTextInlineNode[]) => {
		for (const node of children) {
			if (node.type === 'text' || node.type === 'linebreak' || node.type === 'embed') continue;
			if (node.isUnlinked !== true && !urls.includes(node.url)) urls.push(node.url);
			walk(node.children);
		}
	};
	walk(nodes);
	return urls;
}

/** True when a document holds nothing a reader would see. */
export function isRichTextDocumentEmpty(doc: RichTextDocument): boolean {
	return documentToPlainText(doc).length === 0 && documentEmbedUrls(doc).length === 0;
}
