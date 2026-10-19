import { error } from '@sveltejs/kit';
import { MAX_PICTURE_BYTES } from '$lib/daydream/image-prompt';
import { daydreamGuard } from '$lib/server/daydream/guard';
import { ownsDaydream } from '$lib/server/daydreams';
import { daydreamPictureKey } from '$lib/server/media';
import { createMediaStore } from '$lib/server/media/backend';
import { isClientId } from '$lib/vault';
import type { RequestHandler } from './$types';

/**
 * One daydream picture, encrypted (docs/daydreams.md, "Pictures"). The
 * browser encrypts it under a key of its own (`encryptAttachment`), stores
 * it here, then records that key in a sealed mark on the passage: this sees
 * only ciphertext, and the key never reaches it.
 *
 * The id is the browser's, like an attachment's, and the object's key is
 * derived from the daydream and the id (`daydreamPictureKey`), so ownership
 * of the daydream is the whole of the check: there is no row to join.
 */
export const PUT: RequestHandler = async ({ locals, params, platform, request }) => {
	const userId = await daydreamGuard(locals);
	if (!isClientId(params.imageId)) {
		error(400, 'That is not a picture id.');
	}
	if (!(await ownsDaydream(locals.db, userId, params.id))) {
		error(404, 'That daydream is not there any more.');
	}
	// Checked before reading anything: the length is what the store is told,
	// and a body without one could be any size.
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
	await store.put(daydreamPictureKey(params.id, params.imageId), request.body, byteSize);
	return new Response(null, { status: 204 });
};

/** Streams one encrypted picture back. The browser decrypts it. */
export const GET: RequestHandler = async ({ locals, params, platform }) => {
	const userId = await daydreamGuard(locals);
	if (!isClientId(params.imageId)) {
		error(404, 'Not found');
	}
	if (!(await ownsDaydream(locals.db, userId, params.id))) {
		error(404, 'Not found');
	}
	const store = await createMediaStore({ platform });
	const object = await store.get(daydreamPictureKey(params.id, params.imageId));
	if (!object) {
		error(404, 'Not found');
	}
	return new Response(object.body, {
		headers: {
			// Opaque, as an attachment's: what it is is inside the ciphertext.
			'content-type': 'application/octet-stream',
			'content-length': String(object.byteSize),
			'x-content-type-options': 'nosniff',
			// Immutable at a UUID address; `private` because it is owner-gated.
			'cache-control': 'private, max-age=31536000, immutable',
			etag: `"${params.imageId}"`
		}
	});
};
