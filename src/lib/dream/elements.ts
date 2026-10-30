/**
 * Elements: anything a daydream keeps a record of (characters, places, a
 * contract, a playlist), with a free-form type and free-form fields. See
 * docs/dreams.md, "Elements".
 *
 * The model writes them as tags and reads them back as tags; the app stores
 * them as `DreamElement` JSON. `parseElements` and `serializeElements` are the
 * two directions, so whatever the model wrote reads back the same way.
 *
 * Pure and alias-free.
 */

import { escapeMarkup, type MarkupNode, type MarkupTag, plainText } from './markup';

export type StatKind = 'meter' | 'count' | 'list' | 'line';

export type ElementStat = {
	name: string;
	kind: StatKind;
	value: number | string | string[];
	/** Meters only: 100 unless the model says otherwise. */
	max?: number;
	/** What moves it, for the model. */
	description: string;
};

export type ElementField = {
	/** The tag the model used: `appearance`, `unspoken`, anything. */
	name: string;
	text: string;
	/** False for `shown="no"`: off the cards, under "Behind the scenes". */
	shown: boolean;
};

export type DreamElement = {
	id: string;
	/** The tag the model used: `character`, `place`, `contract`, anything. */
	type: string;
	name: string;
	/**
	 * What to call it on screen when its name is long ("Ines" for "Ines
	 * Varga, Head of Intake"): asked of the model for any long name. Read
	 * through `elementLabel`.
	 */
	short?: string;
	/** Other names and nicknames, so code can link them in passages. */
	also: string[];
	shown: boolean;
	/** The description the name was drawn for, so "Another name" can draw again. */
	nameFrom?: string;
	fields: ElementField[];
	stats: ElementStat[];
};

/** At most this many elements per daydream; any more are dropped. */
export const MAX_ELEMENTS = 12;
/** At most this much text per element; fields past it are dropped whole, never cut. */
export const MAX_ELEMENT_CHARS = 1200;
const MAX_LIST_ITEMS = 20;

/** Types and fields the app does something with (docs/dreams.md, "Known types"). */
export const KNOWN_FIELDS: Readonly<Record<string, readonly string[]>> = {
	character: ['appearance', 'manner', 'voice', 'background', 'with-you', 'knows'],
	you: ['name', 'pronouns', 'role'],
	place: ['appearance', 'feel'],
	thing: ['appearance', 'significance']
};

const SLUG_CHARS = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-+|-+$/g;
const LIST_SEPARATOR = /\s*;\s*/;
const ALSO_SEPARATOR = /\s*,\s*/;

function slug(text: string): string {
	return text.toLowerCase().replace(SLUG_CHARS, '-').replace(EDGE_DASHES, '').slice(0, 40);
}

function statKind(value: string | undefined): StatKind {
	return value === 'meter' || value === 'count' || value === 'list' ? value : 'line';
}

function readStat(tag: MarkupTag): ElementStat | null {
	const name = tag.attrs.name?.trim();
	if (!name) {
		return null;
	}
	const kind = statKind(tag.attrs.kind);
	const raw = tag.attrs.value ?? '';
	const description = plainText(tag.children).trim();
	if (kind === 'meter' || kind === 'count') {
		const parsed = Number.parseFloat(raw);
		const max = kind === 'meter' ? Number.parseFloat(tag.attrs.max ?? '100') || 100 : undefined;
		const value = Number.isFinite(parsed) ? parsed : 0;
		return {
			name,
			kind,
			value: max === undefined ? value : Math.min(max, Math.max(0, value)),
			max,
			description
		};
	}
	if (kind === 'list') {
		const items = raw.split(LIST_SEPARATOR).filter(Boolean).slice(0, MAX_LIST_ITEMS);
		return { name, kind, value: items, description };
	}
	return { name, kind, value: raw, description };
}

const ORDINALS = [
	'First',
	'Second',
	'Third',
	'Fourth',
	'Fifth',
	'Sixth',
	'Seventh',
	'Eighth',
	'Ninth',
	'Tenth',
	'Eleventh',
	'Twelfth'
];
const DASHES = /[-_]+/g;
const CLAUSE_END = /[.;:!?\n]/;
const TRAILING_PUNCTUATION = /[\s,–—-]+$/;
const WORDS = /\s+/;
/** Words from a description an unnamed element is labelled with. */
const LABEL_WORDS = 6;
const MAX_SHORT = 40;

/** A type as words: `voice-note` is "Voice note". */
function typeLabel(type: string): string {
	const words = type.replace(DASHES, ' ').trim();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The start of a description, its first clause and a few words at most. */
function opening(text: string): string {
	const clause = text.split(CLAUSE_END)[0]?.trim() ?? '';
	const words = clause.split(WORDS).filter(Boolean);
	const start = words.slice(0, LABEL_WORDS).join(' ').replace(TRAILING_PUNCTUATION, '');
	return words.length > LABEL_WORDS ? `${start}…` : start;
}

/**
 * A name for an element the model left unnamed, so there is always
 * something to call it on screen: its type and the start of what describes
 * it ("Pressure: the deadline on Friday"), or with nothing to go on, which
 * of its type it is ("Second Pressure"; just the type when it is the only
 * one). A `<you>` is "You".
 */
function fallbackName(element: DreamElement, nth: number, ofType: number): string {
	if (element.type === 'you') {
		return 'You';
	}
	const described = element.fields.find((field) => field.shown && field.text.trim());
	const start = described ? opening(described.text) : '';
	if (start) {
		return `${typeLabel(element.type)}: ${start}`;
	}
	const ordinal = ORDINALS[nth - 1];
	if (ofType > 1 && ordinal) {
		const titled = element.type
			.replace(DASHES, ' ')
			.trim()
			.split(' ')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
		return `${ordinal} ${titled}`;
	}
	return typeLabel(element.type);
}

/** What to call an element on screen: its short name, or its name. */
export function elementLabel(element: Pick<DreamElement, 'name' | 'short'>): string {
	return element.short ?? element.name;
}

function readElement(tag: MarkupTag, index: number, nth: number, ofType: number): DreamElement {
	const given = tag.attrs.name?.trim() ?? '';
	const element: DreamElement = {
		id: tag.attrs.id?.trim() ?? '',
		type: tag.name,
		name: given,
		also: (tag.attrs.also ?? '').split(ALSO_SEPARATOR).filter(Boolean),
		shown: tag.attrs.shown !== 'no',
		fields: [],
		stats: []
	};
	const nameFrom = tag.attrs['name-from']?.trim();
	if (nameFrom) {
		element.nameFrom = nameFrom;
	}
	let budget = MAX_ELEMENT_CHARS;
	let loose = '';
	for (const child of tag.children) {
		if (child.type !== 'tag') {
			loose += child.text;
			continue;
		}
		if (child.name === 'stat') {
			const stat = readStat(child);
			if (stat) {
				element.stats.push(stat);
			}
			continue;
		}
		const text = plainText(child.children).trim();
		if (!text || text.length > budget) {
			continue;
		}
		budget -= text.length;
		element.fields.push({ name: child.name, text, shown: child.attrs.shown !== 'no' });
	}
	// An element written as plain prose, like a <pressure>, keeps it as one field.
	const description = loose.trim();
	if (description && description.length <= budget) {
		element.fields.unshift({ name: 'description', text: description, shown: true });
	}
	element.name = (given || fallbackName(element, nth, ofType)).slice(0, 80);
	element.id ||= slug(element.name) || `${tag.name}-${index + 1}`;
	const short = tag.attrs.short?.trim();
	if (short && short !== element.name) {
		element.short = short.slice(0, MAX_SHORT);
	}
	return element;
}

/** Reads the children of an `<elements>` tag. Past `MAX_ELEMENTS`, the rest are dropped. */
export function parseElements(nodes: readonly MarkupNode[]): DreamElement[] {
	const elements: DreamElement[] = [];
	const ids = new Set<string>();
	const tags = nodes
		.filter((node): node is MarkupTag => node.type === 'tag')
		.slice(0, MAX_ELEMENTS);
	const ofType = (type: string) => tags.filter((tag) => tag.name === type).length;
	const seen = new Map<string, number>();
	for (const node of tags) {
		const nth = (seen.get(node.name) ?? 0) + 1;
		seen.set(node.name, nth);
		const element = readElement(node, elements.length, nth, ofType(node.name));
		// Two elements with one id would make every reference to it ambiguous.
		while (ids.has(element.id)) {
			element.id = `${element.id}-${elements.length + 1}`;
		}
		ids.add(element.id);
		elements.push(element);
	}
	return elements;
}

function attribute(name: string, value: string): string {
	return ` ${name}="${escapeMarkup(value)}"`;
}

function statValue(stat: ElementStat): string {
	return Array.isArray(stat.value) ? stat.value.join('; ') : String(stat.value);
}

function serializeElement(element: DreamElement): string {
	let open = `<${element.type}${attribute('id', element.id)}${attribute('name', element.name)}`;
	if (element.short) {
		open += attribute('short', element.short);
	}
	if (element.also.length > 0) {
		open += attribute('also', element.also.join(', '));
	}
	if (element.nameFrom) {
		open += attribute('name-from', element.nameFrom);
	}
	if (!element.shown) {
		open += attribute('shown', 'no');
	}
	const lines = [`${open}>`];
	for (const field of element.fields) {
		const shown = field.shown ? '' : attribute('shown', 'no');
		lines.push(`  <${field.name}${shown}>${escapeMarkup(field.text)}</${field.name}>`);
	}
	for (const stat of element.stats) {
		const max = stat.max === undefined ? '' : attribute('max', String(stat.max));
		lines.push(
			`  <stat${attribute('name', stat.name)}${attribute('kind', stat.kind)}${attribute('value', statValue(stat))}${max}>${escapeMarkup(stat.description)}</stat>`
		);
	}
	lines.push(`</${element.type}>`);
	return lines.join('\n');
}

/** Writes elements back in the format the model writes them, for its prompts. */
export function serializeElements(elements: readonly DreamElement[]): string {
	return elements.map(serializeElement).join('\n');
}

/** Every name code should link in a passage, longest first so "Ms Varga" wins over "Varga". */
export function linkableNames(elements: readonly DreamElement[]): { id: string; name: string }[] {
	return elements
		.filter((element) => element.shown && element.type !== 'you')
		.flatMap((element) =>
			[element.name, ...(element.short ? [element.short] : []), ...element.also].map((name) => ({
				id: element.id,
				name
			}))
		)
		.filter((entry) => entry.name.length > 1)
		.sort((a, b) => b.name.length - a.name.length);
}
