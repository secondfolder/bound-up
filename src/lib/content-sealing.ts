/**
 * TEMPORARY — seals tasks, rewards, completions, claims and message tags written before
 * sealing existed, in the background, once per scope per page load.
 *
 * BROWSER ONLY — it seals with `crypto/sealed.ts`.
 *
 * The server cannot encrypt, so it hands this device the rows of a scope
 * still in plaintext (`/api/sealing/[scope]`, `server/content-sealing.ts`),
 * and this seals each into the scope's vault and posts it back; the server
 * clears the plaintext in the same write. Descriptions written before rich
 * text are converted on the way, which is what finally retires their
 * separate conversion path. Deleted with the plaintext columns once nothing
 * is left to seal; see docs/temporary-code.md.
 */

import { sealRecord } from './crypto/sealed';
import { writeGrantFor } from './crypto/trust.svelte';
import { blindIndex, type OpenVault } from './crypto/vault';
import { currentVaults } from './crypto/vaults.svelte';
import { selfWriteGrant, type WriteGrant } from './crypto/write-grant';
import { looksLikeRichTextDocument } from './richtext';
import { legacyTextToDocument } from './richtext-legacy';
import type { SealedKind } from './sealed';
import { normaliseTagName, TAG_NAME_INDEX_PURPOSE, tagKind } from './sealed-kinds/tags';
import { rewardKind, taskKind } from './sealed-kinds/tasks';

type Cursors = {
	tasks: string | null;
	completions: string | null;
	rewards: string | null;
	claims: string | null;
	tags: string | null;
};

type UnsealedPage = {
	tasks: { id: string; title: string; description: string | null; completionMessages: string[] }[];
	completions: {
		id: string;
		taskTitle: string;
		taskDescription: string | null;
		completionMessage: string | null;
	}[];
	rewards: { id: string; title: string; description: string | null }[];
	claims: { id: string; rewardTitle: string; rewardDescription: string | null }[];
	tags: { id: string; name: string }[];
	next: Cursors | null;
};

type Writable = { vault: OpenVault; grant: WriteGrant };

/** A navigation cutting a request short: not worth a line in the console. */
class SealingInterrupted extends Error {}

async function quietFetch(input: string, init?: RequestInit): Promise<Response> {
	try {
		return await fetch(input, init);
	} catch (error) {
		throw new SealingInterrupted('A sealing request got no response', { cause: error });
	}
}

/** A stored description as a document: plain text from before rich text is converted. */
function asDocument(description: string | null): string | null {
	if (description === null || description.trim() === '') {
		return null;
	}
	return looksLikeRichTextDocument(description)
		? description
		: JSON.stringify(legacyTextToDocument(description));
}

/**
 * Seals one row, or null when its old content does not fit the kind — a row
 * from before a limit existed, say. That row stays in plaintext and is moved
 * past, rather than blocking the rest; docs/temporary-code.md has the query
 * that finds any left over.
 */
async function sealOrSkip<Latest>(
	kind: SealedKind<Latest>,
	recordId: string,
	payload: unknown,
	writable: Writable
): Promise<{ ciphertext: string; payloadVersion: number } | null> {
	const parsed = kind.latest.safeParse(payload);
	if (!parsed.success) {
		return null;
	}
	return await sealRecord(kind, { recordId, payload: parsed.data, ...writable });
}

async function sealScope(scopePath: string, writable: Writable): Promise<void> {
	const after: Cursors = {
		tasks: null,
		completions: null,
		rewards: null,
		claims: null,
		tags: null
	};
	const done = new Set<keyof Cursors>();
	for (;;) {
		const query = new URLSearchParams();
		for (const [kind, cursor] of Object.entries(after)) {
			if (cursor) {
				query.set(kind, cursor);
			}
		}
		const response = await quietFetch(`/api/sealing/${scopePath}?${query.toString()}`);
		if (!response.ok) {
			throw new Error(`Could not list unsealed content (${response.status})`);
		}
		const page = (await response.json()) as UnsealedPage;

		const batch = {
			vaultId: writable.vault.id,
			tasks: [] as {
				id: string;
				ciphertext: string;
				payloadVersion: number;
				completionMessageCount: number;
			}[],
			completions: [] as {
				id: string;
				ciphertext: string;
				payloadVersion: number;
				completionMessageIndex: number | null;
			}[],
			rewards: [] as { id: string; ciphertext: string; payloadVersion: number }[],
			claims: [] as { id: string; ciphertext: string; payloadVersion: number }[],
			tags: [] as { id: string; ciphertext: string; payloadVersion: number; nameIndex: string }[]
		};

		if (!done.has('tasks')) {
			for (const row of page.tasks) {
				const payload = {
					title: row.title,
					description: asDocument(row.description),
					completionMessages: row.completionMessages
				};
				const sealed = await sealOrSkip(taskKind, row.id, payload, writable);
				if (sealed) {
					batch.tasks.push({
						id: row.id,
						...sealed,
						completionMessageCount: row.completionMessages.length
					});
				}
			}
		}
		if (!done.has('completions')) {
			for (const row of page.completions) {
				// A completion kept only the message it was given, so its copy of
				// the task has that one message, at index 0.
				const messages = row.completionMessage ? [row.completionMessage] : [];
				const payload = {
					title: row.taskTitle,
					description: asDocument(row.taskDescription),
					completionMessages: messages
				};
				const sealed = await sealOrSkip(taskKind, row.id, payload, writable);
				if (sealed) {
					batch.completions.push({
						id: row.id,
						...sealed,
						completionMessageIndex: messages.length > 0 ? 0 : null
					});
				}
			}
		}
		if (!done.has('rewards')) {
			for (const row of page.rewards) {
				const payload = { title: row.title, description: asDocument(row.description) };
				const sealed = await sealOrSkip(rewardKind, row.id, payload, writable);
				if (sealed) {
					batch.rewards.push({ id: row.id, ...sealed });
				}
			}
		}
		if (!done.has('claims')) {
			for (const row of page.claims) {
				const payload = { title: row.rewardTitle, description: asDocument(row.rewardDescription) };
				const sealed = await sealOrSkip(rewardKind, row.id, payload, writable);
				if (sealed) {
					batch.claims.push({ id: row.id, ...sealed });
				}
			}
		}

		if (!done.has('tags')) {
			for (const row of page.tags) {
				const sealed = await sealOrSkip(tagKind, row.id, { name: row.name }, writable);
				if (sealed) {
					const nameIndex = await blindIndex(
						writable.vault,
						TAG_NAME_INDEX_PURPOSE,
						normaliseTagName(row.name)
					);
					batch.tags.push({ id: row.id, ...sealed, nameIndex });
				}
			}
		}

		const any =
			batch.tasks.length +
			batch.completions.length +
			batch.rewards.length +
			batch.claims.length +
			batch.tags.length;
		if (any > 0) {
			const posted = await quietFetch(`/api/sealing/${scopePath}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(batch)
			});
			if (!posted.ok) {
				throw new Error(`Could not store sealed content (${posted.status})`);
			}
		}

		if (!page.next) {
			return;
		}
		// A kind whose cursor has run out is finished; the server lists it again
		// from the start without a cursor, so it is skipped from here on.
		for (const kind of Object.keys(after) as (keyof Cursors)[]) {
			const cursor = page.next[kind];
			if (cursor === null) {
				done.add(kind);
			}
			after[kind] = cursor;
		}
	}
}

const started = new Set<string>();

function start(scopePath: string, writable: Writable): void {
	const key = `${scopePath}:${writable.vault.id}`;
	if (started.has(key)) {
		return;
	}
	started.add(key);
	// Housekeeping nobody is waiting on (docs/request-failures.md): a failure
	// is logged and the next page load tries again.
	void sealScope(scopePath, writable).catch((error: unknown) => {
		started.delete(key);
		if (!(error instanceof SealingInterrupted)) {
			console.error('could not seal older tasks and rewards', error);
		}
	});
}

/**
 * Starts sealing every scope this device can write into. Called by
 * `EncryptionGate` once vaults are open; a partnership whose keys the trust
 * check has been warned about is left alone, as it is for a send.
 */
export function sealOpenScopes(): void {
	const vaults = currentVaults();
	if (vaults.status !== 'ready') {
		return;
	}
	if (vaults.self) {
		start('self', { vault: vaults.self, grant: selfWriteGrant(vaults.self) });
	}
	for (const [partnershipId, vault] of Object.entries(vaults.partnerships)) {
		const grant = writeGrantFor(partnershipId, vault.id);
		if (grant) {
			start(partnershipId, { vault, grant });
		}
	}
}
