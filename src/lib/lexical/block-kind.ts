import {
	$createHeadingNode as createHeadingNode,
	type HeadingNode,
	$isHeadingNode as isHeadingNode
} from '@lexical/rich-text';
import {
	$createParagraphNode as createParagraphNode,
	type ElementNode,
	$getSelection as getSelection,
	$isParagraphNode as isParagraphNode,
	$isRangeSelection as isRangeSelection,
	type LexicalNode,
	type ParagraphNode
} from 'lexical';
import {
	$isMenuLineNode as isMenuLineNode,
	type MenuLineNode
} from '$lib/lexical/nodes/scene/menu-line';

/**
 * What kind of line a block is: a heading, a subheading or body text. The
 * one place that knows what each means in each kind of block, so the
 * selection toolbar has one control for all of them:
 *
 * - an ordinary line is a paragraph, or a Lexical `HeadingNode` with the tag
 *   `h2` (heading) or `h3` (subheading);
 * - a line of a scene's menu keeps its node and changes its role, since a
 *   menu's headings are what divide it into courses (docs/scenes.md).
 *
 * BROWSER ONLY: it drives a Lexical editor. See docs/rich-text.md, "Headings".
 */

export type BlockKind = 'heading' | 'subheading' | 'body';

/** The heading tag each kind is stored as. A page's title is its h1. */
export const HEADING_TAGS = { heading: 'h2', subheading: 'h3' } as const;

type KindedBlock = ParagraphNode | HeadingNode | MenuLineNode;

function isKindedBlock(node: LexicalNode | null): node is KindedBlock {
	return isParagraphNode(node) || isHeadingNode(node) || isMenuLineNode(node);
}

export function $blockKindOf(block: KindedBlock): BlockKind {
	if (isHeadingNode(block)) {
		return block.getTag() === 'h2' ? 'heading' : 'subheading';
	}
	if (isMenuLineNode(block)) {
		const role = block.getRole();
		return role === 'item' ? 'body' : role;
	}
	return 'body';
}

/** The nearest line a node is in, or is: a paragraph, a heading or a menu line. */
function blockOf(node: LexicalNode): KindedBlock | null {
	let current: LexicalNode | null = node;
	while (current) {
		if (isKindedBlock(current)) {
			return current;
		}
		current = current.getParent();
	}
	return null;
}

/** Every line the selection touches, each once, in order. */
function $selectedBlocks(): KindedBlock[] {
	const selection = getSelection();
	if (!isRangeSelection(selection)) {
		return [];
	}
	const blocks: KindedBlock[] = [];
	for (const node of [selection.anchor.getNode(), ...selection.getNodes()]) {
		const block = blockOf(node);
		if (block && !blocks.some((seen) => seen.is(block))) {
			blocks.push(block);
		}
	}
	return blocks;
}

/** The kind every selected line is, or null when they differ or there are none. */
export function $selectionBlockKind(): BlockKind | null {
	const kinds = new Set($selectedBlocks().map($blockKindOf));
	return kinds.size === 1 ? ([...kinds][0] ?? null) : null;
}

/**
 * Makes every selected line a heading, a subheading or body text, keeping
 * its words, formatting and links. A list is left as it is: a bullet point
 * is not a heading.
 */
export function $setBlockKind(kind: BlockKind): void {
	for (const block of $selectedBlocks()) {
		if ($blockKindOf(block) === kind) {
			continue;
		}
		if (isMenuLineNode(block)) {
			block.setRole(kind === 'body' ? 'item' : kind);
			continue;
		}
		const next: ElementNode =
			kind === 'body' ? createParagraphNode() : createHeadingNode(HEADING_TAGS[kind]);
		// With its children, so the selection inside it stays where it was.
		block.replace(next, true);
	}
}
