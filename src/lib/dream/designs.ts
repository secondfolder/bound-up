/**
 * Blocks designed for one daydream (docs/dreams.md, "Designed blocks"). The
 * story model describes a kind of block no layout covers, once, with
 * `design="…"` and its content in named slots; a second call, with a
 * designer's prompt, draws it as a layout in this small language; the
 * design is kept with the daydream and offered back to the story model by
 * kind, so using it again is just its kind and slots.
 *
 * The layout language is a tree of a few known parts, checked here, never
 * HTML: nothing a model writes can run on the page, and every part is drawn
 * from the daydream's own theme. A design that fails the check is not kept,
 * and the block stays the generic card.
 *
 * Pure and alias-free.
 */

import { z } from 'zod';
import { findTags, type MarkupTag, plainText } from './markup';

export const TEXT_STYLES = [
	'title',
	'heading',
	'body',
	'label',
	'quiet',
	'stamp',
	'mono',
	'script'
] as const;
export const FRAMES = ['card', 'paper', 'ticket', 'screen', 'badge', 'plain'] as const;
const ALIGN = z.enum(['start', 'center', 'end']);

const NAME = /^[a-z][\w-]{0,39}$/;

/** Kinds with a layout of their own in the app (`DreamMarkup`), never designed. */
export const LAID_OUT_KINDS: ReadonlySet<string> = new Set([
	'contract',
	'rules',
	'report',
	'questionnaire',
	'punch-card',
	'schedule',
	'texts',
	'group-chat',
	'email',
	'voice-note',
	'call-response',
	'lines',
	'letter',
	'deck',
	'countdown'
]);

/** A slot's name: what the story model fills, and what the layout draws it in. */
const slotName = z.string().regex(NAME);

export type DesignNode =
	| { type: 'stack'; children: DesignNode[]; align?: 'start' | 'center' | 'end'; border?: boolean }
	| {
			type: 'row';
			children: DesignNode[];
			justify?: 'start' | 'center' | 'end' | 'between';
	  }
	| { type: 'grid'; columns: number; children: DesignNode[] }
	| {
			type: 'text';
			slot?: string;
			text?: string;
			style: (typeof TEXT_STYLES)[number];
			align?: 'start' | 'center' | 'end';
	  }
	| { type: 'pair'; label: string; slot: string }
	| { type: 'list'; slot: string; numbered?: boolean }
	| { type: 'boxes'; slot: string; columns?: number }
	| { type: 'meter'; slot: string; max?: number }
	| { type: 'divider' };

const nodeSchema: z.ZodType<DesignNode> = z.lazy(() =>
	z.discriminatedUnion('type', [
		z.object({
			type: z.literal('stack'),
			children: z.array(nodeSchema).max(12),
			align: ALIGN.optional(),
			border: z.boolean().optional()
		}),
		z.object({
			type: z.literal('row'),
			children: z.array(nodeSchema).max(8),
			justify: z.enum(['start', 'center', 'end', 'between']).optional()
		}),
		z.object({
			type: z.literal('grid'),
			columns: z.number().int().min(2).max(8),
			children: z.array(nodeSchema).max(24)
		}),
		z.object({
			type: z.literal('text'),
			slot: slotName.optional(),
			text: z.string().trim().max(200).optional(),
			style: z.enum(TEXT_STYLES).default('body'),
			align: ALIGN.optional()
		}),
		z.object({ type: z.literal('pair'), label: z.string().trim().min(1).max(60), slot: slotName }),
		z.object({ type: z.literal('list'), slot: slotName, numbered: z.boolean().optional() }),
		z.object({
			type: z.literal('boxes'),
			slot: slotName,
			columns: z.number().int().min(2).max(12).optional()
		}),
		z.object({
			type: z.literal('meter'),
			slot: slotName,
			max: z.number().positive().max(100_000).optional()
		}),
		z.object({ type: z.literal('divider') })
	])
) as z.ZodType<DesignNode>;

/** A designed kind of block, as kept with the daydream. */
export const blockDesignSchema = z.object({
	kind: z.string().regex(NAME),
	/** The story model's description, which it is shown again by. */
	description: z.string().trim().min(1).max(600),
	slots: z
		.array(z.object({ name: slotName, about: z.string().trim().max(200) }))
		.min(1)
		.max(16),
	frame: z.enum(FRAMES),
	layout: nodeSchema
});

export type BlockDesign = z.output<typeof blockDesignSchema>;

/** At most this many designs a daydream. */
export const MAX_DESIGNS = 12;
const MAX_NODES = 40;
const MAX_DEPTH = 5;

function measure(node: DesignNode, depth = 1): { nodes: number; depth: number } {
	if (!('children' in node)) {
		return { nodes: 1, depth };
	}
	return node.children.reduce(
		(total, child) => {
			const inner = measure(child, depth + 1);
			return { nodes: total.nodes + inner.nodes, depth: Math.max(total.depth, inner.depth) };
		},
		{ nodes: 1, depth }
	);
}

/** Every slot a layout draws. */
export function layoutSlots(node: DesignNode): string[] {
	if ('children' in node) {
		return node.children.flatMap(layoutSlots);
	}
	return 'slot' in node && node.slot ? [node.slot] : [];
}

const FENCE = /^```(?:json)?\s*|\s*```$/g;

/**
 * The designer's reply as a design, or null when it is not one: not JSON,
 * not the language, too big or too deep, or drawing a slot it was not given.
 */
export function parseDesign(text: string, request: DesignRequestShape): BlockDesign | null {
	let value: unknown;
	try {
		value = JSON.parse(text.trim().replace(FENCE, ''));
	} catch {
		return null;
	}
	const parsed = blockDesignSchema.safeParse({
		...(typeof value === 'object' && value !== null ? value : {}),
		kind: request.kind,
		description: request.description,
		slots: request.slots.map(({ name, example }) => ({ name, about: example.slice(0, 200) }))
	});
	if (!parsed.success) {
		return null;
	}
	const size = measure(parsed.data.layout);
	const known = new Set(request.slots.map((slot) => slot.name));
	if (
		size.nodes > MAX_NODES ||
		size.depth > MAX_DEPTH ||
		layoutSlots(parsed.data.layout).some((slot) => !known.has(slot))
	) {
		return null;
	}
	return parsed.data;
}

/** What the designer is asked for: a kind, its description, and its slots with what filled them. */
export type DesignRequestShape = {
	kind: string;
	description: string;
	slots: { name: string; example: string }[];
};

/** A block's slots, by name, as the passage filled them. */
export function slotsOf(tag: MarkupTag): Record<string, string> {
	const slots: Record<string, string> = {};
	for (const slot of findTags(tag.children, 'slot')) {
		const name = slot.attrs.name?.trim().toLowerCase();
		if (name && slotName.safeParse(name).success) {
			slots[name] = plainText(slot.children).trim();
		}
	}
	return slots;
}

/** A slot's words as a list's items: one a line, or split on semicolons. */
export function slotItems(text: string): string[] {
	const lines = text.includes('\n') ? text.split('\n') : text.split(';');
	return lines.map((line) => line.trim()).filter(Boolean);
}

const FILLED = /^(?:\[x\]|x\s|✓|✔|■)\s*/i;

/** A punch box from a list item: filled when it starts "x " or "[x]". */
export function boxOf(item: string): { filled: boolean; label: string } {
	return FILLED.test(item)
		? { filled: true, label: item.replace(FILLED, '') }
		: { filled: false, label: item };
}

/** A meter's value from a slot: "7", or "7/10" with its own top. */
export function meterOf(text: string, max = 100): { value: number; max: number } {
	const [raw = '', top] = text.split('/');
	const value = Number.parseFloat(raw);
	const ceiling = top === undefined ? max : Number.parseFloat(top) || max;
	return {
		value: Number.isFinite(value) ? Math.max(0, Math.min(value, ceiling)) : 0,
		max: ceiling
	};
}

/**
 * Blocks in a passage that ask to be designed: a kind no layout covers, not
 * designed yet, described with `design`, with slots to draw.
 */
export function designsWanted(
	tags: readonly MarkupTag[],
	known: ReadonlySet<string>
): DesignRequestShape[] {
	const wanted = new Map<string, DesignRequestShape>();
	for (const tag of tags) {
		const kind = tag.attrs.kind?.trim().toLowerCase() ?? '';
		const description = tag.attrs.design?.trim() ?? '';
		const slots = Object.entries(slotsOf(tag)).map(([name, example]) => ({ name, example }));
		if (
			!(kind && description) ||
			slots.length === 0 ||
			known.has(kind) ||
			wanted.has(kind) ||
			!NAME.test(kind)
		) {
			continue;
		}
		wanted.set(kind, { kind, description: description.slice(0, 600), slots: slots.slice(0, 16) });
	}
	return [...wanted.values()];
}
