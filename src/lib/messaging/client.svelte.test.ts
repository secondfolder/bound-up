import { describe, expect, it, vi } from 'vitest';
import { testSealedRef } from '$lib/testing/sealed-refs';
import type { MessageBodyRef } from '$lib/types';
import { openedMessage, openedMessageMetadata } from './client';

// Opened by record id (sealed-refs.ts): what is under test is what is done
// with an opened record, not the opening.
vi.mock('$lib/crypto/sealed', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/crypto/sealed')>()),
	openRecord: (await import('$lib/testing/sealed-refs')).openTestRecord
}));
vi.mock('$lib/crypto/vaults.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/crypto/vaults.svelte')>()),
	vaultById: (id: string) => ({ id })
}));

function body(text: string, metadata?: object): MessageBodyRef {
	const id = crypto.randomUUID();
	const sealed = testSealedRef({ text, attachments: [] }, id);
	const sidecar = metadata ? testSealedRef(metadata, id) : null;
	return {
		id,
		ciphertext: sealed.ciphertext,
		vaultId: sealed.vaultId,
		payloadVersion: 1,
		metadataCiphertext: sidecar?.ciphertext ?? null,
		metadataVersion: sidecar ? 1 : null
	};
}

describe('openedMessage', () => {
	it('is a placeholder until the body opens, then the payload with its version', async () => {
		const ref = body('hello');
		expect(openedMessage(ref)).toBeUndefined();
		await vi.waitFor(() =>
			expect(openedMessage(ref)).toEqual({ version: 1, text: 'hello', attachments: [] })
		);
	});

	/**
	 * A screen re-derives on every `invalidate()`. A fresh payload each time
	 * would rerun everything that depends on it — an attachment preview's
	 * download among them — for every message on every refresh.
	 */
	it('hands back the same payload every time it is asked', async () => {
		const ref = body('hello', { embeds: [] });
		await vi.waitFor(() => expect(openedMessage(ref)).toBeDefined());
		expect(openedMessage({ ...ref })).toBe(openedMessage(ref));
		await vi.waitFor(() => expect(openedMessageMetadata(ref)).toBeDefined());
		expect(openedMessageMetadata({ ...ref })).toBe(openedMessageMetadata(ref));
	});

	it('reads a row with no vault as unreadable, since nothing writes one', () => {
		expect(openedMessage({ ...body('hello'), vaultId: null, payloadVersion: null })).toBeNull();
	});
});
