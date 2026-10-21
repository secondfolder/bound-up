/**
 * The shape of a reply: the passage, then what the model says about it.
 *
 * The prompt (`server/daydream/prompt.ts`, "Reply format") asks the model to
 * end every reply with
 *
 *     <meta>
 *     {"suggestions": [...], "directions": {...}, ...}
 *     </meta>
 *
 * The passage streams first, so it can be read as it arrives, and the block
 * comes last.
 *
 * A reply may also start with a block: the user's own turn written out, when
 * they wrote what their turn should be rather than the turn itself
 * (docs/daydreams.md, "Written out for you"):
 *
 *     <yours>
 *     "Charlie — the fox is safe."
 *     </yours>
 *     The passage…
 *
 * First, because the passage answers it: the model writes the turn, then
 * replies to what it wrote rather than to the instruction.
 *
 * Before even that, a reply to words the user wrote opens with how the model
 * read them, `<reading>direction</reading>`. The model commits to a reading
 * before it writes anything — named only afterwards, in the metadata, it was
 * a label put on whatever the passage had already done — and the page can
 * draw the turn as it was read while the passage is still arriving. That is why this is a trailing block rather than a JSON reply
 * or a tool call: a JSON reply cannot be shown until it has finished, and
 * tool calls are not supported the same way by every model on OpenRouter.
 *
 * Tolerant on purpose. A model that forgets the block, or writes one that
 * does not parse, still gets its passage kept: the reply simply offers no new
 * buttons or suggestions, and the buttons from before stay.
 *
 * Pure and alias-free.
 */

import { DAYDREAM_LIMITS, MAX_DIRECTIONS, MAX_SUGGESTIONS } from '../daydream';
import {
	type Direction,
	directionSchema,
	type PassageMeta,
	passageMetaV7,
	type Reading,
	readingSchema,
	rollProposalSchema,
	type StorySettings,
	storySettingsSchema
} from '../sealed-kinds/daydreams';

const OPEN = '<meta>';
const CLOSE = '</meta>';
const READING_OPEN = '<reading>';
const READING_CLOSE = '</reading>';
const YOURS_OPEN = '<yours>';
const YOURS_CLOSE = '</yours>';

const FENCE_START = /^```(?:json)?\s*/i;
const FENCE_END = /\s*```$/;

/** JSON with any code fence around it taken off: models add one despite being asked not to. */
export function unfence(text: string): string {
	return text.replace(FENCE_START, '').replace(FENCE_END, '');
}

/** `text` without the start of `tag` it may end on, so a half-arrived tag never flickers onto the screen. */
function withoutPartialTag(text: string, tag: string): string {
	for (let length = Math.min(tag.length - 1, text.length); length > 0; length -= 1) {
		if (text.endsWith(tag.slice(0, length))) {
			return text.slice(0, -length);
		}
	}
	return text;
}

/**
 * The part of a passage still arriving that should be shown: everything
 * before the block, and nothing of the block's opening tag even while it is
 * only half there, so `<me` never flickers onto the screen.
 */
export function visiblePassage(soFar: string): string {
	const at = soFar.indexOf(OPEN);
	if (at !== -1) {
		return soFar.slice(0, at).trimEnd();
	}
	const trimmed = withoutPartialTag(soFar, OPEN);
	return trimmed === soFar ? soFar : trimmed.trimEnd();
}

/** A reply as far as it has got: how it read the user's turn, that turn written out, and the passage. */
export type ReplySoFar = { passage: string; expansion: string | null; reading: Reading | null };

/** A reading as the model wrote it, if it is one. */
function toReading(body: string): Reading | null {
	const parsed = readingSchema.safeParse(body.trim().toLowerCase());
	return parsed.success ? parsed.data : null;
}

/**
 * The blocks a reply may open with, in order — `<reading>` then `<yours>` —
 * taken off the front. `pending` while one has started but not closed, or
 * only part of an opening tag is there yet; `rest` is what follows them.
 */
function leadingBlocks(text: string): {
	rest: string;
	reading: Reading | null;
	expansion: string | null;
	/** An open block, by tag, with what it holds so far; null once every block has closed. */
	pending: { tag: string; body: string } | null;
} {
	let rest = text.trimStart();
	let reading: Reading | null = null;
	let expansion: string | null = null;
	for (const [open, close] of [
		[READING_OPEN, READING_CLOSE],
		[YOURS_OPEN, YOURS_CLOSE]
	] as const) {
		if (rest !== '' && open.startsWith(rest) && rest !== open) {
			return { rest: '', reading, expansion, pending: { tag: open, body: '' } };
		}
		if (!rest.startsWith(open)) {
			continue;
		}
		const body = rest.slice(open.length);
		const end = body.indexOf(close);
		if (end === -1) {
			return { rest: body, reading, expansion, pending: { tag: open, body } };
		}
		const inside = body.slice(0, end);
		if (open === READING_OPEN) {
			reading = toReading(inside);
		} else {
			expansion = inside.trim() || null;
		}
		rest = body.slice(end + close.length).trimStart();
	}
	return { rest, reading, expansion, pending: null };
}

/**
 * What to show of a reply still arriving. The reading is known as soon as
 * its tag closes, the written-out turn shows as it arrives, and the passage
 * only once both have closed; none of the tags show, even half-arrived.
 */
export function visibleReply(soFar: string): ReplySoFar {
	const { rest, reading, expansion, pending } = leadingBlocks(soFar);
	if (pending) {
		const writing = pending.tag === YOURS_OPEN;
		return {
			passage: '',
			reading,
			expansion: writing ? withoutPartialTag(pending.body, YOURS_CLOSE).trim() || null : null
		};
	}
	return { passage: visiblePassage(rest), reading, expansion };
}

export type ParsedReply = {
	passage: string;
	meta: PassageMeta | null;
	expansion: string | null;
	reading: Reading | null;
};

/**
 * A finished reply, split. `meta` is null when there was no block or it did
 * not hold up; `expansion` when the reply did not write the user's turn out;
 * `reading` when it did not open with one it could name. A block never
 * closed counts for nothing: where it ends and the passage starts cannot be
 * told, so everything after its tag is kept as the passage.
 */
export function parseReply(full: string): ParsedReply {
	const { rest, reading, expansion } = leadingBlocks(full);
	const at = rest.indexOf(OPEN);
	if (at === -1) {
		return { passage: rest.trim(), meta: null, expansion, reading };
	}
	const passage = rest.slice(0, at).trim();
	const after = rest.slice(at + OPEN.length);
	const end = after.indexOf(CLOSE);
	const body = (end === -1 ? after : after.slice(0, end)).trim();
	return { passage, meta: parseMeta(body), expansion, reading };
}

function parseMeta(body: string): PassageMeta | null {
	const value = parseJsonLeniently(unfence(body));
	if (value === undefined) {
		return null;
	}
	const strict = passageMetaV7.safeParse(value);
	const meta = strict.success ? strict.data : salvageMeta(value);
	if (!meta) {
		return null;
	}
	// What the settings were is the page's to say, from the setup it holds,
	// never the model's.
	const { settingsBefore: _before, ...said } = meta;
	return said;
}

const SETTING_KEYS = ['length', 'pace', 'intensity', 'heat', 'kink'] as const;

/** The settings in a block, each kept on its own when it is valid, or undefined for none. */
function salvageSettings(value: unknown): StorySettings | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const record = value as Record<string, unknown>;
	const kept: Record<string, unknown> = Object.fromEntries(
		SETTING_KEYS.flatMap((key) => {
			const one = storySettingsSchema.safeParse({ [key]: record[key] });
			return one.success && one.data[key] !== undefined ? [[key, one.data[key]]] : [];
		})
	);
	// Each character on their own, so one bad entry costs only itself.
	const characters = (Array.isArray(record.characters) ? record.characters : []).flatMap(
		(entry: unknown) => {
			const one = storySettingsSchema.safeParse({ characters: [entry] });
			return one.success ? (one.data.characters ?? []) : [];
		}
	);
	if (characters.length > 0) {
		kept.characters = characters;
	}
	const settings = storySettingsSchema.safeParse(kept);
	return settings.success ? settings.data : undefined;
}

/**
 * A string value missing its opening quote, `"label":Comply"` or
 * `"label": Take your time"`: a slip models make often enough that, left
 * alone, it cost a passage every one of its buttons and suggestions. Never a
 * literal (true, false, null), a number, a string, an array or an object.
 */
const UNOPENED_STRING = /:(?<space>\s*)(?!(?:true|false|null)\b)(?<text>[^\s"\d[{-][^"\n]*)"/g;

/** JSON, or the same with its one common slip mended; undefined when neither parses. */
function parseJsonLeniently(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		// Mended below, if it is the slip models make.
	}
	try {
		return JSON.parse(text.replace(UNOPENED_STRING, ':$<space>"$<text>"'));
	} catch {
		return undefined;
	}
}

/** A direction's id from its label, for one written as a bare label or with an id the schema refuses. */
function slug(label: string): string {
	return label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
}

/** The label of a direction written as a bare label or as an object with one; null for anything else. */
function labelOf(entry: unknown): string | null {
	if (typeof entry === 'string') {
		return entry;
	}
	if (entry && typeof entry === 'object' && 'label' in entry && typeof entry.label === 'string') {
		return entry.label;
	}
	return null;
}

/** One direction as the model wrote it, made a direction if it can be: an object, or a bare label. */
function toDirection(entry: unknown): Direction | null {
	const label = labelOf(entry);
	if (label === null) {
		return null;
	}
	const given = entry && typeof entry === 'object' && 'id' in entry ? entry.id : null;
	const exact = directionSchema.safeParse({ id: given, label });
	if (exact.success) {
		return exact.data;
	}
	const mended = directionSchema.safeParse({ id: slug(label), label });
	return mended.success ? mended.data : null;
}

/**
 * Whatever holds up of a block the schema refused, part by part, so one bad
 * part costs only itself: a suggestion too long, a direction with a bad id,
 * a roll that misses a face. Directions written as a plain list are read as
 * the buttons to add, which is what a model writing one means.
 */
function salvageMeta(value: unknown): PassageMeta | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}
	const record = value as Record<string, unknown>;
	const list = (field: unknown): unknown[] => (Array.isArray(field) ? field : []);

	const suggestions = list(record.suggestions)
		.filter((entry): entry is string => typeof entry === 'string')
		.map((entry) => entry.trim())
		.filter((entry) => entry !== '' && entry.length <= DAYDREAM_LIMITS.suggestion)
		.slice(0, MAX_SUGGESTIONS);

	const { directions } = record;
	const asObject =
		directions && typeof directions === 'object' && !Array.isArray(directions)
			? (directions as Record<string, unknown>)
			: null;
	const add = list(asObject ? asObject.add : directions)
		.map(toDirection)
		.filter((entry) => entry !== null)
		.slice(0, MAX_DIRECTIONS);
	const remove = list(asObject?.remove)
		.filter((entry): entry is string => typeof entry === 'string' && entry.length <= 40)
		.slice(0, MAX_DIRECTIONS * 2);

	const roll = rollProposalSchema.safeParse(record.roll);
	const image = passageMetaV7.shape.image.safeParse(record.image);
	const readAs = readingSchema.safeParse(record.readAs);
	const settings = salvageSettings(record.settings);
	const drifted = passageMetaV7.shape.drifted.safeParse(record.drifted);
	const salvaged = passageMetaV7.safeParse({
		suggestions,
		directions: { add, remove },
		...(roll.success ? { roll: roll.data } : {}),
		...(readAs.success ? { readAs: readAs.data } : {}),
		...(record.ooc === true ? { ooc: true } : {}),
		...(image.success && image.data ? { image: image.data } : {}),
		...(settings ? { settings } : {}),
		...(drifted.success && drifted.data ? { drifted: drifted.data } : {})
	});
	return salvaged.success ? salvaged.data : null;
}
