import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { assertStorageKey, type MediaStore } from './index';

const TRAILING_SLASH = /\/$/;

/**
 * The local store, plus the one thing only it needs: R2 expires the
 * `expiring/` prefix with a bucket lifecycle rule, and a directory has no such
 * thing, so the self-hosted sweep calls `deleteOlderThan` instead. See
 * `self-hosted/sweep.ts`.
 */
export type LocalMediaStore = MediaStore & {
	/**
	 * Removes every file under `prefix` last modified before `cutoff`, and
	 * returns how many went. Leftover `.tmp-` files from an interrupted upload
	 * are files like any other, so they go too.
	 */
	deleteOlderThan: (prefix: string, cutoff: Date) => Promise<number>;
};

/**
 * Encrypted attachments in a local directory: `vite dev`, and the self-hosted
 * server, where the directory is a Docker volume.
 *
 * Exists so that `npm run dev` needs no Cloudflare account and no R2 bucket,
 * exactly as `db/backend.ts` does for the database. It is imported only from
 * inside a `if (dev || __SELF_HOSTED__)` branch, so `node:fs` is
 * dead-code-eliminated from the worker bundle.
 *
 * Streamed in both directions. It used to buffer each upload whole, which was
 * tolerable only while this was dev-only; self-hosted, a 25 MB message times
 * a few concurrent senders is real memory. A write goes to a temp file beside
 * the target and is renamed into place once its length checks out, so a
 * reader never sees half an attachment and a failed upload leaves nothing.
 */
export function createLocalStore(root: string): LocalMediaStore {
	/**
	 * Turns a key into a path under `root`.
	 *
	 * The key check is the one place the two implementations are genuinely NOT
	 * equivalent: R2 does not care what is in a key, but here the separators
	 * become directories, so a `..` in a key is a path traversal. Keys are built
	 * from UUIDs by `attachmentKey`, so this should never fire — which is
	 * exactly why it must be checked rather than assumed.
	 */
	function resolve(key: string): string {
		assertStorageKey(key);
		const full = path.resolve(root, key);
		// Belt and braces: even with the key check, refuse anything that has
		// escaped the root.
		if (!full.startsWith(path.resolve(root) + path.sep)) {
			throw new Error(`Refusing a storage key that escapes the media root: ${key}`);
		}
		return full;
	}

	/** A prefix is always `<lifetime>/` or `<lifetime>/<id>/`, i.e. a directory. */
	function resolvePrefix(prefix: string): string {
		const directory = path.resolve(root, prefix.replace(TRAILING_SLASH, ''));
		if (!directory.startsWith(path.resolve(root) + path.sep)) {
			throw new Error(`Refusing a prefix that escapes the media root: ${prefix}`);
		}
		return directory;
	}

	/** Every file under a directory, or none if it does not exist. */
	async function filesUnder(directory: string): Promise<string[]> {
		try {
			const entries = await readdir(directory, { recursive: true, withFileTypes: true });
			return entries
				.filter((entry) => entry.isFile())
				.map((entry) => path.join(entry.parentPath, entry.name));
		} catch (error) {
			if ((error as { code?: string }).code === 'ENOENT') {
				return [];
			}
			throw error;
		}
	}

	return {
		async put(key, body, byteSize) {
			const full = resolve(key);
			await mkdir(path.dirname(full), { recursive: true });
			const temp = `${full}.tmp-${randomUUID()}`;
			const file = await open(temp, 'wx');
			let received = 0;
			try {
				const reader = body.getReader();
				for (;;) {
					const { done, value } = await reader.read();
					if (done) {
						break;
					}
					received += value.length;
					// Stop reading as soon as it is over: nothing past the declared
					// size is worth writing to disk.
					if (received > byteSize) {
						await reader.cancel();
						break;
					}
					await file.write(value);
				}
			} catch (error) {
				await file.close();
				await rm(temp, { force: true });
				throw error;
			}
			await file.close();
			if (received !== byteSize) {
				await rm(temp, { force: true });
				throw new Error(`Declared ${byteSize} bytes but received ${received}`);
			}
			await rename(temp, full);
		},

		async get(key) {
			const full = resolve(key);
			try {
				const { size } = await stat(full);
				return {
					body: Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>,
					byteSize: size
				};
			} catch (error) {
				if ((error as { code?: string }).code === 'ENOENT') {
					return null;
				}
				throw error;
			}
		},

		async delete(keys) {
			for (const key of keys) {
				await rm(resolve(key), { force: true });
			}
		},

		async deletePrefix(prefix) {
			// Counts the files it is about to remove and then drops the tree.
			const directory = resolvePrefix(prefix);
			const deleted = (await filesUnder(directory)).length;
			await rm(directory, { recursive: true, force: true });
			return deleted;
		},

		async deleteOlderThan(prefix, cutoff) {
			let deleted = 0;
			for (const file of await filesUnder(resolvePrefix(prefix))) {
				const { mtime } = await stat(file);
				if (mtime < cutoff) {
					await rm(file, { force: true });
					deleted += 1;
				}
			}
			return deleted;
		}
	};
}
