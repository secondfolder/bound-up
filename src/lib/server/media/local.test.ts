import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachmentKey, type MediaStore, partnershipMediaPrefix } from './index';
import { createLocalStore, type LocalMediaStore } from './local';

let root: string;
let store: LocalMediaStore;

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

	// Streamed rather than buffered, so a body arrives in pieces; the file has
	// to be every piece, in order.
	it('round-trips a body that arrives in many chunks', async () => {
		const key = attachmentKey('permanent', 'p1', 'm1', 'a1');
		const chunks = Array.from({ length: 50 }, (_, i) => new Uint8Array(1000).fill(i));
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(chunk);
				}
				controller.close();
			}
		});
		await store.put(key, body, 50_000);
		const result = await store.get(key);
		expect(result?.byteSize).toBe(50_000);
		const bytes = await read(result);
		expect(bytes.length).toBe(50_000);
		expect(bytes[0]).toBe(0);
		expect(bytes[49_999]).toBe(49);
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

	// A failed upload must leave nothing behind: not the target, which a reader
	// would serve as a truncated attachment, and not the temp file either.
	it('leaves no file at all after a short or an overlong body', async () => {
		const key = attachmentKey('expiring', 'p1', 'm1', 'a1');
		await expect(store.put(key, stream(new Uint8Array(3)), 4)).rejects.toThrow();
		await expect(store.put(key, stream(new Uint8Array(5)), 4)).rejects.toThrow(/Declared 4/);
		await expect(store.get(key)).resolves.toBeNull();
		await expect(readdir(path.join(root, 'expiring', 'p1', 'm1'))).resolves.toEqual([]);
	});

	it('leaves no file behind when the body itself fails midway', async () => {
		const key = attachmentKey('expiring', 'p1', 'm1', 'a1');
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array([1, 2]));
				controller.error(new Error('connection dropped'));
			}
		});
		await expect(store.put(key, body, 4)).rejects.toThrow(/connection dropped/);
		await expect(readdir(path.join(root, 'expiring', 'p1', 'm1'))).resolves.toEqual([]);
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

	// Stands in for the R2 lifecycle rule on `expiring/`, so it must take only
	// what is old enough and only under the prefix it was given.
	it('deletes files older than the cutoff under a prefix, and nothing else', async () => {
		const old = attachmentKey('expiring', 'p1', 'm1', 'old');
		const fresh = attachmentKey('expiring', 'p1', 'm1', 'fresh');
		const kept = attachmentKey('permanent', 'p1', 'm1', 'old');
		for (const key of [old, fresh, kept]) {
			await store.put(key, stream(new Uint8Array([1])), 1);
		}
		const longAgo = new Date('2020-01-01T00:00:00Z');
		await utimes(path.join(root, old), longAgo, longAgo);
		await utimes(path.join(root, kept), longAgo, longAgo);

		await expect(
			store.deleteOlderThan('expiring/', new Date('2021-01-01T00:00:00Z'))
		).resolves.toBe(1);
		await expect(store.get(old)).resolves.toBeNull();
		await expect(store.get(fresh)).resolves.not.toBeNull();
		await expect(store.get(kept)).resolves.not.toBeNull();
	});

	it('finds nothing to age out under a prefix that does not exist yet', async () => {
		await expect(store.deleteOlderThan('expiring/', new Date())).resolves.toBe(0);
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
