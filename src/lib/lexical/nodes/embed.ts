import {
	$applyNodeReplacement,
	type ElementFormatType,
	type LexicalNode,
	type NodeKey,
	type Spread
} from 'lexical';
import {
	DecoratorBlockNode,
	type SerializedDecoratorBlockNode
} from '$lib/lexical/nodes/decorator-block';

export type SerializedEmbedNode = Spread<{ url: string }, SerializedDecoratorBlockNode>;

/**
 * A preview for one URL: a block in the editor, drawn by `ComposerEmbed`.
 *
 * Its own node rather than a flag on the link that produced it, and that is the
 * whole design: because it is a real node, a writer who does not want the embed
 * removes it, and there is no opt-out flag to store anywhere. The card carries
 * an explicit remove button, because a block that appeared on its own needs a
 * visible way out; selecting it and pressing backspace works too.
 *
 * Built the way the Lexical playground builds its video block — a subclass of
 * `DecoratorBlockNode` holding one value and returning it from `decorate()` —
 * so that every caret behaviour comes from Lexical rather than from us. See the
 * note on `DecoratorBlockNode`.
 *
 * **Stored, the same embed is an inline node**, at the head of the line its URL
 * is on: a paragraph's line breaks are `linebreak` nodes, so that is the only
 * shape that can say which line a preview belongs above. `document-shape.ts`
 * is the bridge between the two, and `docs/rich-text.md` explains why they
 * differ.
 */
export class EmbedNode extends DecoratorBlockNode<string> {
	__url: string;

	static getType(): string {
		return 'embed';
	}

	static clone(node: EmbedNode): EmbedNode {
		return new EmbedNode(node.__url, node.__format, node.__key);
	}

	static importJSON(serialised: SerializedEmbedNode): EmbedNode {
		return $createEmbedNode(serialised.url).updateFromJSON(serialised);
	}

	constructor(url: string, format?: ElementFormatType, key?: NodeKey) {
		super(format, key);
		this.__url = url;
	}

	getUrl(): string {
		return this.__url;
	}

	override getBlockClass(): string {
		return 'embed-block';
	}

	override getBlockLabel(): string {
		return `Embedded preview of ${this.__url}`;
	}

	override updateDOM(previous: EmbedNode): boolean {
		// The label carries the URL, so a new URL needs a new element.
		return previous.__url !== this.__url;
	}

	/**
	 * The URL, which is all the composer needs to draw the embed.
	 *
	 * Lexical has no renderer of its own: it collects whatever `decorate()`
	 * returns into a record keyed by node, hands that to every decorator
	 * listener after each commit, and leaves the mounting to the host framework.
	 * `RichTextEditor.svelte` is that host — see the note there.
	 */
	decorate(): string {
		return this.__url;
	}

	override exportJSON(): SerializedEmbedNode {
		return { ...super.exportJSON(), url: this.__url };
	}
}

export function $createEmbedNode(url: string): EmbedNode {
	return $applyNodeReplacement(new EmbedNode(url));
}

export function $isEmbedNode(node: LexicalNode | null | undefined): node is EmbedNode {
	return node instanceof EmbedNode;
}
