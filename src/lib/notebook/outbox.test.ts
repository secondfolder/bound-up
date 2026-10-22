import { describe, expect, it } from 'vitest';
import { generateAgeIdentity } from '$lib/crypto/identity';
import type { DraftOwner, DraftStorage } from '$lib/messaging/drafts';
import { openOutbox, outboxStorageKey } from './outbox';

/**
 * Edits that have not reached the server survive a reload, encrypted, and
 * leave the device once confirmed. The promise this keeps is "never lose
 * something a user typed" (docs/user-commitments-and-product-goals.md).
 */

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

describe('openOutbox', () => {
	it('keeps unsent batches across a reload, in order', async () => {
		const ada = await owner();
		const storage = memoryStorage();

		const first = await openOutbox('entry-1', ada, storage);
		first.add({ id: 'b1', update: 'AAEC' });
		first.add({ id: 'b2', update: 'AwQF' });
		await first.settled();

		const again = await openOutbox('entry-1', ada, storage);
		expect(again.initial).toEqual([
			{ id: 'b1', update: 'AAEC' },
			{ id: 'b2', update: 'AwQF' }
		]);
	});

	it('forgets a batch once the server has it, and the whole entry once none are left', async () => {
		const ada = await owner();
		const storage = memoryStorage();
		const outbox = await openOutbox('entry-1', ada, storage);
		outbox.add({ id: 'b1', update: 'AAEC' });
		outbox.add({ id: 'b2', update: 'AwQF' });
		outbox.confirm('b1');
		await outbox.settled();

		expect(outbox.pending()).toEqual([{ id: 'b2', update: 'AwQF' }]);
		outbox.confirm('b2');
		await outbox.settled();
		expect(storage.entries.size).toBe(0);
	});

	it('stores nothing in the clear', async () => {
		const ada = await owner();
		const storage = memoryStorage();
		const outbox = await openOutbox('entry-1', ada, storage);
		outbox.add({ id: 'b1', update: 'c2VjcmV0IHdvcmRz' });
		await outbox.settled();

		const stored = storage.entries.get(outboxStorageKey(ada, 'entry-1')) ?? '';
		expect(stored).not.toContain('c2VjcmV0IHdvcmRz');
		expect(stored).not.toContain('b1');
	});

	it('opens to nothing for someone else’s key', async () => {
		const ada = await owner();
		const bo = await owner();
		const storage = memoryStorage();
		const outbox = await openOutbox('entry-1', ada, storage);
		outbox.add({ id: 'b1', update: 'AAEC' });
		await outbox.settled();
		// Bo's key under Ada's storage key: what a stolen copy would be.
		storage.entries.set(
			outboxStorageKey(bo, 'entry-1'),
			storage.entries.get(outboxStorageKey(ada, 'entry-1')) ?? ''
		);

		expect((await openOutbox('entry-1', bo, storage)).initial).toEqual([]);
	});

	it('still holds batches in memory with nowhere to store them', async () => {
		const outbox = await openOutbox('entry-1', null, null);
		outbox.add({ id: 'b1', update: 'AAEC' });
		expect(outbox.pending()).toEqual([{ id: 'b1', update: 'AAEC' }]);
	});
});
