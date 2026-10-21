/**
 * Reading what the model suggests for a character or idea.
 *
 * The suggest endpoint (`api/daydreams/suggest`) passes the provider's answer
 * through unread, like the reply endpoint, so the browser is what checks it:
 * the OpenAI-compatible envelope, the JSON the prompt asked for inside it,
 * and every field held to the same caps as a field the person typed. Anything
 * that does not fit is dropped — a suggestion is a convenience, and a bad one
 * is better lost than shown half-right.
 *
 * Pure and alias-free.
 */

import { z } from 'zod';
import {
	CHARACTER_TEXT_FIELDS,
	type CharacterTextField,
	DAYDREAM_LIMITS,
	type DaydreamVoicePresetId,
	type DialValue,
	IDEA_TEXT_FIELDS,
	type IdeaDials,
	type IdeaTextField,
	type IdeaWithoutOrigin,
	MAX_DAYDREAM_CHARACTERS,
	UNSET_CHARACTER_DIALS
} from '../daydream';
import { unfence } from './reply-format';
import type { DaydreamCast, DaydreamPieces, StarterSide } from './starters';
import { parseMarkedSummary } from './summary';

export type SuggestTask =
	| 'chips'
	| 'fill'
	| 'surprise-idea'
	| 'casting'
	| 'name'
	| 'daydream'
	| 'ideas';
export type SuggestTarget = 'character' | 'idea';

/** The longest stretch of the opening passage sent to name a daydream: its start says enough. */
export const MAX_NAMING_OPENING = 2000;

/** A chip is one phrase, so never a list of them. */
const SEPARATOR = /[,\n]/;

/** The longest chip kept, and how many one answer may add. */
export const MAX_CHIP_LENGTH = 80;
export const MAX_SUGGESTED_CHIPS = 12;

/** Each field's cap, by name, for both kinds of record. */
export const FIELD_LIMITS: Readonly<
	Record<CharacterTextField | IdeaTextField | 'name' | 'title', number>
> = {
	name: DAYDREAM_LIMITS.characterName,
	archetype: DAYDREAM_LIMITS.archetype,
	personality: DAYDREAM_LIMITS.personality,
	speech: DAYDREAM_LIMITS.speech,
	appearance: DAYDREAM_LIMITS.appearance,
	likes: DAYDREAM_LIMITS.likes,
	notes: DAYDREAM_LIMITS.characterNotes,
	title: DAYDREAM_LIMITS.title,
	setting: DAYDREAM_LIMITS.setting,
	premise: DAYDREAM_LIMITS.premise,
	yourRole: DAYDREAM_LIMITS.yourRole,
	tone: DAYDREAM_LIMITS.tone
};

const envelopeSchema = z.object({
	choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1)
});

/**
 * A Responses API answer, which is what a suggestion that read a brief's
 * links comes back as (docs/daydreams.md, "Links in a brief"): a list of
 * items, the reply among them as a `message`, each fetch as an
 * `openrouter:web_fetch`. Read loosely, item by item, so one item of a shape
 * not known here costs only itself.
 */
const responsesSchema = z.object({ output: z.array(z.unknown()) });

const outputMessageSchema = z.object({
	type: z.literal('message'),
	content: z.array(z.object({ type: z.string(), text: z.string().optional() }))
});

/** The model's reply in a non-streamed completion, as it wrote it, or null for no completion. */
export function completionText(body: unknown): string | null {
	const envelope = envelopeSchema.safeParse(body);
	if (envelope.success) {
		return envelope.data.choices[0]?.message.content ?? null;
	}
	const responses = responsesSchema.safeParse(body);
	if (!responses.success) {
		return null;
	}
	const texts = responses.data.output.flatMap((item) => {
		const message = outputMessageSchema.safeParse(item);
		return message.success
			? message.data.content.flatMap((part) =>
					part.type === 'output_text' && part.text !== undefined ? [part.text] : []
				)
			: [];
	});
	return texts.length > 0 ? texts.join('') : null;
}

const FENCED_BLOCK = /```(?:json)?\s*(?<json>[\s\S]*?)\s*```/i;

/**
 * The JSON inside a non-streamed completion, or null. Tolerates a code fence
 * around it, and words before or after it: a model that has read the links in
 * a brief (`web_fetch`) tends to say what it found first, and `response_format`
 * no longer holds it to bare JSON once it has called a tool.
 */
export function completionJson(body: unknown): unknown {
	const content = completionText(body)?.trim();
	if (content === undefined) {
		return null;
	}
	const fenced: RegExpExecArray | null = FENCED_BLOCK.exec(content);
	const candidates = [
		unfence(content),
		fenced?.groups?.json,
		content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)
	];
	for (const candidate of candidates) {
		if (!candidate) {
			continue;
		}
		try {
			return JSON.parse(candidate);
		} catch {
			// The next way of finding it.
		}
	}
	return null;
}

/** The most of a reply debug mode is shown: enough to see what went wrong. */
export const MAX_REPLY_DETAIL = 8000;

/**
 * Why an answer with nothing usable in it had nothing, and what it was, for
 * debug mode (docs/debug-mode.md): not a completion at all, a reply that was
 * not JSON, or JSON in which nothing was what the prompt asked for. Users
 * only ever see "No ideas came back"; this is for whoever is working out why.
 */
export function describeUnusable(body: unknown): string {
	const content = completionText(body);
	const cut = (text: string) =>
		text.length > MAX_REPLY_DETAIL ? `${text.slice(0, MAX_REPLY_DETAIL)}\n… (cut)` : text;
	if (content === null) {
		const outline = responsesOutline(body);
		return outline === null
			? `The provider’s answer had no reply in it:\n${cut(JSON.stringify(body, null, 2) ?? String(body))}`
			: `The provider’s answer had no reply in it.\n${cut(outline)}`;
	}
	if (completionJson(body) === null) {
		return `The reply was not JSON:\n${cut(content)}`;
	}
	return `The reply was JSON, but nothing in it was what was asked for, or within its limits:\n${cut(content)}`;
}

/** What a Responses answer says about how it ended, beside its output. */
const RESPONSES_ENDING = ['status', 'incomplete_details', 'error', 'usage'] as const;

/**
 * A Responses answer with no reply in it, outlined rather than dumped: how it
 * ended, each output item's type and size, and the last item whole. Dumped,
 * the first fetched page alone outran `MAX_REPLY_DETAIL`, so the cut fell
 * inside it and hid the end of the answer, which is where the reason is: a
 * token budget spent on reasoning (`usage`), a turn that stopped after its
 * fetches, or a reply in a shape `completionText` does not read. The pages
 * themselves are in the chat log (`suggestionLog`). Null for anything that is not a Responses
 * answer.
 */
function responsesOutline(body: unknown): string | null {
	const responses = responsesSchema.safeParse(body);
	if (!responses.success) {
		return null;
	}
	const fields = body as Record<string, unknown>;
	const ending = RESPONSES_ENDING.flatMap((key) =>
		fields[key] === undefined || fields[key] === null
			? []
			: [`${key}: ${JSON.stringify(fields[key], null, 2)}`]
	);
	const { output } = responses.data;
	const items = output.map((item, index) => {
		const type = z.object({ type: z.string() }).safeParse(item);
		const size = (JSON.stringify(item) ?? '').length;
		return `${index + 1}. ${type.success ? type.data.type : '(no type)'}, ${size.toLocaleString('en')} characters`;
	});
	const last = output.at(-1);
	return [
		...ending,
		`output: ${output.length} ${output.length === 1 ? 'item' : 'items'}`,
		...items,
		...(last === undefined ? [] : [`The last item:\n${JSON.stringify(last, null, 2)}`])
	].join('\n');
}

/** More chips for one field: trimmed, capped, de-duplicated, empties dropped. */
export function parseChips(value: unknown): string[] {
	const parsed = z.object({ chips: z.array(z.unknown()) }).safeParse(value);
	if (!parsed.success) {
		return [];
	}
	const chips: string[] = [];
	for (const chip of parsed.data.chips) {
		if (typeof chip !== 'string') {
			continue;
		}
		const text = chip.trim();
		if (
			text &&
			text.length <= MAX_CHIP_LENGTH &&
			!SEPARATOR.test(text) &&
			!chips.some((existing) => existing.toLowerCase() === text.toLowerCase())
		) {
			chips.push(text);
		}
	}
	return chips.slice(0, MAX_SUGGESTED_CHIPS);
}

/**
 * Text for the fields named, from a "fill in the rest" answer. Only fields of
 * the target's kind, only strings, only within each field's cap; the caller
 * then writes them into fields that were empty, never over what was written.
 */
export function parseFill(target: SuggestTarget, value: unknown): Partial<Record<string, string>> {
	if (!value || typeof value !== 'object') {
		return {};
	}
	const fields: readonly string[] =
		target === 'character' ? ['name', ...CHARACTER_TEXT_FIELDS] : ['title', ...IDEA_TEXT_FIELDS];
	const filled: Partial<Record<string, string>> = {};
	for (const field of fields) {
		const text = (value as Record<string, unknown>)[field];
		const limit = FIELD_LIMITS[field as keyof typeof FIELD_LIMITS];
		if (typeof text !== 'string' || !text.trim()) {
			continue;
		}
		const kept =
			target === 'idea' && field === 'notes' ? wholeLines(text.trim(), limit) : text.trim();
		if (kept.length <= limit) {
			filled[field] = kept;
		}
	}
	return filled;
}

/**
 * As many whole lines as fit in `limit`. An idea's notes are a monologue's
 * sayings, one to a line, and a list that runs over is still worth its
 * first few, where any other field over its cap is dropped. A first line
 * that does not fit by itself is returned whole, for the caller to drop.
 */
function wholeLines(text: string, limit: number): string {
	if (text.length <= limit) {
		return text;
	}
	const lines = text.split('\n');
	let kept = lines[0] ?? '';
	for (const line of lines.slice(1)) {
		if (kept.length + 1 + line.length > limit) {
			break;
		}
		kept = `${kept}\n${line}`;
	}
	return kept;
}

/**
 * The research notes in an answer (`research`, for a whole daydream or a
 * round of ideas), as many whole lines as fit the cap: like a monologue's
 * sayings, notes that run over are still worth their first lines. Empty for
 * anything else, or a first line too long by itself.
 */
export function parseResearch(value: unknown): string {
	if (!value || typeof value !== 'object') {
		return '';
	}
	const { research } = value as Record<string, unknown>;
	if (typeof research !== 'string') {
		return '';
	}
	const kept = wholeLines(research.trim(), DAYDREAM_LIMITS.ideaResearch);
	return kept.length <= DAYDREAM_LIMITS.ideaResearch ? kept : '';
}

/** An idea part as the model suggests it: no id yet, which the dialog gives it. */
export type SuggestedPart = { name: string; description: string };

/**
 * The parts in an answer's `parts`: each with a name within its cap, a
 * description cut to its own, the first few only, no name twice. Anything
 * else is dropped.
 */
export function parseParts(value: unknown): SuggestedPart[] {
	if (!value || typeof value !== 'object') {
		return [];
	}
	const list = (value as Record<string, unknown>).parts;
	if (!Array.isArray(list)) {
		return [];
	}
	const parts: SuggestedPart[] = [];
	for (const entry of list) {
		const parsed = z
			.object({ name: z.string(), description: z.string().optional() })
			.safeParse(entry);
		if (!parsed.success) {
			continue;
		}
		const name = parsed.data.name.trim();
		if (
			name &&
			name.length <= DAYDREAM_LIMITS.partName &&
			!parts.some((part) => part.name.toLowerCase() === name.toLowerCase())
		) {
			const description = (parsed.data.description ?? '').trim();
			parts.push({
				name,
				description: description.length <= DAYDREAM_LIMITS.partDescription ? description : ''
			});
		}
	}
	return parts.slice(0, MAX_DAYDREAM_CHARACTERS);
}

/** A dial from an answer: a whole number 1 to 5, or null for anything else. */
function dialOf(value: unknown): DialValue | null {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
		? (value as DialValue)
		: null;
}

/**
 * An idea's heat and kink from an answer. Lenient, like the rest: a missing or
 * out-of-range value is unset rather than the answer failing, since the
 * dials are optional anyway.
 */
export function parseIdeaDials(value: unknown): IdeaDials {
	if (!value || typeof value !== 'object') {
		return { heat: null, kink: null };
	}
	const answer = value as Record<string, unknown>;
	return { heat: dialOf(answer.heat), kink: dialOf(answer.kink) };
}

/** A whole idea from "Surprise me", or null when it lacks the two fields an idea must have. */
export function parseSurpriseIdea(
	value: unknown
): (Omit<IdeaWithoutOrigin, 'parts'> & { parts: SuggestedPart[] }) | null {
	const fields = parseFill('idea', value);
	if (!(fields.title && fields.premise)) {
		return null;
	}
	return {
		title: fields.title,
		setting: fields.setting ?? '',
		premise: fields.premise,
		yourRole: fields.yourRole ?? '',
		tone: fields.tone ?? '',
		notes: fields.notes ?? '',
		parts: parseParts(value),
		dials: parseIdeaDials(value)
	};
}

/** Strings within a cap, trimmed; anything else as empty. */
function capped(value: unknown, limit: number): string {
	return typeof value === 'string' && value.trim().length <= limit ? value.trim() : '';
}

/**
 * Who a character is in this daydream, from a `casting` answer: the fields that
 * fit, empty where one did not. Null when neither came back.
 */
export function parseCasting(value: unknown): { relationship: string; part: string } | null {
	if (!value || typeof value !== 'object') {
		return null;
	}
	const answer = value as Record<string, unknown>;
	const relationship = capped(answer.relationship, DAYDREAM_LIMITS.relationship);
	// Asked for as "doing" now, the word the whole-daydream answer uses for
	// the same thing; "part" read as the idea's part. The old key is still
	// read, for an answer to a prompt from before.
	const part = capped(answer.doing ?? answer.part, DAYDREAM_LIMITS.castPart);
	return relationship || part ? { relationship, part } : null;
}

/**
 * A daydream's name from a `name` answer, or null. Quotation marks around it
 * are taken off, since a model asked for a title tends to quote it.
 */
export function parseName(value: unknown): string | null {
	if (!value || typeof value !== 'object') {
		return null;
	}
	const { title } = value as Record<string, unknown>;
	if (typeof title !== 'string') {
		return null;
	}
	const name = title.trim().replace(QUOTES, '').trim();
	return name && name.length <= DAYDREAM_LIMITS.title ? name : null;
}

const QUOTES = /^["'“”‘’]+|["'“”‘’]+$/g;

const VOICE_IDS = ['talk', 'told', 'watch', 'rules', 'monologue'] as const;

/** A voice preset's id from an answer, or null for anything else. */
const voiceOf = (value: unknown): DaydreamVoicePresetId | null =>
	VOICE_IDS.find((id) => id === value) ?? null;

/**
 * A whole daydream from a `daydream` answer, written from a brief the
 * user typed: its voice, its idea and who is in it, in pieces for
 * `assembleSetup` (`starters.ts`) to put together, and the summary the form
 * shows it as (`parseMarkedSummary`). Null without an idea that has the two
 * fields an idea must have; a summary that cannot be read is only none, and
 * the idea's premise is shown in its place.
 *
 * Lenient like the rest: a voice that is not one of the five is left to
 * follow who is in it, a person with no name is dropped, and every field is
 * held to its cap. Characters' dials stay unset, as a person who skipped
 * them would leave them; the idea's are rated. The idea's research is the
 * answer's notes (`parseResearch`); its brief is the caller's to add, since
 * it is what the user typed, not anything the model said.
 */
export function parseSuggestedDaydream(value: unknown): DaydreamPieces | null {
	if (!value || typeof value !== 'object') {
		return null;
	}
	const answer = value as Record<string, unknown>;
	const idea = parseSurpriseIdea(answer.idea);
	if (!idea) {
		return null;
	}
	const voice = voiceOf(answer.voice);
	const research = parseResearch(answer);
	const list = Array.isArray(answer.characters) ? answer.characters : [];
	const cast: DaydreamCast[] = [];
	for (const entry of list) {
		const fields = parseFill('character', entry);
		if (!fields.name || cast.some((other) => same(other.character.name, fields.name ?? ''))) {
			continue;
		}
		const person = entry as Record<string, unknown>;
		const partName = capped(person.part, DAYDREAM_LIMITS.partName);
		cast.push({
			character: {
				name: fields.name,
				archetype: fields.archetype ?? '',
				personality: fields.personality ?? '',
				speech: fields.speech ?? '',
				appearance: fields.appearance ?? '',
				likes: fields.likes ?? '',
				notes: fields.notes ?? '',
				dials: UNSET_CHARACTER_DIALS
			},
			partName: partName || null,
			relationship: capped(person.relationship, DAYDREAM_LIMITS.relationship),
			doing: capped(person.doing, DAYDREAM_LIMITS.castPart)
		});
	}
	const kept = cast.slice(0, MAX_DAYDREAM_CHARACTERS);
	const summary = parseMarkedSummary(
		answer.summary,
		kept.map((person) => person.character.name)
	);
	return { voice, idea: { ...idea, research }, cast: kept, summary };
}

const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** How many ideas one "Suggest daydreams for this" or "More ideas" asks for. */
export const GENERATED_IDEAS = 6;

/**
 * The most titles "More ideas" tells the model it has already offered, the
 * latest kept: enough for several rounds, without the prompt growing for as
 * long as someone keeps asking.
 */
export const MAX_OFFERED_IDEAS = 60;

/** A generated idea's tags: as few as a ready-made daydream's, and as short. */
export const MAX_IDEA_TAGS = 4;
export const MAX_IDEA_TAG_LENGTH = 30;

/**
 * The longest premise kept for a generated idea. Picking one sends it back as
 * the idea to write out (`chosen`), held to the same cap there. It was first
 * set so that title and premise together fit the `brief` cap, when a picked
 * idea was sent as the brief in place of the one the user wrote; that lost
 * the user's own words, and is why it is a separate field now.
 */
export const MAX_IDEA_PREMISE = DAYDREAM_LIMITS.brief - DAYDREAM_LIMITS.title - 2;

/**
 * An idea for a daydream from "Suggest daydreams for this": enough for a card like a ready-made one,
 * and nothing more — picking one asks for the whole daydream then, so
 * generating a handful stays quick and cheap.
 */
export type GeneratedIdea = {
	title: string;
	premise: string;
	tags: readonly string[];
	/** The user's side in it, as a ready-made daydream's `you`. */
	you: StarterSide | null;
	/**
	 * Whether `you` is not the side the ideas were asked for: the brief said
	 * plainly which side the user is on, and that wins over "You as"
	 * (`suggest-prompt.ts`). Shown whatever "You as" says, since the brief
	 * is what asked for it.
	 */
	sideFromBrief: boolean;
	/**
	 * How it is told, as a ready-made daydream's `voice`, or null for the
	 * model to choose when it is written out: an idea for a monologue stays
	 * one, rather than being written out as a story about its theme.
	 */
	voice: DaydreamVoicePresetId | null;
	dials: IdeaDials;
	/**
	 * The notes the round of ideas it came in was written with, shared by
	 * every idea in it (`parseResearch`), for the one picked to be written out
	 * from without the brief's links being read a second time.
	 */
	research: string;
};

/**
 * The ideas in an `ideas` answer, for the side they were asked for. Each
 * needs a title and a premise within their caps; tags are trimmed, capped
 * and de-duplicated; a side that is not one of the two is none. An idea that
 * puts the user on the other side from the one asked for is kept, marked
 * `sideFromBrief`: the prompt has the brief's own word on the user's side
 * win, so it is what they asked for. A second idea with the same title is
 * dropped. Each carries the round's research.
 */
export function parseGeneratedIdeas(value: unknown, side: StarterSide | null): GeneratedIdea[] {
	const parsed = z.object({ ideas: z.array(z.unknown()) }).safeParse(value);
	if (!parsed.success) {
		return [];
	}
	const research = parseResearch(value);
	const ideas: GeneratedIdea[] = [];
	for (const entry of parsed.data.ideas) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}
		const idea = entry as Record<string, unknown>;
		const title = capped(idea.title, DAYDREAM_LIMITS.title).replace(QUOTES, '').trim();
		const premise = capped(idea.premise, MAX_IDEA_PREMISE);
		const you = idea.you === 'dom' || idea.you === 'sub' ? idea.you : null;
		if (!(title && premise) || ideas.some((other) => same(other.title, title))) {
			continue;
		}
		ideas.push({
			title,
			premise,
			tags: ideaTags(idea.tags),
			you,
			sideFromBrief: side !== null && you !== null && you !== side,
			voice: voiceOf(idea.voice),
			dials: parseIdeaDials(idea),
			research
		});
	}
	return ideas.slice(0, GENERATED_IDEAS);
}

/**
 * "More ideas": the ones already shown, then any new ones. The model is told
 * what it offered, but can still repeat itself, and a second card with the
 * same title would be a second key in the list, so a repeat is dropped.
 */
export function addIdeas(
	shown: readonly GeneratedIdea[],
	more: readonly GeneratedIdea[]
): GeneratedIdea[] {
	const added: GeneratedIdea[] = [...shown];
	for (const idea of more) {
		if (!added.some((other) => same(other.title, idea.title))) {
			added.push(idea);
		}
	}
	return added;
}

function ideaTags(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const tags: string[] = [];
	for (const tag of value) {
		const text = typeof tag === 'string' ? tag.trim().toLocaleLowerCase() : '';
		if (
			text &&
			text.length <= MAX_IDEA_TAG_LENGTH &&
			!SEPARATOR.test(text) &&
			!tags.includes(text)
		) {
			tags.push(text);
		}
	}
	return tags.slice(0, MAX_IDEA_TAGS);
}
