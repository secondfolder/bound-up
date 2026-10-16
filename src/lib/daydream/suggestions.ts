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
	SCENE_TEXT_FIELDS,
	type SceneTextField
} from '../daydream';
import { unfence } from './reply-format';

export type SuggestTask = 'chips' | 'fill' | 'surprise-scene';
export type SuggestTarget = 'character' | 'scene';

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
	relationship: DAYDREAM_LIMITS.relationship,
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

/** A whole scene from "Surprise me", or null when it lacks the two fields a scene must have. */
export function parseSurpriseScene(value: unknown): DaydreamScene | null {
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
		notes: fields.notes ?? ''
	};
}
