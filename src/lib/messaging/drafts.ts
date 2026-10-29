/**
 * Unsent message drafts, kept on this device until they are sent or emptied.
 *
 * BROWSER ONLY — it encrypts, see the note at the top of `src/lib/crypto/kdf.ts`.
 *
 * Losing something a person typed is one of the failures this app treats as
 * unacceptable (docs/user-commitments-and-product-goals.md), and a composer is
 * where it happens most easily: a reload, a closed dialog, a tab the phone
 * evicted, a navigation to another thread. So every composer writes what it
 * holds to `localStorage` as it changes, and reads it back when it mounts.
 *
 * **A draft is sealed to its writer's own key before it is stored.** A message
 * is ciphertext everywhere else — on the server, in transit, in the cache — and
 * a draft is the same words a moment earlier, so it must not be the one place
 * they sit on disk in the clear. Encrypting to the account's *recipient* needs
 * only the public half, and reading it back needs the unlocked identity, which
 * every composer already has: none of them is on screen while the device is
 * locked. The consequences are deliberate:
 *
 * - A draft survives signing out, as ciphertext, and comes back on the next
 *   sign-in.
 * - It is keyed by recipient as well as by scope, so two accounts on one
 *   browser never see — or overwrite — each other's drafts.
 * - An account with no message keys (`absent`) has nothing to seal to, so its
 *   composer keeps no draft. Storing that one case in plaintext would be the
 *   exception that undoes the rule.
 *
 * Drafts hold text (the stored rich-text string) and, for the new-thread
 * dialog, the chosen tags. Attachments are not kept: they are still on the
 * device they were picked from, and copying megabytes of photos into browser
 * storage to spare a re-pick is the wrong trade.
 */

import { assertNever } from '$lib/assert-never';
import { type DraftPayload, decryptPayload, encryptPayload } from '$lib/crypto/messages';
import { isRichTextDocumentEmpty, parseStoredRichText } from '$lib/richtext';

/** Which composer a draft belongs to. One draft per scope. */
export type DraftScope =
	| { kind: 'thread'; threadId: string }
	/** The "Write something" dialog — one per partnership, not per open. */
	| { kind: 'new-thread'; partnershipId: string }
	/** What the user is writing in a daydream: one per daydream. */
	| { kind: 'daydream'; daydreamId: string }
	/**
	 * The new engine's boxes (docs/dreams.md): the story's input and the
	 * setup's "change it", the answer to its question and an edit of a
	 * passage, one per daydream or passage each, and a new daydream's brief
	 * and a new limit, one per account. Plain text, not a rich-text document.
	 */
	| { kind: 'dream'; dreamId: string }
	| { kind: 'dream-change'; dreamId: string }
	| { kind: 'dream-answer'; dreamId: string }
	/** What was set and filled in on a passage, as JSON: half-filled fields survive a reload. */
	| { kind: 'dream-inputs'; dreamId: string }
	| { kind: 'dream-edit'; turnId: string }
	| { kind: 'dream-brief' }
	| { kind: 'dream-limit' };

export type Draft = { text: string; tagIds: string[] };

/** Who is writing: the key a draft is sealed to and the key that opens it. */
export type DraftOwner = { recipient: string; identity: CryptoKey | string };

/** The slice of `Storage` this module uses, so tests can hand in their own. */
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type DraftSession = {
	/** What was stored for this scope, or null for none (or none readable). */
	initial: Draft | null;
	/**
	 * Stores the composer's current state. A draft with no visible text is
	 * removed rather than stored — tags included, because tags on their own are
	 * not a message anyone is in the middle of writing.
	 */
	save: (draft: Draft) => void;
	/** Removes the draft, e.g. once it has been sent. */
	clear: () => void;
	/** Resolves once every queued write has landed. For tests. */
	settled: () => Promise<void>;
};

/** Versioned so a later shape can ignore, rather than misread, this one. */
const PREFIX = 'bound-up:draft:v1';

export function draftStorageKey(owner: Pick<DraftOwner, 'recipient'>, scope: DraftScope): string {
	return `${PREFIX}:${owner.recipient}:${scope.kind}:${scopeId(scope)}`;
}

function scopeId(scope: DraftScope): string {
	switch (scope.kind) {
		case 'thread':
			return scope.threadId;
		case 'new-thread':
			return scope.partnershipId;
		case 'daydream':
			return scope.daydreamId;
		case 'dream':
		case 'dream-change':
		case 'dream-answer':
		case 'dream-inputs':
			return scope.dreamId;
		case 'dream-edit':
			return scope.turnId;
		case 'dream-brief':
		case 'dream-limit':
			return 'new';
		default:
			return assertNever(scope, 'draft scope');
	}
}

/** Empty by the same measure the Send button uses: nothing a reader would see. */
export function isDraftEmpty(text: string): boolean {
	return text === '' || isRichTextDocumentEmpty(parseStoredRichText(text));
}

/** The scopes whose text is plain, which `isDraftEmpty` would read as an empty document. */
function isPlainScope(scope: DraftScope): boolean {
	return (
		scope.kind === 'dream' ||
		scope.kind === 'dream-change' ||
		scope.kind === 'dream-answer' ||
		scope.kind === 'dream-inputs' ||
		scope.kind === 'dream-edit' ||
		scope.kind === 'dream-brief' ||
		scope.kind === 'dream-limit'
	);
}

/**
 * `localStorage`, or null where the browser refuses it (some private modes,
 * blocked site data). Drafts are then simply not kept — the composer must
 * still work.
 */
function browserStorage(): DraftStorage | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

/**
 * Opens the draft for one composer: reads what is stored, and returns the
 * handle that keeps it current.
 *
 * `owner` is null when the device has no identity to seal with; the session
 * then restores nothing and stores nothing.
 */
export async function openDraft(
	scope: DraftScope,
	owner: DraftOwner | null,
	storage: DraftStorage | null = browserStorage()
): Promise<DraftSession> {
	if (!(owner && storage)) {
		// Nothing to seal with or nowhere to put it, so every call is a no-op.
		return {
			initial: null,
			save: () => undefined,
			clear: () => undefined,
			settled: () => Promise.resolve()
		};
	}

	const key = draftStorageKey(owner, scope);
	// Bound once the guard above has ruled out null, so the closures below see
	// the narrowed types (a parameter with a default does not stay narrowed).
	const { recipient } = owner;
	const store = storage;
	// Never a rejection: a composer waits on this before it renders, so a
	// failure here has to mean "no draft", not "no composer".
	const initial = await read(storage, key, owner.identity).catch(() => null);

	/**
	 * Writes are serialised through one promise chain and coalesced.
	 *
	 * Encryption is async, so without the chain two quick keystrokes could
	 * finish out of order and leave the *older* text stored. `latest` lets a
	 * queued write that has already been overtaken skip its encryption — only
	 * the newest queued state is worth the work — while a write already
	 * encrypting still lands, because under continuous typing every write is
	 * overtaken before it finishes, and discarding those would store nothing
	 * until the typing stopped.
	 *
	 * `clears` is the one thing allowed to cancel a write mid-flight: text that
	 * was typed and then deleted (or sent) must not reappear because its
	 * encryption finished a moment after the removal.
	 */
	let latest = 0;
	let clears = 0;
	let chain: Promise<void> = Promise.resolve();

	function clear() {
		latest += 1;
		clears += 1;
		try {
			store.removeItem(key);
		} catch {
			// Nothing to do: a storage that cannot remove cannot have stored.
		}
	}

	const plain = isPlainScope(scope);
	function save(draft: Draft) {
		if (plain ? draft.text.trim() === '' : isDraftEmpty(draft.text)) {
			clear();
			return;
		}
		latest += 1;
		const ticket = latest;
		const clearsAtQueue = clears;
		const payload: DraftPayload = { version: 1, text: draft.text, tagIds: [...draft.tagIds] };
		chain = chain.then(async () => {
			if (ticket !== latest) {
				return;
			}
			try {
				const ciphertext = await encryptPayload(payload, [recipient]);
				if (clears !== clearsAtQueue) {
					return;
				}
				store.setItem(key, ciphertext);
			} catch (problem) {
				// Quota, or a storage that refuses writes. The composer still holds
				// the text on screen, so this is logged rather than surfaced. Never
				// log the draft itself.
				console.error('[drafts] could not store a draft', problem);
			}
		});
	}

	return { initial, save, clear, settled: () => chain };
}

async function read(
	storage: DraftStorage,
	key: string,
	identity: CryptoKey | string
): Promise<Draft | null> {
	let stored: string | null;
	try {
		stored = storage.getItem(key);
	} catch {
		return null;
	}
	if (!stored) {
		return null;
	}

	// Null when this identity cannot open it. The stored copy is left alone
	// rather than deleted: the next save replaces it anyway, and deleting
	// something unreadable is the one move here that could not be undone.
	const opened = await decryptPayload<DraftPayload>(stored, identity);
	if (!opened || typeof opened.text !== 'string') {
		return null;
	}
	return {
		text: opened.text,
		tagIds: Array.isArray(opened.tagIds)
			? opened.tagIds.filter((id): id is string => typeof id === 'string')
			: []
	};
}
