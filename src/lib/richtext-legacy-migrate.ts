import { looksLikeRichTextDocument } from '$lib/richtext';
import { legacyTextToDocument } from '$lib/richtext-legacy';

/**
 * TEMPORARY — converts content written before rich text and writes it back.
 *
 * The whole file is deleted once nothing legacy is left; see
 * docs/temporary-code.md for the removal contract and how to tell when that
 * is. Every call site outside this file carries a `LEGACY-RICHTEXT` comment.
 *
 * Descriptions only. Message bodies used to be converted here too; they are
 * now converted as they move into the partnership vault
 * (`messaging/vault-migration.ts`), which has to decrypt every one anyway.
 */

/**
 * Convert a description the viewer is allowed to edit, or null when there is
 * nothing to do.
 *
 * Unlike a message this needs no key, so it is a pure string-to-string
 * conversion; the caller posts it to the endpoint that re-checks permission.
 */
export function convertLegacyDescription(description: string | null): string | null {
	if (description === null || description.trim() === '') {
		return null;
	}
	if (looksLikeRichTextDocument(description)) {
		return null;
	}
	return JSON.stringify(legacyTextToDocument(description));
}

export type LegacyDescriptionItem = { id: string; description: string | null };

/**
 * Convert the legacy descriptions in a list and write back the ones the viewer
 * may edit.
 *
 * Call it only with items the viewer can actually edit — the server re-checks
 * anyway, so this is about not making pointless requests rather than about
 * safety. Silent on failure, like the message path: nobody asked for this.
 */
/** The body of `/api/legacy-descriptions`, one entry per converted row. */
type DescriptionUpdate = {
	kind: 'self-task' | 'self-reward' | 'partnership-task' | 'partnership-reward';
	id: string;
	partnershipId?: string;
	description: string;
};

export async function migrateLegacyDescriptions(input: {
	kind: DescriptionUpdate['kind'];
	partnershipId?: string | null;
	items: LegacyDescriptionItem[];
}): Promise<number> {
	const updates: DescriptionUpdate[] = [];
	for (const item of input.items) {
		const converted = convertLegacyDescription(item.description);
		if (converted === null) {
			continue;
		}
		updates.push({
			kind: input.kind,
			id: item.id,
			...(input.partnershipId ? { partnershipId: input.partnershipId } : {}),
			description: converted
		});
	}
	if (updates.length === 0) {
		return 0;
	}

	try {
		const response = await fetch('/api/legacy-descriptions', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ updates })
		});
		if (!response.ok) {
			return 0;
		}
	} catch {
		return 0;
	}
	return updates.length;
}
