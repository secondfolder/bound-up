import {
	DecoratorNode,
	type ElementFormatType,
	type LexicalNode,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread
} from 'lexical';

/**
 * A decorator that is a block: a thing in the document rather than characters,
 * living at the root among the paragraphs.
 *
 * A port of `@lexical/react`'s `LexicalDecoratorBlockNode`, which is React-only
 * for one reason — `decorate()` returns JSX there — so this is the same class
 * with the return type left to the subclass. Ported rather than imagined,
 * because being exactly this shape is what earns Lexical's own handling:
 *
 * - `RangeSelection.modify` reaches across a block boundary and converts to a
 *   node selection when it lands on one, so an arrow key selects it;
 * - `$tryDecoratorLineNavigation` moves the caret up and down past it, probing
 *   the browser first so a wrapped line is not hijacked;
 * - `$needsBlockCursorBeside` draws a caret of Lexical's own beside it, there
 *   being no line box next to a block to put an ordinary one in.
 *
 * Every one of those paths tests `!isInline()` and then looks for the node as a
 * sibling of a top-level block. A decorator that is inline, or that merely sits
 * inside a paragraph, gets none of it — which is what this app found out by
 * writing several hundred lines of caret handling and three rounds of bug
 * reports before deleting them again. See `docs/rich-text.md`.
 *
 * The URL embed is the only subclass today. A poll, an uploaded image or a
 * quoted message would extend this and get the same behaviour.
 */

/** On every decorator block's element: what the editor's styles hang off. */
export const DECORATOR_BLOCK_CLASS = 'decorator-block';

export type SerializedDecoratorBlockNode = Spread<
	{ format: ElementFormatType },
	SerializedLexicalNode
>;

export abstract class DecoratorBlockNode<T> extends DecoratorNode<T> {
	__format: ElementFormatType;

	constructor(format: ElementFormatType = '', key?: NodeKey) {
		super(key);
		this.__format = format;
	}

	/**
	 * What this block is, for anyone who cannot see it.
	 *
	 * Ours rather than the port's: React's version leaves the element bare and
	 * lets its component describe it, and a decorator element in this editor has
	 * no component until the host framework mounts one into it.
	 */
	abstract getBlockLabel(): string;

	/** A class of the block's own, beside the shared one. */
	abstract getBlockClass(): string;

	override isInline(): false {
		return false;
	}

	// biome-ignore lint/nursery/useThisInClassMethods: Lexical's node interface, answered the same for every instance.
	canIndent(): false {
		return false;
	}

	createDOM(): HTMLElement {
		const element = document.createElement('div');
		element.className = `${DECORATOR_BLOCK_CLASS} ${this.getBlockClass()}`;
		element.setAttribute('contenteditable', 'false');
		element.setAttribute('aria-label', this.getBlockLabel());
		if (this.__format) {
			element.style.textAlign = this.__format;
		}
		return element;
	}

	// biome-ignore lint/nursery/useThisInClassMethods: Lexical's node interface; a block's element never needs updating in place.
	updateDOM(_previous: unknown, _dom: HTMLElement): boolean {
		return false;
	}

	setFormat(format: ElementFormatType): this {
		const self = this.getWritable();
		self.__format = format;
		return self;
	}

	getFormat(): ElementFormatType {
		return this.getLatest().__format;
	}

	override exportJSON(): SerializedDecoratorBlockNode {
		return { ...super.exportJSON(), format: this.__format || '' };
	}

	override updateFromJSON(serialised: SerializedDecoratorBlockNode): this {
		return super.updateFromJSON(serialised).setFormat(serialised.format || '');
	}
}

export function $isDecoratorBlockNode(
	node: LexicalNode | null | undefined
): node is DecoratorBlockNode<unknown> {
	return node instanceof DecoratorBlockNode;
}
