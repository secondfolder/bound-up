/**
 * The lenient tag parser every model reply in the new daydream engine goes
 * through: the brief reading, the build, passages, filled cards. See
 * docs/dreams.md, "The markup".
 *
 * Lenient on purpose, because a model writes it. A broken tag loses only
 * that tag, never the passage: an unknown or malformed `<…>` is kept as text,
 * a close tag nothing opened is ignored, and anything left open at the end is
 * closed. It is not an XML parser, so a stray `&` or a `<3` in prose cannot
 * break it, and nothing it returns is ever HTML.
 *
 * **Streaming.** A reply is parsed again from the start as each chunk arrives
 * (`createMarkupStream`) rather than incrementally. Passages are a few
 * kilobytes, so re-parsing is cheap, and it makes the streamed result exactly
 * the whole-text result by construction: the only difference while streaming
 * is that a partly written tag or `[[ref` at the end is held back, so it never
 * flashes up as text and then turns into markup.
 *
 * Pure and alias-free.
 */

export type MarkupText = { type: 'text'; text: string };

/** `[[id|words]]`: a reference to an element the code could not link by name. */
export type MarkupRef = { type: 'ref'; id: string; text: string };

export type MarkupTag = {
	type: 'tag';
	/** Lower-cased. */
	name: string;
	/** Read with `?.`: any attribute may be missing, whatever the model was asked for. */
	attrs: Partial<Record<string, string>>;
	children: MarkupNode[];
	/**
	 * Its close tag was seen, or it closed itself. False for a tag still
	 * streaming, or one the model never closed, which `parseMarkup` closes at
	 * the end of a final parse all the same.
	 */
	complete: boolean;
};

export type MarkupNode = MarkupText | MarkupRef | MarkupTag;

export type MarkupOptions = {
	/**
	 * The whole reply has arrived. Until then a partly written tag or ref at
	 * the end is held back rather than shown as text.
	 */
	final?: boolean;
	/**
	 * Tags whose content is kept as one text child instead of being parsed:
	 * the footer, whose lines are JSON, and a build's `<passage>`, which is
	 * parsed on its own with the passage's own options.
	 */
	rawTags?: ReadonlySet<string>;
};

export const DEFAULT_RAW_TAGS: ReadonlySet<string> = new Set(['after']);

/** Deeper than any real reply nests; past it, tags are kept as text. */
const MAX_DEPTH = 32;
/** A tag longer than this is not a tag the model meant, so it stays text. */
const MAX_TAG_LENGTH = 400;
const MAX_REF_LENGTH = 240;

const TAG =
	/<(?<slash>\/)?(?<name>[A-Za-z][\w-]{0,40})(?<attrs>(?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(?<selfClosing>\/)?>/y;
/** Could still become a tag once more of the stream arrives. */
const TAG_PREFIX = /^<\/?(?:[A-Za-z][\w-]*(?:\s[^<>]*)?\/?)?$/;
const ATTRIBUTE =
	/(?<name>[^\s=/>]+)(?:\s*=\s*(?:"(?<doubled>[^"]*)"|'(?<single>[^']*)'|(?<bare>[^\s"'>]+)))?/g;
const REF = /^(?<id>[\w-]{1,40})(?:\|(?<words>[^\]\n]{1,200}))?$/;
const REF_PREFIX = /^\[\[[^\]\n]*\]?$/;
const ENTITY = /&(?:lt|gt|amp|quot|#39|apos);/g;
const ENTITIES: Record<string, string> = {
	lt: '<',
	gt: '>',
	amp: '&',
	quot: '"',
	'#39': "'",
	apos: "'"
};

function decode(text: string): string {
	return text.replace(ENTITY, (entity) => ENTITIES[entity.slice(1, -1)] ?? '');
}

function parseAttributes(source: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	for (const match of source.matchAll(ATTRIBUTE)) {
		const { name, doubled, single, bare }: Partial<Record<string, string>> = match.groups ?? {};
		if (name) {
			attrs[name.toLowerCase()] = decode(doubled ?? single ?? bare ?? '');
		}
	}
	return attrs;
}

type Frame = { tag: MarkupTag | null; children: MarkupNode[] };

class Builder {
	readonly root: MarkupNode[] = [];
	private readonly stack: Frame[] = [{ tag: null, children: this.root }];

	private get top(): Frame {
		return this.stack.at(-1) ?? { tag: null, children: this.root };
	}

	get depth(): number {
		return this.stack.length - 1;
	}

	text(text: string): void {
		if (!text) {
			return;
		}
		const { children } = this.top;
		const last = children.at(-1);
		if (last?.type === 'text') {
			last.text += text;
		} else {
			children.push({ type: 'text', text });
		}
	}

	node(node: MarkupNode): void {
		this.top.children.push(node);
	}

	open(tag: MarkupTag): void {
		this.top.children.push(tag);
		this.stack.push({ tag, children: tag.children });
	}

	/** Closes the nearest open tag of this name; one nothing opened is ignored. */
	close(name: string): void {
		const index = this.stack.findLastIndex((candidate) => candidate.tag?.name === name);
		if (index < 1) {
			return;
		}
		const frame = this.stack[index];
		if (frame?.tag) {
			frame.tag.complete = true;
		}
		this.stack.length = index;
	}
}

type Scan = { builder: Builder; text: string; final: boolean; rawTags: ReadonlySet<string> };

/** Where a raw tag's content ends, and where the text after its close tag starts. */
function rawEnd(scan: Scan, name: string, from: number): { end: number; next: number } {
	const close = scan.text.toLowerCase().indexOf(`</${name}`, from);
	if (close === -1) {
		return { end: scan.text.length, next: scan.text.length };
	}
	const gt = scan.text.indexOf('>', close);
	return { end: close, next: gt === -1 ? scan.text.length : gt + 1 };
}

/**
 * Reads a tag at `at`. Returns where scanning continues, `null` when the text
 * there is not a tag (so it is kept as text), or `'hold'` when it may still
 * become one once more of the stream arrives.
 */
function readTag(scan: Scan, at: number): number | null | 'hold' {
	TAG.lastIndex = at;
	// Annotated: Biome otherwise believes exec never returns null (AGENTS.md).
	const match: RegExpExecArray | null = TAG.exec(scan.text);
	if (!match || match[0].length > MAX_TAG_LENGTH) {
		const rest = scan.text.slice(at);
		const mayGrow = !scan.final && rest.length <= MAX_TAG_LENGTH && TAG_PREFIX.test(rest);
		return mayGrow ? 'hold' : null;
	}
	const groups: Partial<Record<string, string>> = match.groups ?? {};
	const { slash, selfClosing } = groups;
	const name = (groups.name ?? '').toLowerCase();
	const next = at + match[0].length;
	if (slash) {
		scan.builder.close(name);
		return next;
	}
	if (scan.builder.depth >= MAX_DEPTH) {
		return null;
	}
	const tag: MarkupTag = {
		type: 'tag',
		name,
		attrs: parseAttributes(groups.attrs ?? ''),
		children: [],
		complete: Boolean(selfClosing)
	};
	if (selfClosing) {
		scan.builder.node(tag);
		return next;
	}
	if (scan.rawTags.has(name)) {
		const { end, next: after } = rawEnd(scan, name, next);
		const content = scan.text.slice(next, end);
		tag.children = content ? [{ type: 'text', text: content }] : [];
		tag.complete = after > end;
		scan.builder.node(tag);
		return after;
	}
	scan.builder.open(tag);
	return next;
}

/** Reads a `[[id|words]]` ref at `at`, like `readTag`. */
function readRef(scan: Scan, at: number): number | null | 'hold' {
	const close = scan.text.indexOf(']]', at + 2);
	if (close === -1 || close - at > MAX_REF_LENGTH) {
		const rest = scan.text.slice(at);
		const mayGrow = !scan.final && rest.length <= MAX_REF_LENGTH && REF_PREFIX.test(rest);
		return mayGrow ? 'hold' : null;
	}
	const match: RegExpExecArray | null = REF.exec(scan.text.slice(at + 2, close));
	const groups: Partial<Record<string, string>> = match?.groups ?? {};
	if (!groups.id) {
		return null;
	}
	scan.builder.node({ type: 'ref', id: groups.id, text: decode(groups.words ?? groups.id) });
	return close + 2;
}

/** Parses a model reply into a tree. See the module comment for what "lenient" covers. */
export function parseMarkup(text: string, options: MarkupOptions = {}): MarkupNode[] {
	const scan: Scan = {
		builder: new Builder(),
		text,
		final: options.final ?? false,
		rawTags: options.rawTags ?? DEFAULT_RAW_TAGS
	};
	let plainFrom = 0;
	let at = 0;
	while (at < text.length) {
		const isTag = text[at] === '<';
		const isRef = text.startsWith('[[', at);
		if (!(isTag || isRef)) {
			// A lone `[` as the very last character may be the start of `[[`.
			if (!scan.final && at === text.length - 1 && text[at] === '[') {
				scan.builder.text(decode(text.slice(plainFrom, at)));
				return scan.builder.root;
			}
			at += 1;
			continue;
		}
		scan.builder.text(decode(text.slice(plainFrom, at)));
		const result = isTag ? readTag(scan, at) : readRef(scan, at);
		if (result === 'hold') {
			return scan.builder.root;
		}
		if (result === null) {
			plainFrom = at;
			at += 1;
			continue;
		}
		at = result;
		plainFrom = at;
	}
	scan.builder.text(decode(text.slice(plainFrom)));
	return scan.builder.root;
}

export type MarkupStream = {
	/** Adds a chunk and returns the tree so far, with a partial tag at the end held back. */
	push: (chunk: string) => MarkupNode[];
	/** The final tree, once the reply has ended. */
	end: () => MarkupNode[];
	readonly text: string;
};

export function createMarkupStream(options: Omit<MarkupOptions, 'final'> = {}): MarkupStream {
	let buffer = '';
	return {
		push(chunk) {
			buffer += chunk;
			return parseMarkup(buffer, { ...options, final: false });
		},
		end() {
			return parseMarkup(buffer, { ...options, final: true });
		},
		get text() {
			return buffer;
		}
	};
}

/** The text a reader would see, with every tag's own markup dropped. */
export function plainText(nodes: readonly MarkupNode[]): string {
	let out = '';
	for (const node of nodes) {
		if (node.type === 'tag') {
			out += plainText(node.children);
		} else {
			out += node.text;
		}
	}
	return out;
}

/** Every tag of this name, at any depth, in document order. */
export function findTags(nodes: readonly MarkupNode[], name: string): MarkupTag[] {
	const found: MarkupTag[] = [];
	for (const node of nodes) {
		if (node.type !== 'tag') {
			continue;
		}
		if (node.name === name) {
			found.push(node);
		}
		found.push(...findTags(node.children, name));
	}
	return found;
}

/** The first tag of this name, at any depth. */
export function findTag(nodes: readonly MarkupNode[], name: string): MarkupTag | undefined {
	return findTags(nodes, name)[0];
}

/** The trimmed text inside the first tag of this name, or `''`. */
export function tagText(nodes: readonly MarkupNode[], name: string): string {
	const tag = findTag(nodes, name);
	return tag ? plainText(tag.children).trim() : '';
}

/** Every tag name used, for the bench's "unknown tag" check. */
export function tagNames(nodes: readonly MarkupNode[]): Set<string> {
	const names = new Set<string>();
	for (const tag of allTags(nodes)) {
		names.add(tag.name);
	}
	return names;
}

function allTags(nodes: readonly MarkupNode[]): MarkupTag[] {
	const found: MarkupTag[] = [];
	for (const node of nodes) {
		if (node.type === 'tag') {
			found.push(node, ...allTags(node.children));
		}
	}
	return found;
}

const ESCAPES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' };
const ESCAPABLE = /[<>&"]/g;

/** Escapes text so it reads back unchanged through `parseMarkup`. */
export function escapeMarkup(text: string): string {
	return text.replace(ESCAPABLE, (char) => ESCAPES[char] ?? char);
}
