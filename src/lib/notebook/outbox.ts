/**
 * A notebook entry's unsent edits, kept on this device until the server has
 * them.
 *
 * BROWSER ONLY. The app's promise is that nothing typed is lost
 * (docs/user-commitments-and-product-goals.md). A message composer keeps a
 * draft; a notebook entry has no draft, because every keystroke is already
 * on its way to the server, so what it keeps instead is every batch that has
 * not been confirmed yet. A tab closed mid-send, a phone that loses signal, a
 * server that is down: each leaves its edits here, and the next time the
 * entry opens on this device they are applied and sent again. Yjs ignores an
 * update it already has, and the server stores a batch id once, so a batch
 * that did arrive after all is harmless to resend.
 *
 * Stored like a draft (`messaging/drafts.ts`): in `localStorage`,
 * age-encrypted to the user's own recipient, so it needs only the public key
 * to write and survives sign-out as ciphertext.
 */

import { decryptPayload, encryptPayload, type NotebookOutboxPayload } from '$lib/crypto/messages';
import type { DraftOwner, DraftStorage } from '$lib/messaging/drafts';

export type OutboxBatch = { id: string; update: string };

export type Outbox = {
	/** What was waiting when the entry opened, oldest first. */
	initial: OutboxBatch[];
	/** Keeps a batch until `confirm`. */
	add: (batch: OutboxBatch) => void;
	/** Forgets a batch the server has stored. */
	confirm: (id: string) => void;
	/** Every batch not yet confirmed, oldest first. */
	pending: () => OutboxBatch[];
	/** Resolves once every queued write has landed. For tests. */
	settled: () => Promise<void>;
};

/** Versioned so a later shape can ignore, rather than misread, this one. */
const PREFIX = 'bound-up:notebook-outbox:v1';

export function outboxStorageKey(owner: Pick<DraftOwner, 'recipient'>, entryId: string): string {
	return `${PREFIX}:${owner.recipient}:${entryId}`;
}

function browserStorage(): DraftStorage | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

async function read(
	storage: DraftStorage,
	key: string,
	identity: CryptoKey | string
): Promise<OutboxBatch[]> {
	const stored = storage.getItem(key);
	if (!stored) {
		return [];
	}
	const payload = await decryptPayload<NotebookOutboxPayload>(stored, identity);
	if (payload?.version !== 1 || !Array.isArray(payload.batches)) {
		return [];
	}
	return payload.batches.filter(
		(batch) => typeof batch?.id === 'string' && typeof batch.update === 'string'
	);
}

/**
 * Opens an entry's outbox. With no owner or no storage, every call keeps the
 * batches in memory only: a send still retries for as long as the page is
 * open, it just cannot survive a reload.
 */
export async function openOutbox(
	entryId: string,
	owner: DraftOwner | null,
	storage: DraftStorage | null = browserStorage()
): Promise<Outbox> {
	const key = owner ? outboxStorageKey(owner, entryId) : null;
	// Never a rejection: an entry waits on this before it opens, so a failure
	// here has to mean "nothing waiting", not "no entry".
	const initial =
		owner && storage && key ? await read(storage, key, owner.identity).catch(() => []) : [];
	const batches = new Map(initial.map((batch) => [batch.id, batch.update]));

	/**
	 * Writes are serialised and coalesced, as drafts' are: encryption is async,
	 * so two quick changes could otherwise finish out of order and leave the
	 * older list stored. A write overtaken while queued skips its encryption,
	 * since only the newest list is worth storing.
	 */
	let latest = 0;
	let chain: Promise<void> = Promise.resolve();

	function persist() {
		if (!(owner && storage && key)) {
			return;
		}
		latest += 1;
		const ticket = latest;
		const snapshot = [...batches].map(([id, update]) => ({ id, update }));
		const { recipient } = owner;
		const store = storage;
		chain = chain.then(async () => {
			if (ticket !== latest) {
				return;
			}
			try {
				if (snapshot.length === 0) {
					store.removeItem(key);
					return;
				}
				const ciphertext = await encryptPayload({ version: 1, batches: snapshot }, [recipient]);
				// Overtaken while encrypting by a newer list, which will land itself.
				if (ticket !== latest) {
					return;
				}
				store.setItem(key, ciphertext);
			} catch (problem) {
				// Quota, or a storage that refuses writes. The edits are still in
				// memory and still being sent, so this is logged, not surfaced. Never
				// log the batches themselves.
				console.error('[notebook] could not keep unsent edits on this device', problem);
			}
		});
	}

	return {
		initial,
		add: (batch) => {
			batches.set(batch.id, batch.update);
			persist();
		},
		confirm: (id) => {
			if (batches.delete(id)) {
				persist();
			}
		},
		pending: () => [...batches].map(([id, update]) => ({ id, update })),
		settled: () => chain
	};
}
