import { error, json } from '@sveltejs/kit';
import { createDreamSchema } from '$lib/schemas/dreamApi';
import { dreamsGuard } from '$lib/server/dream-api';
import { createDream, describeDreamRefusal, listDreams } from '$lib/server/dreams';
import type { RequestHandler } from './$types';

/**
 * The user's daydreams of the new engine (docs/dreams.md, "Storage"): the
 * list, setups sealed, and making one under an id the browser chose and
 * sealed its setup to.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const userId = await dreamsGuard(locals);
	return json({ dreams: await listDreams(locals.db, userId) });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const userId = await dreamsGuard(locals);
	const parsed = createDreamSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be saved. Reload and try again.');
	}
	const result = await createDream(locals.db, userId, parsed.data.id, parsed.data.setup);
	if (!result.ok) {
		const { status, message } = describeDreamRefusal(result.reason);
		error(status, message);
	}
	return json({ id: parsed.data.id, revision: 0 }, { status: 201 });
};
