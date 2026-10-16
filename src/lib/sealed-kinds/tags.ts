/**
 * The sealed kind behind a message tag: its name. The colour stays plaintext
 * beside it — seven fixed swatches say nothing — and so does a blind index of
 * the name, which is how the server still refuses two tags called the same
 * in one partnership without reading either. See docs/messaging.md, "Tags".
 */

import { z } from 'zod';
import { defineSealedKind } from '../sealed';

export const TAG_NAME_MAX = 80;

export const tagKind = defineSealedKind({
	name: 'tag',
	maxCiphertextLength: 1024,
	versions: [{ version: 1, schema: z.object({ name: z.string().trim().min(1).max(TAG_NAME_MAX) }) }]
});

export type TagContent = z.output<typeof tagKind.latest>;

/** The blind index's purpose: one key per vault for tag names, and nothing else. */
export const TAG_NAME_INDEX_PURPOSE = 'tag|name';

/**
 * What counts as the same name, decided before hashing because nothing can
 * be decided after: Unicode-normalised and trimmed. Case is kept, as it was
 * when the server compared plaintext names, so tags made then cannot collide
 * when they are sealed.
 */
export function normaliseTagName(name: string): string {
	return name.normalize('NFC').trim();
}
