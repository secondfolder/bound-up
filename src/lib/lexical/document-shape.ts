import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';
import { BLOCK_CONTINUATION_KEY } from '$lib/lexical/transformers/mend-split-blocks';
import type { RichTextDocument, RichTextInlineNode } from '$lib/richtext';

/**
 * The editor's document shape, which is not the stored one.
 *
 * Stored, an embed is **inline**: a node among the text of the paragraph, at
 * the head of the line its URL is on. That is what the reader walks, and it is
 * the only shape that can express "above this line" when a paragraph's lines
 * are `linebreak` nodes — see `docs/rich-text.md`.
 *
 * In the editor an embed is a **block at the root**, because that is the only
 * shape Lexical's own decorator handling reaches: the arrow keys, the line
 * moves and the block cursor all test `!isInline()` and then look for the node
 * as a sibling of a top-level block. Getting that for free is worth a shape of
 * our own; writing it by hand cost several hundred lines and three rounds of
 * caret bugs.
 *
 * So the two shapes differ, and these two functions are the bridge — the same
 * arrangement the editor-only node subclasses use, one level up: `toEditor` on
 * the way in, `toStored` on the way out, and nothing in between ever sees the
 * other side's shape.
 */

/** A paragraph that was cut off a block when a decorator block was hoisted out of it. */
type ContinuationMark = { [BLOCK_CONTINUATION_KEY]?: boolean };

type EditorNode = SerializedLexicalNode & {
	children?: EditorNode[];
	url?: string;
	// biome-ignore lint/style/useNamingConvention: Lexical's own key for node state in serialised JSON.
	$?: ContinuationMark;
};

/**
 * Stored → editor: lift every inline embed out to the root, cutting its
 * paragraph in two around it.
 *
 * The far half is marked, so that removing the embed later joins the halves
 * back up (`registerMendSplitBlocks`) and so that `toStored` knows which boundaries
 * are ours to undo. A paragraph that opens with an embed produces no empty half
 * in front of it — an empty paragraph is a blank line on screen, and the writer
 * did not type one.
 */
export function toEditorDocument(doc: RichTextDocument): RichTextDocument {
	if (!doc.root.children.some((block) => hasInlineEmbed(block))) {
		return doc;
	}

	const blocks: unknown[] = [];
	for (const block of doc.root.children) {
		if (block.type !== 'paragraph' || !hasInlineEmbed(block)) {
			blocks.push(block);
			continue;
		}

		let head: RichTextInlineNode[] = [];
		// Whether a half of this block has been emitted yet: only then is the
		// next one a continuation of something. A paragraph that opens with an
		// embed has no half in front of it, and marking its tail would join it
		// to the block above — which belongs to somebody else.
		let cut = false;
		for (const child of block.children) {
			if (child.type !== 'embed') {
				head.push(child);
				continue;
			}
			if (head.length > 0) {
				blocks.push(paragraph(withoutLineEnd(head), cut));
				cut = true;
				head = [];
			}
			blocks.push({ type: 'embed', url: child.url });
		}
		if (head.length > 0) {
			blocks.push(paragraph(withoutLineEnd(head), cut));
		}
	}
	return { root: { type: 'root', children: blocks } } as RichTextDocument;
}

/**
 * Editor → stored: put every root-level embed back inside the paragraph it was
 * cut out of, and join the halves.
 *
 * An embed whose paragraph is gone — the writer deleted the line it belonged to
 * — stays a root-level block. That is the shape older documents are stored in
 * anyway, and `parseStoredRichText` knows what to do with it.
 */
export function toStoredDocument(state: SerializedEditorState): SerializedEditorState {
	const root = state.root as unknown as EditorNode;
	const children = root.children ?? [];
	if (!children.some((block) => block.type === 'embed')) {
		return state;
	}

	const out: EditorNode[] = [];
	let held: EditorNode[] = [];
	for (const block of children) {
		if (block.type === 'embed') {
			held.push(block);
			continue;
		}
		if (block.type === 'paragraph') {
			// The embeds above this paragraph belong inside it, at the head of the
			// line they were cut from. A marked paragraph is also the tail of the
			// block above, so the two halves become one again.
			const previous = out.at(-1);
			const joinsPrevious =
				block.$?.[BLOCK_CONTINUATION_KEY] === true && previous?.type === 'paragraph';
			const head = joinsPrevious ? (out.pop() as EditorNode) : undefined;
			out.push({
				...(head ?? block),
				// biome-ignore lint/style/useNamingConvention: Lexical's node-state key.
				$: undefined,
				children: [
					...(head?.children ?? []),
					// The line break the paragraph boundary stood in for while this was
					// two blocks — see `withoutLineEnd`.
					...(head ? [{ type: 'linebreak' } as EditorNode] : []),
					...held,
					...(block.children ?? [])
				]
			});
			held = [];
			continue;
		}
		out.push(...held);
		held = [];
		out.push(block);
	}
	out.push(...held);

	return {
		...state,
		root: { ...root, children: out } as unknown as SerializedEditorState['root']
	};
}

/**
 * The head of a cut block, without the line break that ended its last line.
 *
 * That break separated the line the embed was cut from; in the editor the
 * paragraph boundary separates them instead, so keeping both draws a row
 * nobody typed. Lexical is doing the right thing by that row — a block whose
 * last child is a `linebreak` gets a managed `<br>` after it, which is what
 * makes a trailing Shift+Enter visible and gives it a caret — so the fix is to
 * stop handing it a trailing break that is not one.
 *
 * Exactly one, and `toStoredDocument` puts exactly one back.
 */
function withoutLineEnd(children: RichTextInlineNode[]): RichTextInlineNode[] {
	return children.at(-1)?.type === 'linebreak' ? children.slice(0, -1) : children;
}

function hasInlineEmbed(block: RichTextDocument['root']['children'][number]): boolean {
	return block.type === 'paragraph' && block.children.some((child) => child.type === 'embed');
}

function paragraph(children: RichTextInlineNode[], continues: boolean) {
	return {
		type: 'paragraph',
		children,
		// biome-ignore lint/style/useNamingConvention: Lexical's node-state key.
		...(continues ? { $: { [BLOCK_CONTINUATION_KEY]: true } } : {})
	};
}
