import {
	$createLineBreakNode,
	$getState,
	$isElementNode,
	$setState,
	createState,
	type LexicalEditor,
	type LexicalNode,
	RootNode
} from 'lexical';
import { $isDecoratorBlockNode } from '$lib/lexical/nodes/decorator-block';

/**
 * Putting a block in the middle of a paragraph cuts the paragraph in two. This
 * is what puts it back together when the block goes.
 *
 * Inserting is Lexical's own `$insertNodeToNearestRootAtCaret`, which splits the
 * ancestor chain up to the root and drops the node between the halves — the
 * same call the Lexical playground's video block goes through, which is why
 * inserting one there splits a paragraph too. The playground stops at that:
 * delete its video and the paragraph stays in two.
 *
 * That is not good enough here. The cut is an artefact of the block, not
 * something the writer typed, and leaving it behind turns one paragraph into
 * two — the writer's line break silently becomes a paragraph break and the
 * message's spacing changes for good.
 *
 * So the far half is marked when the cut is made, and this transform reads the
 * mark back. It runs on the root, which Lexical applies **last** on any update
 * that dirtied anything — its own source calls that "a sort of update
 * finalizer" — which is what makes it cover every way a block can disappear:
 * the remove button, Backspace on a selected one, typing over a selection that
 * contains it, a paste, an undo.
 */

/** The state key, also written into the JSON by `document-shape.ts`. */
export const BLOCK_CONTINUATION_KEY = 'blockContinuation';

/**
 * "My content was the tail of the block this one was cut out of."
 *
 * Node state rather than a field on a node class: it never reaches storage —
 * the stored document keeps its embeds inline, so there is no boundary to
 * remember — which makes this editor-only bookkeeping, like the editor-only
 * node subclasses beside it.
 */
const continuationState = createState(BLOCK_CONTINUATION_KEY, {
	parse: (value: unknown) => value === true
});

/** Mark `block` as the tail of a block a decorator was cut out of. */
export function $markBlockContinuation(block: LexicalNode): void {
	$setState(block, continuationState, true);
}

/** Whether `block` is one. */
export function $isBlockContinuation(block: LexicalNode): boolean {
	return $getState(block, continuationState) === true;
}

/** Wire the mending up to an editor. One registration, in `createRichTextEditor`. */
export function registerMendSplitBlocks(editor: LexicalEditor): () => void {
	return editor.registerNodeTransform(RootNode, $mendSplitBlocks);
}

function $mendSplitBlocks(root: RootNode): void {
	for (const block of root.getChildren()) {
		if (!($isElementNode(block) && $isBlockContinuation(block))) {
			continue;
		}
		const previous = block.getPreviousSibling();
		if ($isDecoratorBlockNode(previous)) {
			// Still held apart by the block that cut it.
			continue;
		}
		$setState(block, continuationState, false);
		if (!$isElementNode(previous)) {
			continue;
		}
		// The line break the paragraph boundary stood in for. It was taken out
		// when the cut was made, because a block ending in one gets a managed
		// `<br>` from Lexical and so an extra row; joining is where it goes back.
		const children = block.getChildren();
		if (children.length === 0) {
			// Nothing to carry over, so the caret has nowhere to follow to: put it
			// where the join happened rather than letting it land at the document
			// start, which is where a removed selection otherwise goes.
			previous.append($createLineBreakNode());
			previous.selectEnd();
		} else {
			previous.append($createLineBreakNode(), ...children);
		}
		block.remove();
	}
}
