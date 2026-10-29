/**
 * The interactive parts of a passage (docs/dreams.md, "Fields"): its
 * cycling choices and the blocks with fields, each with a stable key so what
 * the user entered can be kept in a draft and sent as their turn.
 *
 * Pure and alias-free.
 */

import { findTags, type MarkupNode, type MarkupTag, plainText } from './markup';
import type { TurnChoice, TurnField } from './story';

export const FIELD_TYPES = [
	'initial',
	'check',
	'choice',
	'text',
	'sign',
	'say',
	'tap-count'
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type PassageField = {
	tag: MarkupTag;
	name: string;
	type: FieldType;
	/** What the field is about, for its control's accessible name. */
	label: string;
	options: string[];
	/** For a tap-count: how many taps it asks for. */
	target: number;
};

export type PassageBlock = {
	tag: MarkupTag;
	key: string;
	kind: string;
	title: string;
	fields: PassageField[];
};

export type PassageCycle = { tag: MarkupTag; id: string; label: string; options: string[] };

const NOT_SLUG = /[^\w-]+/g;
const OPTION_SEPARATOR = /\s*\|\s*/;

function slug(text: string, fallback: string): string {
	const value = text.toLowerCase().replace(NOT_SLUG, '-').slice(0, 40);
	return value.replace(/^-+|-+$/g, '') || fallback;
}

function isFieldType(value: string | undefined): value is FieldType {
	return (FIELD_TYPES as readonly string[]).includes(value ?? '');
}

/** A block's kind: `<texts>` and `<letter>` are short for `<block kind="…">`. */
export function blockKind(tag: MarkupTag): string {
	return tag.name === 'block' ? (tag.attrs.kind?.trim().toLowerCase() ?? 'block') : tag.name;
}

const BLOCK_TAGS = ['block', 'texts', 'letter'];

function readField(tag: MarkupTag, index: number): PassageField {
	const options = findTags(tag.children, 'option')
		.map((option) => plainText(option.children).trim())
		.filter(Boolean);
	const words = plainText(
		tag.children.filter((child) => !(child.type === 'tag' && child.name === 'option'))
	).trim();
	const target = Number.parseInt(tag.attrs.target ?? '', 10);
	return {
		tag,
		name: slug(tag.attrs.id ?? '', `f${index + 1}`),
		type: isFieldType(tag.attrs.type) ? tag.attrs.type : 'text',
		label: tag.attrs.label?.trim() || words || `Field ${index + 1}`,
		options,
		target: Number.isFinite(target) && target > 0 ? Math.min(target, 500) : 10
	};
}

/** Every block in a passage, in order, with its fields. */
export function passageBlocks(nodes: readonly MarkupNode[]): PassageBlock[] {
	const blocks = BLOCK_TAGS.flatMap((name) => findTags(nodes, name));
	// Back into document order: `findTags` was asked once per name.
	const order = documentOrder(nodes);
	blocks.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
	const used = new Set<string>();
	return blocks.map((tag, index) => {
		const kind = blockKind(tag);
		let key = slug(tag.attrs.id ?? '', `${slug(kind, 'block')}-${index + 1}`);
		if (used.has(key)) {
			key = `${key}-${index + 1}`;
		}
		used.add(key);
		return {
			tag,
			key,
			kind,
			title: tag.attrs.title?.trim() ?? '',
			fields: findTags(tag.children, 'field').map(readField)
		};
	});
}

function documentOrder(nodes: readonly MarkupNode[]): Map<MarkupTag, number> {
	const order = new Map<MarkupTag, number>();
	const walk = (list: readonly MarkupNode[]) => {
		for (const node of list) {
			if (node.type === 'tag') {
				order.set(node, order.size);
				walk(node.children);
			}
		}
	};
	walk(nodes);
	return order;
}

/** Every cycling choice in a passage, with its options. */
export function passageCycles(nodes: readonly MarkupNode[]): PassageCycle[] {
	return findTags(nodes, 'cycle').map((tag, index) => ({
		tag,
		id: slug(tag.attrs.id ?? '', `choice-${index + 1}`),
		label: tag.attrs.label?.trim() || tag.attrs.id?.trim() || 'this',
		options: plainText(tag.children).split(OPTION_SEPARATOR).filter(Boolean)
	}));
}

/** The key a field's value is kept under. */
export function fieldKey(block: string, name: string): string {
	return `${block}/${name}`;
}

/**
 * What the user set and entered in a passage, as their turn carries it: a
 * choice only where it was changed from the first option, and every field of
 * every block with fields, an untouched one as skipped (an empty value).
 */
export function turnInputs(
	nodes: readonly MarkupNode[],
	choices: Readonly<Record<string, string>>,
	values: Readonly<Record<string, string>>
): { cycles: TurnChoice[]; fields: TurnField[] } {
	const cycles = passageCycles(nodes)
		.filter((cycle) => choices[cycle.id] !== undefined && choices[cycle.id] !== cycle.options[0])
		.map((cycle) => ({ id: cycle.id, value: choices[cycle.id] ?? '' }));
	const fields = passageBlocks(nodes).flatMap((block) =>
		block.fields.map((field) => ({
			block: block.key,
			name: field.name,
			value: (values[fieldKey(block.key, field.name)] ?? '').slice(0, 1000)
		}))
	);
	return { cycles, fields };
}

export type PassageAsk = {
	tag: MarkupTag;
	id: string;
	text: string;
	options: string[];
	/** The element asking, in character; null when asked plainly. */
	as: string | null;
};

/**
 * The passage's question, if it asked one. At most one counts: any after the
 * first are dropped (docs/dreams.md, "Questions").
 */
export function passageAsk(nodes: readonly MarkupNode[]): PassageAsk | null {
	const [tag] = findTags(nodes, 'ask');
	if (!tag) {
		return null;
	}
	const options = findTags(tag.children, 'option')
		.map((option) => plainText(option.children).trim())
		.filter(Boolean);
	const text = plainText(
		tag.children.filter((child) => !(child.type === 'tag' && child.name === 'option'))
	).trim();
	return text
		? {
				tag,
				id: slug(tag.attrs.id ?? '', 'question'),
				text,
				options,
				as: tag.attrs.as?.trim() || null
			}
		: null;
}
