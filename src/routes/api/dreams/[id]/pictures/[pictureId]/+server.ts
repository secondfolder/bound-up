import { error } from '@sveltejs/kit';
import { MAX_PICTURE_BYTES } from '$lib/daydream/image-prompt';
import { dreamsGuard } from '$lib/server/dream-api';
import { ownsDream } from '$lib/server/dreams';
import { dreamPictureKey } from '$lib/server/media';
import { createMediaStore } from '$lib/server/media/backend';
import { isClientId } from '$lib/vault';
import type { RequestHandler } from './$types';

/**
 * One picture of a daydream, encrypted (docs/dreams.md, "Pictures"). The
 * browser encrypts it under a key of its own and records that key in a
 * sealed detail on the passage: this sees only ciphertext. The id is the
 * browser's and the object's key derives from the daydream and the id, so
 * owning the daydream is the whole check.
 */
export const PUT: RequestHandler = async ({ locals, params, platform, request }) => {
	const userId = await dreamsGuard(locals);
	if (!isClientId(params.pictureId)) {
		error(400, 'That is not a picture id.');
	}
	if (!(await ownsDream(locals.db, userId, params.id))) {
		error(404, 'That daydream is not there any more.');
	}
	// Checked before reading anything: the length is what the store is told.
	const byteSize = Number(request.headers.get('content-length'));
	if (!(Number.isInteger(byteSize) && byteSize > 0)) {
		error(411, 'The picture needs a length.');
	}
	if (byteSize > MAX_PICTURE_BYTES) {
		error(413, 'That picture is too big to keep.');
	}
	if (!request.body) {
		error(400, 'There was no picture.');
	}
	const store = await createMediaStore({ platform });
	await store.put(dreamPictureKey(params.id, params.pictureId), request.body, byteSize);
	return new Response(null, { status: 204 });
};

/** Streams one encrypted picture back. The browser decrypts it. */
export const GET: RequestHandler = async ({ locals, params, platform }) => {
	const userId = await dreamsGuard(locals);
	if (!(isClientId(params.pictureId) && (await ownsDream(locals.db, userId, params.id)))) {
		error(404, 'Not found');
	}
	const store = await createMediaStore({ platform });
	const object = await store.get(dreamPictureKey(params.id, params.pictureId));
	if (!object) {
		error(404, 'Not found');
	}
	return new Response(object.body, {
		headers: {
			'content-type': 'application/octet-stream',
			'content-length': String(object.byteSize),
			'x-content-type-options': 'nosniff',
			// Immutable at a UUID address; `private` because it is owner-gated.
			'cache-control': 'private, max-age=31536000, immutable',
			etag: `"${params.pictureId}"`
		}
	});
};
