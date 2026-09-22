import { describe, expect, it, vi } from 'vitest';
import { generateAgeIdentity, importIdentityKey } from '$lib/crypto/identity';
import { emptyRichTextDocument } from '$lib/richtext';
import {
	draftStorageKey,
	isDraftEmpty,
	openDraft,
	type DraftOwner,
	type DraftScope,
	type DraftStorage
} from './drafts';

/** A `localStorage` stand-in that can be inspected. */
function memoryStorage(): DraftStorage & { entries: Map<string, string> } {
	const entries = new Map<string, string>();
	return {
		entries,
		getItem: (key) => entries.get(key) ?? null,
		setItem: (key, value) => void entries.set(key, value),
		removeItem: (key) => void entries.delete(key)
	};
}

async function owner(): Promise<DraftOwner> {
	const { recipient, identity } = await generateAgeIdentity();
	return { recipient, identity };
}

const threadA: DraftScope = { kind: 'thread', threadId: 'thread-a' };
const threadB: DraftScope = { kind: 'thread', threadId: 'thread-b' };
const newThread: DraftScope = { kind: 'new-thread', partnershipId: 'partnership-1' };

// Legacy plain text is a valid stored value — `parseStoredRichText` turns it
// into a one-paragraph document — so tests can write prose directly.
const EMPTY_DOCUMENT = JSON.stringify(emptyRichTextDocument());

describe('openDraft', () => {
	it('restores what was saved, in a later session', async () => {
		const ada = await owner();
		const storage = memoryStorage();

		const first = await openDraft(threadA, ada, storage);
		expect(first.initial).toBeNull();
		first.save({ text: 'half a thought', tagIds: [] });
		await first.settled();

		// A reload is a fresh session over the same storage.
		const second = await openDraft(threadA, ada, storage);
		expect(second.initial).toEqual({ text: 'half a thought', tagIds: [] });
	});

	it('stores ciphertext, never the words', async () => {
		const ada = await owner();
		const storage = memoryStorage();
		const session = await openDraft(threadA, ada, storage);
		session.save({ text: 'meet me in the kitchen', tagIds: ['tag-1'] });
		await session.settled();

		const [stored] = [...storage.entries.values()];
		expect(stored).toBeDefined();
		expect(stored).not.toContain('kitchen');
		expect(atob(stored)).not.toContain('kitchen');
		expect(atob(stored)).not.toContain('tag-1');
	});

	it('opens with the non-extractable CryptoKey a real device holds', async () => {
		const { recipient, identity } = await generateAgeIdentity();
		const storage = memoryStorage();
		const writer = await openDraft(threadA, { recipient, identity }, storage);
		writer.save({ text: 'from a real device', tagIds: [] });
		await writer.settled();

		const key = await importIdentityKey(identity);
		const reader = await openDraft(threadA, { recipient, identity: key }, storage);
		expect(reader.initial?.text).toBe('from a real device');
	});

	it('keeps each thread, and the new-message dialog, apart', async () => {
		const ada = await owner();
		const storage = memoryStorage();

		const a = await openDraft(threadA, ada, storage);
		const b = await openDraft(threadB, ada, storage);
		const fresh = await openDraft(newThread, ada, storage);
		a.save({ text: 'for thread a', tagIds: [] });
		b.save({ text: 'for thread b', tagIds: [] });
		fresh.save({ text: 'a new thread', tagIds: ['tag-1'] });
		await Promise.all([a.settled(), b.settled(), fresh.settled()]);

		// Editing one leaves the others exactly as they were.
		a.save({ text: 'for thread a, edited', tagIds: [] });
		await a.settled();
		b.clear();

		expect((await openDraft(threadA, ada, storage)).initial?.text).toBe('for thread a, edited');
		expect((await openDraft(threadB, ada, storage)).initial).toBeNull();
		expect((await openDraft(newThread, ada, storage)).initial).toEqual({
			text: 'a new thread',
			tagIds: ['tag-1']
		});
	});

	it('keeps two accounts on one browser apart', async () => {
		const ada = await owner();
		const jun = await owner();
		const storage = memoryStorage();

		const adas = await openDraft(threadA, ada, storage);
		adas.save({ text: "ada's words", tagIds: [] });
		await adas.settled();

		expect(draftStorageKey(ada, threadA)).not.toBe(draftStorageKey(jun, threadA));
		expect((await openDraft(threadA, jun, storage)).initial).toBeNull();
	});

	it('restores nothing it cannot open, and leaves it stored', async () => {
		const ada = await owner();
		const impostor = await owner();
		const storage = memoryStorage();
		// A draft written under this recipient, but by some other key — what a
		// key replaced on another device leaves behind.
		const key = draftStorageKey(ada, threadA);
		const other = await openDraft(threadA, impostor, storage);
		other.save({ text: 'not for ada', tagIds: [] });
		await other.settled();
		storage.setItem(key, storage.getItem(draftStorageKey(impostor, threadA))!);

		const session = await openDraft(threadA, ada, storage);
		expect(session.initial).toBeNull();
		expect(storage.getItem(key)).not.toBeNull();
	});

	it('drops the draft, tags and all, once there is no text', async () => {
		const ada = await owner();
		const storage = memoryStorage();
		const session = await openDraft(newThread, ada, storage);

		session.save({ text: 'with a tag', tagIds: ['tag-1'] });
		await session.settled();
		expect(storage.entries.size).toBe(1);

		session.save({ text: EMPTY_DOCUMENT, tagIds: ['tag-1'] });
		await session.settled();
		expect(storage.entries.size).toBe(0);

		// Tags alone are never stored.
		session.save({ text: '', tagIds: ['tag-1', 'tag-2'] });
		await session.settled();
		expect(storage.entries.size).toBe(0);
		expect((await openDraft(newThread, ada, storage)).initial).toBeNull();
	});

	it('does not bring back text that was deleted while it was being saved', async () => {
		const ada = await owner();
		const storage = memoryStorage();
		const session = await openDraft(threadA, ada, storage);

		// Queued, and still encrypting when the text is removed.
		session.save({ text: 'typed then deleted', tagIds: [] });
		session.clear();
		await session.settled();

		expect(storage.entries.size).toBe(0);
	});

	it('ends on the newest text however fast it changes', async () => {
		const ada = await owner();
		const storage = memoryStorage();
		const session = await openDraft(threadA, ada, storage);

		let text = '';
		for (const letter of 'quickly typed') {
			text += letter;
			session.save({ text, tagIds: [] });
		}
		await session.settled();

		expect((await openDraft(threadA, ada, storage)).initial?.text).toBe('quickly typed');
	});

	it('stores while the typing is still going on, not only once it stops', async () => {
		const ada = await owner();
		const storage = memoryStorage();
		const session = await openDraft(threadA, ada, storage);
		const write = vi.spyOn(storage, 'setItem');

		// Each save lands before the next arrives, as with a person typing.
		session.save({ text: 'one', tagIds: [] });
		await session.settled();
		session.save({ text: 'one two', tagIds: [] });
		await session.settled();

		expect(write).toHaveBeenCalledTimes(2);
	});

	it('keeps nothing, and fails nothing, with no identity to seal to', async () => {
		const storage = memoryStorage();
		const session = await openDraft(threadA, null, storage);
		expect(session.initial).toBeNull();
		session.save({ text: 'no key on this account', tagIds: [] });
		await session.settled();
		expect(storage.entries.size).toBe(0);
	});

	it('still opens when storage refuses every call', async () => {
		const ada = await owner();
		const refuses: DraftStorage = {
			getItem: () => {
				throw new Error('SecurityError');
			},
			setItem: () => {
				throw new Error('QuotaExceededError');
			},
			removeItem: () => {
				throw new Error('SecurityError');
			}
		};
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		const session = await openDraft(threadA, ada, refuses);
		expect(session.initial).toBeNull();
		session.save({ text: 'still typing', tagIds: [] });
		session.clear();
		session.save({ text: 'still typing', tagIds: [] });
		await session.settled();

		// Logged, without the words.
		expect(logged).toHaveBeenCalled();
		expect(JSON.stringify(logged.mock.calls)).not.toContain('still typing');
		logged.mockRestore();
	});
});

describe('isDraftEmpty', () => {
	it('uses the same measure as the Send button', () => {
		expect(isDraftEmpty('')).toBe(true);
		expect(isDraftEmpty(EMPTY_DOCUMENT)).toBe(true);
		expect(isDraftEmpty('something')).toBe(false);
	});
});
