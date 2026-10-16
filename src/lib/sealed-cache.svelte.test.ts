import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { sealRecord } from './crypto/sealed';
import { generateVaultKey, type OpenVault, vaultFromKey } from './crypto/vault';
import { selfWriteGrant } from './crypto/write-grant';
import { defineSealedKind } from './sealed';
import { SealedReader } from './sealed-cache.svelte';

/** In the browser project: the reader is reactive state, and opens with real WebCrypto. */

const note = defineSealedKind({
	name: 'test-note',
	maxCiphertextLength: 4096,
	versions: [{ version: 1, schema: z.object({ text: z.string() }) }]
});

const RECORD_ID = '00000000-0000-4000-8000-000000000002';

async function setUp(text = 'hello') {
	const vault: OpenVault = await vaultFromKey(generateVaultKey(), {
		id: '00000000-0000-4000-8000-000000000001',
		kind: 'self',
		partnershipId: null
	});
	const sealed = await sealRecord(note, {
		recordId: RECORD_ID,
		payload: { text },
		vault,
		grant: selfWriteGrant(vault)
	});
	return { vault, row: { recordId: RECORD_ID, ...sealed } };
}

describe('SealedReader', () => {
	it('is a placeholder until vaults are worked out, and unreadable when there is none', async () => {
		const { row } = await setUp();
		const reader = new SealedReader();
		expect(reader.read(note, row, undefined)).toBeUndefined();
		expect(reader.read(note, row, null)).toBeNull();
	});

	it('answers undefined at once, then the payload when it has opened', async () => {
		const { vault, row } = await setUp();
		const reader = new SealedReader();
		expect(reader.read(note, row, vault)).toBeUndefined();
		await vi.waitFor(() => expect(reader.read(note, row, vault)).toEqual({ text: 'hello' }));
	});

	it('reports a tampered record as unreadable, not as a spinner that never stops', async () => {
		const { vault, row } = await setUp();
		const reader = new SealedReader();
		const moved = { ...row, recordId: '00000000-0000-4000-8000-000000000009' };
		reader.read(note, moved, vault);
		await vi.waitFor(() => expect(reader.read(note, moved, vault)).toBeNull());
	});

	/** What makes it usable from a template: the answer is reactive. */
	it('updates a reactive reader when the open lands', async () => {
		const { vault, row } = await setUp('reactive');
		const reader = new SealedReader();
		let seen: unknown = 'not run';
		const stop = $effect.root(() => {
			$effect(() => {
				seen = reader.read(note, row, vault);
			});
		});
		flushSync();
		expect(seen).toBeUndefined();
		await vi.waitFor(() => {
			flushSync();
			expect(seen).toEqual({ text: 'reactive' });
		});
		stop();
	});

	/** A sign-out mid-open must not leave the last account's content in the cache. */
	it('drops an open that lands after it was cleared', async () => {
		const { vault, row } = await setUp();
		const reader = new SealedReader();
		reader.read(note, row, vault);
		reader.clear();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(reader.read(note, row, vault)).toBeUndefined();
	});

	it('opens an edited record afresh', async () => {
		const { vault, row } = await setUp('before');
		const reader = new SealedReader();
		reader.read(note, row, vault);
		await vi.waitFor(() => expect(reader.read(note, row, vault)).toEqual({ text: 'before' }));

		const edited = await sealRecord(note, {
			recordId: RECORD_ID,
			payload: { text: 'after' },
			vault,
			grant: selfWriteGrant(vault)
		});
		const next = { recordId: RECORD_ID, ...edited };
		expect(reader.read(note, next, vault)).toBeUndefined();
		await vi.waitFor(() => expect(reader.read(note, next, vault)).toEqual({ text: 'after' }));
	});
});
