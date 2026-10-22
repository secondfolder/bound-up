/**
 * The sealed kinds behind a notebook entry. Every byte of an entry's content
 * is one of these, sealed in the browser to the self vault or the
 * partnership vault, and the server stores and relays them without being
 * able to read any. See docs/notebook.md, "Encryption at rest".
 *
 * None is compressed (`sz1.`): that is allowed only for content the server
 * has already seen, and the server never sees any of this.
 */

import { z } from 'zod';
import { NOTEBOOK_LIMITS } from '../notebook';
import { defineSealedKind } from '../sealed';

/** Base64 (standard alphabet, padded), which is what `Uint8Array.toBase64()` and `btoa` produce. */
const base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/);

/**
 * An entry's title and the start of its text, for lists.
 *
 * A cache, not the source: the title lives in the entry's document, where it
 * merges live, and whichever device is editing rewrites this a few seconds
 * after it changes. A list needs it without loading every entry's history.
 */
export const notebookEntryKind = defineSealedKind({
	name: 'notebook-entry',
	maxCiphertextLength: NOTEBOOK_LIMITS.headerCiphertext,
	versions: [
		{
			version: 1,
			schema: z.object({
				title: z.string().max(NOTEBOOK_LIMITS.title),
				excerpt: z.string().max(NOTEBOOK_LIMITS.excerpt)
			})
		}
	]
});

export type NotebookEntryHeader = z.output<typeof notebookEntryKind.latest>;

/** One batch of edits to an entry's document: a Yjs update, base64. */
export const notebookUpdateKind = defineSealedKind({
	name: 'notebook-update',
	maxCiphertextLength: NOTEBOOK_LIMITS.updateCiphertext,
	versions: [{ version: 1, schema: z.object({ update: base64.min(1) }) }]
});

/**
 * One device's cursor, selection and presence in an entry: a `y-protocols`
 * awareness update, base64. Relayed, never stored.
 */
export const notebookAwarenessKind = defineSealedKind({
	name: 'notebook-awareness',
	maxCiphertextLength: NOTEBOOK_LIMITS.awarenessCiphertext,
	versions: [{ version: 1, schema: z.object({ state: base64.min(1) }) }]
});

/** A whole entry at one point in time: `Y.encodeStateAsUpdate`, base64. A version. */
export const notebookSnapshotKind = defineSealedKind({
	name: 'notebook-snapshot',
	maxCiphertextLength: NOTEBOOK_LIMITS.snapshotCiphertext,
	versions: [{ version: 1, schema: z.object({ state: base64.min(1) }) }]
});
