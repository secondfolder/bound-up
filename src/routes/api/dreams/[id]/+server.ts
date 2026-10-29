import { error, json } from '@sveltejs/kit';
import { updateDreamSetupSchema } from '$lib/schemas/dreamApi';
import { dreamsGuard } from '$lib/server/dream-api';
import { deleteDream, describeDreamRefusal, getDream, updateDreamSetup } from '$lib/server/dreams';
import { dreamPicturesPrefix } from '$lib/server/media';
import { createMediaStore } from '$lib/server/media/backend';
import type { RequestHandler } from './$types';

/** One daydream: read it, save its setup (compare-and-swap), or delete it. */
export const GET: RequestHandler = async ({ locals, params }) => {
	const userId = await dreamsGuard(locals);
	const dream = await getDream(locals.db, userId, params.id);
	if (!dream) {
		error(404, 'That daydream is not there any more.');
	}
	return json(dream);
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const userId = await dreamsGuard(locals);
	const parsed = updateDreamSetupSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be saved. Reload and try again.');
	}
	const result = await updateDreamSetup(locals.db, userId, params.id, parsed.data);
	if (!result.ok) {
		const { status, message } = describeDreamRefusal(result.reason);
		error(status, message);
	}
	return json({ revision: result.revision });
};

export const DELETE: RequestHandler = async ({ locals, params, platform }) => {
	const userId = await dreamsGuard(locals);
	if (!(await deleteDream(locals.db, userId, params.id))) {
		error(404, 'That daydream is not there any more.');
	}
	// After the delete, which is what proves it was this user's: its pictures
	// go by prefix, and a failure is logged, never thrown, since what is left
	// is ciphertext whose keys went with the daydream.
	try {
		const store = await createMediaStore({ platform });
		await store.deletePrefix(dreamPicturesPrefix(params.id));
	} catch {
		console.error(`[dreams] could not purge pictures for daydream ${params.id}`);
	}
	return new Response(null, { status: 204 });
};
