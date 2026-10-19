/**
 * Reading what the model suggests for a character or scene.
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
	type DaydreamScene,
	type DialValue,
	MAX_DAYDREAM_CHARACTERS,
	SCENE_TEXT_FIELDS,
	type SceneDials,
	type SceneTextField,
	UNSET_CHARACTER_DIALS
} from '../daydream';
import { unfence } from './reply-format';
import type { StoryCast, StoryPieces } from './starters';

export type SuggestTask = 'chips' | 'fill' | 'surprise-scene' | 'casting' | 'name' | 'daydream';
export type SuggestTarget = 'character' | 'scene';

/** The longest stretch of the opening passage sent to name a daydream: its start says enough. */
export const MAX_NAMING_OPENING = 2000;

/** A chip is one phrase, so never a list of them. */
const SEPARATOR = /[,\n]/;

/** The longest chip kept, and how many one answer may add. */
export const MAX_CHIP_LENGTH = 80;
export const MAX_SUGGESTED_CHIPS = 12;

/** Each field's cap, by name, for both kinds of record. */
export const FIELD_LIMITS: Readonly<
	Record<CharacterTextField | SceneTextField | 'name' | 'title', number>
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

/** The JSON inside a non-streamed completion, or null. Tolerates a code fence around it. */
export function completionJson(body: unknown): unknown {
	const envelope = envelopeSchema.safeParse(body);
	if (!envelope.success) {
		return null;
	}
	const content = envelope.data.choices[0]?.message.content.trim() ?? '';
	const unfenced = unfence(content);
	try {
		return JSON.parse(unfenced);
	} catch {
		return null;
	}
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
		target === 'character' ? ['name', ...CHARACTER_TEXT_FIELDS] : ['title', ...SCENE_TEXT_FIELDS];
	const filled: Partial<Record<string, string>> = {};
	for (const field of fields) {
		const text = (value as Record<string, unknown>)[field];
		const limit = FIELD_LIMITS[field as keyof typeof FIELD_LIMITS];
		if (typeof text === 'string' && text.trim() && text.trim().length <= limit) {
			filled[field] = text.trim();
		}
	}
	return filled;
}

/** A scene part as the model suggests it: no id yet, which the dialog gives it. */
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
 * A scene's heat and kink from an answer. Lenient, like the rest: a missing or
 * out-of-range value is unset rather than the answer failing, since the
 * dials are optional anyway.
 */
export function parseSceneDials(value: unknown): SceneDials {
	if (!value || typeof value !== 'object') {
		return { heat: null, kink: null };
	}
	const answer = value as Record<string, unknown>;
	return { heat: dialOf(answer.heat), kink: dialOf(answer.kink) };
}

/** A whole scene from "Surprise me", or null when it lacks the two fields a scene must have. */
export function parseSurpriseScene(
	value: unknown
): (Omit<DaydreamScene, 'parts'> & { parts: SuggestedPart[] }) | null {
	const fields = parseFill('scene', value);
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
		dials: parseSceneDials(value)
	};
}

/** Strings within a cap, trimmed; anything else as empty. */
function capped(value: unknown, limit: number): string {
	return typeof value === 'string' && value.trim().length <= limit ? value.trim() : '';
}

/**
 * Who a character is in this story, from a `casting` answer: the fields that
 * fit, empty where one did not. Null when neither came back.
 */
export function parseCasting(value: unknown): { relationship: string; part: string } | null {
	if (!value || typeof value !== 'object') {
		return null;
	}
	const answer = value as Record<string, unknown>;
	const relationship = capped(answer.relationship, DAYDREAM_LIMITS.relationship);
	const part = capped(answer.part, DAYDREAM_LIMITS.castPart);
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

const VOICE_IDS = ['talk', 'told', 'watch', 'rules'] as const;

/**
 * A whole daydream from a `daydream` answer, written from a sentence the
 * user typed: its voice, its scene and who is in it, in pieces for
 * `assembleSetup` (`starters.ts`) to put together. Null without a scene that
 * has the two fields a scene must have.
 *
 * Lenient like the rest: a voice that is not one of the four is left to
 * follow who is in it, a person with no name is dropped, and every field is
 * held to its cap. Characters' dials stay unset, as a person who skipped
 * them would leave them; the scene's are rated.
 */
export function parseSuggestedDaydream(value: unknown): StoryPieces | null {
	if (!value || typeof value !== 'object') {
		return null;
	}
	const answer = value as Record<string, unknown>;
	const scene = parseSurpriseScene(answer.scene);
	if (!scene) {
		return null;
	}
	const voice = VOICE_IDS.find((id) => id === answer.voice) ?? null;
	const list = Array.isArray(answer.characters) ? answer.characters : [];
	const cast: StoryCast[] = [];
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
	return { voice, scene, cast: cast.slice(0, MAX_DAYDREAM_CHARACTERS) };
}

const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
