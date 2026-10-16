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
 * comes last. That is why this is a trailing block rather than a JSON reply
 * or a tool call: a JSON reply cannot be shown until it has finished, and
 * tool calls are not supported the same way by every model on OpenRouter.
 *
 * Tolerant on purpose. A model that forgets the block, or writes one that
 * does not parse, still gets its passage kept: the reply simply offers no new
 * buttons or suggestions, and the buttons from before stay.
 *
 * Pure and alias-free.
 */

import { type PassageMeta, passageMetaSchema } from '../sealed-kinds/daydreams';

const OPEN = '<meta>';
const CLOSE = '</meta>';

const FENCE_START = /^```(?:json)?\s*/i;
const FENCE_END = /\s*```$/;

/** JSON with any code fence around it taken off: models add one despite being asked not to. */
export function unfence(text: string): string {
	return text.replace(FENCE_START, '').replace(FENCE_END, '');
}

/**
 * The part of a reply still arriving that should be shown: everything before
 * the block, and nothing of the block's opening tag even while it is only
 * half there, so `<me` never flickers onto the screen.
 */
export function visiblePassage(soFar: string): string {
	const at = soFar.indexOf(OPEN);
	if (at !== -1) {
		return soFar.slice(0, at).trimEnd();
	}
	for (let length = Math.min(OPEN.length - 1, soFar.length); length > 0; length -= 1) {
		if (soFar.endsWith(OPEN.slice(0, length))) {
			return soFar.slice(0, -length).trimEnd();
		}
	}
	return soFar;
}

export type ParsedReply = { passage: string; meta: PassageMeta | null };

/** A finished reply, split. `meta` is null when there was no block or it did not hold up. */
export function parseReply(full: string): ParsedReply {
	const at = full.indexOf(OPEN);
	if (at === -1) {
		return { passage: full.trim(), meta: null };
	}
	const passage = full.slice(0, at).trim();
	const rest = full.slice(at + OPEN.length);
	const end = rest.indexOf(CLOSE);
	const body = (end === -1 ? rest : rest.slice(0, end)).trim();
	return { passage, meta: parseMeta(body) };
}

function parseMeta(body: string): PassageMeta | null {
	let value: unknown;
	try {
		value = JSON.parse(unfence(body));
	} catch {
		return null;
	}
	const strict = passageMetaSchema.safeParse(value);
	if (strict.success) {
		return strict.data;
	}
	// One bad part should not cost the rest: a roll whose outcomes miss a face
	// is dropped, and the buttons and suggestions beside it still count.
	if (value && typeof value === 'object' && 'roll' in value) {
		const { roll: _dropped, ...withoutRoll } = value as Record<string, unknown>;
		const retried = passageMetaSchema.safeParse(withoutRoll);
		return retried.success ? retried.data : null;
	}
	return null;
}
