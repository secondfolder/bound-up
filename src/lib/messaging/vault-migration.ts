/**
 * Moving a partnership's messages from the original scheme into its vault.
 *
 * Before vaults, every message, sidecar and reaction was age-encrypted to both
 * partners' recipients. The server cannot re-encrypt anything, so moving them
 * into the partnership vault happens on a device: whichever partner's is open
 * next, in the background, once its vaults are. See docs/messaging.md, "Moving
 * into the vault".
 *
 * Either partner can do all of it, because every row is encrypted to both.
 * Rows this device cannot open — encrypted to a key it no longer has — are
 * left for the other partner's device, and the cursor moves past them.
 *
 * A body written before rich text existed is converted as it is sealed, so
 * this also finishes the message half of LEGACY-RICHTEXT: nothing in a vault
 * is plain text.
 */

import {
	decryptMessageMetadata,
	decryptPayload,
	type MessagePayload,
	type ReactionPayload
} from '../crypto/messages';
import { sealRecord } from '../crypto/sealed';
import { looksLikeRichTextDocument } from '../richtext';
import { legacyTextToDocument } from '../richtext-legacy';
import {
	messageBodyKind,
	messageMetadataKind,
	messageReactionKind
} from '../sealed-kinds/messages';
import type { MessageWriteKeys } from './client';

type LegacyPage = {
	messages: { id: string; ciphertext: string; metadataCiphertext: string | null }[];
	reactions: { id: string; ciphertext: string }[];
	next: { messagesAfter: string | null; reactionsAfter: string | null } | null;
};

export type MigrationDeps = {
	fetchPage: (after: {
		messagesAfter: string | null;
		reactionsAfter: string | null;
	}) => Promise<LegacyPage>;
	postSealed: (batch: {
		vaultId: string;
		messages: {
			id: string;
			ciphertext: string;
			payloadVersion: number;
			metadataCiphertext: string | null;
			metadataVersion: number | null;
		}[];
		reactions: { id: string; ciphertext: string; payloadVersion: number }[];
	}) => Promise<void>;
};

/** A body as it should be sealed: rich text, whatever it was written as. */
function asDocument(payload: MessagePayload): {
	text: string;
	attachments: MessagePayload['attachments'];
} {
	const text = looksLikeRichTextDocument(payload.text)
		? payload.text
		: JSON.stringify(legacyTextToDocument(payload.text));
	return { text, attachments: payload.attachments };
}

async function sealOrNull<T>(seal: () => Promise<T>): Promise<T | null> {
	try {
		return await seal();
	} catch {
		return null;
	}
}

/**
 * Seals every row this device can open into the partnership vault, a page at
 * a time. Returns how many rows it sealed, for tests and nothing else: it is
 * housekeeping nobody asked for, so it never reports a failure to anyone.
 */
export async function migrateToVault(
	identity: CryptoKey | string,
	keys: MessageWriteKeys,
	deps: MigrationDeps
): Promise<number> {
	let sealedCount = 0;
	let after: { messagesAfter: string | null; reactionsAfter: string | null } = {
		messagesAfter: null,
		reactionsAfter: null
	};

	for (;;) {
		const page = await deps.fetchPage(after);
		const messages: Parameters<MigrationDeps['postSealed']>[0]['messages'] = [];
		for (const row of page.messages) {
			const payload = await decryptPayload<MessagePayload>(row.ciphertext, identity);
			if (!payload) {
				continue;
			}
			// A body its own kind's schema refuses is left where it is, readable
			// the old way, rather than holding up the rest of the partnership.
			const body = await sealOrNull(() =>
				sealRecord(messageBodyKind, { recordId: row.id, payload: asDocument(payload), ...keys })
			);
			if (!body) {
				continue;
			}
			const metadata = row.metadataCiphertext
				? await decryptMessageMetadata(row.metadataCiphertext, identity)
				: null;
			// The sidecar is only a cache of looked-up details: one that does not
			// fit is dropped, and readers look the details up again.
			const sidecar = metadata
				? await sealOrNull(() =>
						sealRecord(messageMetadataKind, {
							recordId: row.id,
							payload: { embeds: metadata.embeds.slice(0, 50) },
							...keys
						})
					)
				: null;
			messages.push({
				id: row.id,
				ciphertext: body.ciphertext,
				payloadVersion: body.payloadVersion,
				metadataCiphertext: sidecar?.ciphertext ?? null,
				metadataVersion: sidecar?.payloadVersion ?? null
			});
		}

		const reactions: Parameters<MigrationDeps['postSealed']>[0]['reactions'] = [];
		for (const row of page.reactions) {
			const payload = await decryptPayload<ReactionPayload>(row.ciphertext, identity);
			if (!payload?.emoji) {
				continue;
			}
			const sealed = await sealOrNull(() =>
				sealRecord(messageReactionKind, {
					recordId: row.id,
					payload: { emoji: payload.emoji },
					...keys
				})
			);
			if (sealed) {
				reactions.push({ id: row.id, ...sealed });
			}
		}

		if (messages.length > 0 || reactions.length > 0) {
			await deps.postSealed({ vaultId: keys.vault.id, messages, reactions });
			sealedCount += messages.length + reactions.length;
		}
		if (!page.next) {
			return sealedCount;
		}
		after = page.next;
	}
}

/**
 * A request that got no response: offline, or cut short by the page
 * navigating away, which happens routinely to background work. Told apart so
 * the caller can stay quiet about it.
 */
export class MigrationInterrupted extends Error {}

async function quietFetch(input: string, init?: RequestInit): Promise<Response> {
	try {
		return await fetch(input, init);
	} catch (error) {
		throw new MigrationInterrupted('A migration request got no response', { cause: error });
	}
}

/** The same, against the endpoints. */
export async function migratePartnershipToVault(
	partnershipId: string,
	identity: CryptoKey | string,
	keys: MessageWriteKeys
): Promise<number> {
	const base = `/api/partnerships/${partnershipId}/sealed-migration`;
	return await migrateToVault(identity, keys, {
		async fetchPage(after) {
			const query = new URLSearchParams();
			if (after.messagesAfter) {
				query.set('messagesAfter', after.messagesAfter);
			}
			if (after.reactionsAfter) {
				query.set('reactionsAfter', after.reactionsAfter);
			}
			const response = await quietFetch(`${base}?${query}`);
			if (!response.ok) {
				throw new Error(`Could not list messages to move (${response.status})`);
			}
			return (await response.json()) as LegacyPage;
		},
		async postSealed(batch) {
			const response = await quietFetch(base, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(batch)
			});
			if (!response.ok) {
				throw new Error(`Could not move messages into the vault (${response.status})`);
			}
		}
	});
}
