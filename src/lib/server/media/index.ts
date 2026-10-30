/**
 * Where encrypted attachments live.
 *
 * An interface with two real implementations, for the reason
 * `src/lib/server/db/backend.ts` gives about the database: `svelte.config.js`
 * strips the Cloudflare adapter's `emulate` hook, so `vite dev` has no
 * `event.platform` at all and therefore no R2 binding. Workers gets R2; dev and
 * the self-hosted Node build get a local directory. See `backend.ts` for the
 * switch.
 *
 * Only the four operations messaging actually needs, so the two are genuinely
 * interchangeable and neither can leak a capability the other lacks — the same
 * reason `db/index.ts` types `Db` as the D1 client and casts the dev one to it.
 */
export type MediaStore = {
	/**
	 * Writes an object. `byteSize` is passed separately because R2 wants a
	 * length for a stream and the caller already knows it.
	 */
	put: (key: string, body: ReadableStream<Uint8Array>, byteSize: number) => Promise<void>;
	get: (key: string) => Promise<{ body: ReadableStream<Uint8Array>; byteSize: number } | null>;
	delete: (keys: string[]) => Promise<void>;
	/** Returns how many objects went. R2 deletes at most 1000 keys per call. */
	deletePrefix: (prefix: string) => Promise<number>;
};

/**
 * The three R2 methods this app uses, hand-declared.
 *
 * `@cloudflare/workers-types` is deliberately not imported, for the reason
 * `app.d.ts` already gives: it publishes its types as ambient globals, and
 * pulling them in would overwrite the DOM's `Request`/`Response`/`fetch` for
 * the whole project — including the component test project.
 */
export type MediaBucket = {
	put: (
		key: string,
		body: ReadableStream<Uint8Array>,
		options?: { httpMetadata?: Record<string, string>; contentLength?: number }
	) => Promise<unknown>;
	get: (key: string) => Promise<{ body: ReadableStream<Uint8Array>; size: number } | null>;
	delete: (keys: string | string[]) => Promise<void>;
	list: (options?: {
		prefix?: string;
		cursor?: string;
		limit?: number;
	}) => Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
};

/**
 * Which top-level prefix an object lives under: whether it self-destructs.
 *
 * The split exists for the bucket's lifecycle rule, which deletes anything
 * under `expiring/` older than 31 days (see docs/development.md, "Deploy
 * setup"). No self-destructing file lives past 30, so everything that rule catches is
 * either expired or an orphan — an object from a send that failed after its
 * files were written but before its rows, which no row points at and the
 * sweep therefore can never find. A lifecycle rule can only match a prefix, so
 * permanent media has to live under a different one.
 */
export const MEDIA_LIFETIMES = ['expiring', 'permanent'] as const;
export type MediaLifetime = (typeof MEDIA_LIFETIMES)[number];

/**
 * Object keys are `<lifetime>/<partnershipId>/<messageId>/<attachmentId>`.
 *
 * Partnership second so that disconnecting can delete a partnership's media
 * one prefix per lifetime, without enumerating rows. The key is still stored
 * on the row, so this layout can change without a migration.
 */
export function attachmentKey(
	lifetime: MediaLifetime,
	partnershipId: string,
	messageId: string,
	attachmentId: string
): string {
	return `${lifetime}/${partnershipId}/${messageId}/${attachmentId}`;
}

/** One lifetime's worth of a partnership's media, for `deletePrefix`. */
export function partnershipMediaPrefix(lifetime: MediaLifetime, partnershipId: string): string {
	return `${lifetime}/${partnershipId}/`;
}

/**
 * Where a daydream's pictures live (docs/daydreams.md, "Pictures"): kept for
 * good, so under `permanent/`, and under one prefix per daydream so deleting
 * it can take them all without listing them. No partnership id is ever
 * `daydreams`, so this can never meet a partnership's prefix. Derived from
 * the ids rather than stored: there is no table of pictures, only the sealed
 * marks that point at them.
 */
export function daydreamPictureKey(daydreamId: string, imageId: string): string {
	return `${daydreamPicturesPrefix(daydreamId)}${imageId}`;
}

/** All of one daydream's pictures, for `deletePrefix`. */
export function daydreamPicturesPrefix(daydreamId: string): string {
	return `permanent/daydreams/${daydreamId}/`;
}

/**
 * Where a daydream of the new engine keeps its pictures (docs/dreams.md,
 * "Pictures"): as the first engine's, kept for good under `permanent/`, one
 * prefix per daydream so deleting it takes them all. No partnership id is
 * ever `dreams`, so this cannot meet a partnership's prefix.
 */
export function dreamPictureKey(dreamId: string, pictureId: string): string {
	return `${dreamPicturesPrefix(dreamId)}${pictureId}`;
}

/** All of one new-engine daydream's pictures, for `deletePrefix`. */
export function dreamPicturesPrefix(dreamId: string): string {
	return `permanent/dreams/${dreamId}/`;
}

/**
 * Where a voice's sample clip is kept (docs/dreams.md, "Voices"): one per
 * Fish voice, model and line, hashed so a Fish id (any characters it likes)
 * makes a safe key, and so changing the model or the line makes new clips
 * rather than serving the old ones. Kept for good, under `permanent/`.
 */
export async function voiceSampleKey(voice: string, model: string, line: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(JSON.stringify([voice, model, line]))
	);
	const hex = [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
	return `permanent/voice-samples/${hex}`;
}

/**
 * Where a notebook entry's versions live (docs/notebook.md, "Versions"): the
 * sealed snapshots, kept for good, so under `permanent/`.
 *
 * A partnership entry's sit under the partnership's own permanent prefix,
 * so disconnecting takes them with everything else `purgePartnershipMedia`
 * deletes, with no step of its own; `notebook` is never a message id, so it
 * cannot meet an attachment's key. A solo entry's sit under its owner. Both
 * are one prefix per entry, so deleting an entry takes its versions without
 * listing them. Derived from the ids rather than stored.
 */
export function notebookSnapshotKey(
	entry: { id: string; ownerId: string | null; partnershipId: string | null },
	versionId: string
): string {
	return `${notebookEntryPrefix(entry)}${versionId}`;
}

/** All of one entry's versions, for `deletePrefix`. */
export function notebookEntryPrefix(entry: {
	id: string;
	ownerId: string | null;
	partnershipId: string | null;
}): string {
	if (entry.partnershipId) {
		return `permanent/${entry.partnershipId}/notebook/${entry.id}/`;
	}
	return `permanent/users/${entry.ownerId}/notebook/${entry.id}/`;
}

/**
 * The shape of a key both implementations will accept.
 *
 * R2 does not care what is in a key, but the local dev store turns separators
 * into directories, where `..` is a path traversal. This is the one place the
 * two implementations are genuinely not equivalent, so the restriction is
 * declared here — against the interface — rather than only in the local store,
 * and `attachmentKey` is built from UUIDs so it always satisfies it.
 */
export const STORAGE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_-]*$/;

export function assertStorageKey(key: string): void {
	if (!STORAGE_KEY_PATTERN.test(key) || key.includes('..')) {
		throw new Error(`Refusing an unsafe storage key: ${JSON.stringify(key)}`);
	}
}
