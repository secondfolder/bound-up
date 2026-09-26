import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachmentKey, type MediaStore, partnershipMediaPrefix } from './index';
import { createLocalStore } from './local';

let root: string;
let store: MediaStore;

const stream = (bytes: Uint8Array) =>
	new Blob([bytes as BlobPart]).stream() as ReadableStream<Uint8Array>;

async function read(result: Awaited<ReturnType<MediaStore['get']>>): Promise<Uint8Array> {
	if (!result) {
		throw new Error('expected an object');
	}
	return new Uint8Array(await new Response(result.body).arrayBuffer());
}

beforeEach(async () => {
	root = await mkdtemp(path.join(tmpdir(), 'bound-up-media-'));
	store = createLocalStore(root);
});

afterEach(() => rm(root, { recursive: true, force: true }));

describe('createLocalStore', () => {
	it('round-trips bytes under a nested key', async () => {
		const key = attachmentKey('expiring', 'p1', 'm1', 'a1');
		const bytes = new Uint8Array([1, 2, 3, 4]);
		await store.put(key, stream(bytes), 4);
		await expect(read(await store.get(key))).resolves.toEqual(bytes);
	});

	it('is null for something that was never written', async () => {
		await expect(store.get(attachmentKey('expiring', 'p1', 'm1', 'nope'))).resolves.toBeNull();
	});

	// The size is what R2 is given up front, so a mismatch has to be loud here
	// rather than becoming a corrupt object in production.
	it('refuses a body whose length disagrees with the declared size', async () => {
		await expect(
			store.put(attachmentKey('expiring', 'p1', 'm1', 'a1'), stream(new Uint8Array(3)), 4)
		).rejects.toThrow(/Declared 4 bytes but received 3/);
	});

	it('deletes by key, and tolerates deleting what is not there', async () => {
		const key = attachmentKey('expiring', 'p1', 'm1', 'a1');
		await store.put(key, stream(new Uint8Array([9])), 1);
		await store.delete([key, attachmentKey('expiring', 'p1', 'm1', 'absent')]);
		await expect(store.get(key)).resolves.toBeNull();
	});

	it('deletes a whole partnership prefix and reports the count', async () => {
		for (const id of ['a1', 'a2']) {
			await store.put(attachmentKey('expiring', 'p1', 'm1', id), stream(new Uint8Array([1])), 1);
		}
		await store.put(attachmentKey('expiring', 'p2', 'm9', 'a9'), stream(new Uint8Array([1])), 1);

		await expect(store.deletePrefix(partnershipMediaPrefix('expiring', 'p1'))).resolves.toBe(2);
		await expect(store.get(attachmentKey('expiring', 'p1', 'm1', 'a1'))).resolves.toBeNull();
		// The other partnership is untouched.
		await expect(store.get(attachmentKey('expiring', 'p2', 'm9', 'a9'))).resolves.not.toBeNull();
	});

	it('reports zero for a prefix that has nothing under it', async () => {
		await expect(
			store.deletePrefix(partnershipMediaPrefix('expiring', 'never-used'))
		).resolves.toBe(0);
	});

	/**
	 * The one place the local and R2 implementations are genuinely not
	 * equivalent: R2 does not care what is in a key, but here the separators
	 * become directories, so `..` is a path traversal. Keys are built from UUIDs
	 * so this should never fire — which is exactly why it is checked.
	 */
	it('refuses a key that would escape the media root', async () => {
		const outside = path.join(root, '..', 'escaped.txt');
		await writeFile(outside, 'secret').catch(() => {
			// Best effort: the refusal below is what is under test, not this write.
		});
		try {
			for (const key of [
				'../escaped.txt',
				'messages/../../escaped.txt',
				'/etc/passwd',
				'messages/p1/../../../etc/passwd'
			]) {
				await expect(store.put(key, stream(new Uint8Array([1])), 1)).rejects.toThrow();
				await expect(store.get(key)).rejects.toThrow();
			}
			await expect(store.deletePrefix('../')).rejects.toThrow();
		} finally {
			await rm(outside, { force: true });
		}
	});

	it('refuses an empty or oddly-shaped key', async () => {
		for (const key of ['', ' ', 'has space/x', 'weird?key']) {
			await expect(store.put(key, stream(new Uint8Array([1])), 1)).rejects.toThrow();
		}
	});

	it('creates intermediate directories rather than failing', async () => {
		// No mkdir beforehand — put() has to make the tree itself.
		const key = attachmentKey('expiring', 'deep', 'nested', 'file');
		await store.put(key, stream(new Uint8Array([7])), 1);
		await expect(read(await store.get(key))).resolves.toEqual(new Uint8Array([7]));
		// And an existing directory is fine too.
		await mkdir(path.join(root, 'messages', 'deep'), { recursive: true });
		await store.put(
			attachmentKey('expiring', 'deep', 'nested', 'second'),
			stream(new Uint8Array([8])),
			1
		);
	});
});
