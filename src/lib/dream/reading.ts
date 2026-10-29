/**
 * Step 1's reply, reading the brief: its musts, research, spread, the
 * directions, who picks, and at most one question (docs/dreams.md, "Reading
 * the brief").
 *
 * Read leniently, like every reply: a missing part gets its default, and
 * nothing here throws.
 *
 * Pure and alias-free.
 */

import { findTag, findTags, type MarkupNode, parseMarkup, plainText, tagText } from './markup';

export type Direction = { id: string; p: number; text: string };

export type Question = { id: string; text: string; options: string[]; keep: 'story' | 'general' };

export type BriefReading = {
	musts: string[];
	research: { needed: boolean; text: string };
	spread: { n: number; reason: string };
	directions: Direction[];
	pick: { by: 'code' | 'user'; reason: string };
	ask: Question | null;
	/** Present when step 1 and the build were one call (a spread of 1). */
	rest: MarkupNode[];
};

export const MAX_DIRECTIONS = 8;
const LIST_ITEM = /^\s*[-*•]\s*/;

function listItems(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.replace(LIST_ITEM, '').trim())
		.filter(Boolean);
}

function readDirections(nodes: readonly MarkupNode[]): Direction[] {
	return findTags(nodes, 'direction')
		.map((tag, index) => {
			const p = Number.parseFloat(tag.attrs.p ?? '');
			return {
				id: `d${index + 1}`,
				p: Number.isFinite(p) && p > 0 ? Math.min(p, 1) : 0.1,
				text: plainText(tag.children).trim()
			};
		})
		.filter((direction) => direction.text)
		.slice(0, MAX_DIRECTIONS);
}

function readSpread(nodes: readonly MarkupNode[], directions: number): BriefReading['spread'] {
	const tag = findTag(nodes, 'spread');
	const n = Number.parseInt(tag?.attrs.n ?? '', 10);
	// A missing spread is read from what the model actually wrote.
	const value = Number.isFinite(n)
		? Math.min(MAX_DIRECTIONS, Math.max(1, n))
		: Math.max(1, directions);
	return { n: value, reason: tag ? plainText(tag.children).trim() : '' };
}

function readAsk(nodes: readonly MarkupNode[]): Question | null {
	const tag = findTag(nodes, 'ask');
	if (!tag) {
		return null;
	}
	const options = findTags(tag.children, 'option')
		.map((option) => plainText(option.children).trim())
		.filter(Boolean);
	const text = plainText(tag.children.filter((child) => child.type !== 'tag')).trim();
	if (!(text && options.length > 0)) {
		return null;
	}
	return {
		id: tag.attrs.id?.trim() || 'q1',
		text,
		options,
		keep: tag.attrs.keep === 'general' ? 'general' : 'story'
	};
}

export function parseBriefReading(text: string): BriefReading {
	const nodes = parseMarkup(text, { final: true });
	const researchTag = findTag(nodes, 'research');
	const directions = readDirections(nodes);
	const pickTag = findTag(nodes, 'pick');
	return {
		musts: listItems(tagText(nodes, 'musts')),
		research: {
			needed: researchTag?.attrs.needed === 'yes',
			text: researchTag ? plainText(researchTag.children).trim() : ''
		},
		spread: readSpread(nodes, directions.length),
		directions,
		// No tag, or anything but "user", means code picks (docs/dreams.md, "Picking").
		pick: {
			by: pickTag?.attrs.by === 'user' ? 'user' : 'code',
			reason: pickTag ? plainText(pickTag.children).trim() : ''
		},
		ask: readAsk(nodes),
		rest: nodes
	};
}
