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
