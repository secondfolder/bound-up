/**
 * A passage split into beats, for the tap-through view (docs/dreams.md,
 * "Views"): one beat per tap. Beats come from `<beat/>` and from paragraph
 * breaks, so the markup works in any view. Only the top level is split: a
 * block or a spoiler stays whole inside its beat. The footer is no beat.
 *
 * Pure and alias-free.
 */

import type { MarkupNode } from './markup';

const PARAGRAPH = /\n\s*\n/;

export function splitBeats(nodes: readonly MarkupNode[]): MarkupNode[][] {
	const beats: MarkupNode[][] = [];
	let current: MarkupNode[] = [];
	const close = () => {
		const hasWords = current.some((node) => node.type !== 'text' || node.text.trim() !== '');
		if (hasWords) {
			beats.push(current);
		}
		current = [];
	};
	for (const node of nodes) {
		if (node.type === 'tag' && node.name === 'after') {
			continue;
		}
		if (node.type === 'tag' && node.name === 'beat') {
			close();
			continue;
		}
		if (node.type !== 'text') {
			current.push(node);
			continue;
		}
		const [first = '', ...rest] = node.text.split(PARAGRAPH);
		current.push({ type: 'text', text: first });
		for (const paragraph of rest) {
			close();
			current.push({ type: 'text', text: paragraph });
		}
	}
	close();
	return beats;
}

/**
 * Tags drawn as blocks of their own, whose edges are already a break, and
 * tags never drawn in the passage at all (how the turn was read, the
 * footer), whose line breaks would otherwise be a blank line.
 */
const BLOCK_TAGS = new Set([
	'beat',
	'block',
	'texts',
	'letter',
	'roll',
	'ask',
	'picture',
	'reading',
	'yours',
	'after'
]);
const EDGE_START = /^\s*\n/;
const EDGE_END = /\n\s*$/;
const BLANK_LINES = /\n\s*\n\s*/g;
const LEADING = /^\s+/;
const TRAILING = /\s+$/;

function isBlock(node: MarkupNode | undefined): boolean {
	return node?.type === 'tag' && BLOCK_TAGS.has(node.name);
}

/**
 * A passage's breaks made even, for drawing (docs/dreams.md, "Reading a
 * passage"). A model writes `\n\n<beat/>\n\n` between paragraphs, which
 * drawn as it stands was a blank line, the beat's space and another blank
 * line: three times the space of a plain paragraph break. So any run of blank
 * lines becomes exactly one paragraph break, and the line breaks beside a
 * block or a beat go, since its edge is the break. Inside tags too.
 */
export function tidyBreaks(nodes: readonly MarkupNode[], root = true): MarkupNode[] {
	const tidied: MarkupNode[] = [];
	for (const [index, node] of nodes.entries()) {
		if (node.type === 'tag') {
			tidied.push({ ...node, children: tidyBreaks(node.children, false) });
			continue;
		}
		if (node.type !== 'text') {
			tidied.push(node);
			continue;
		}
		let text = node.text.replace(BLANK_LINES, '\n\n');
		const first = index === 0;
		const last = index === nodes.length - 1;
		if ((root && first) || isBlock(nodes[index - 1])) {
			text = EDGE_START.test(text) ? text.replace(LEADING, '') : text;
		}
		if ((root && last) || isBlock(nodes[index + 1])) {
			text = EDGE_END.test(text) ? text.replace(TRAILING, '') : text;
		}
		if (text) {
			tidied.push({ type: 'text', text });
		}
	}
	return tidied;
}
