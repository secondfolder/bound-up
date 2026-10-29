import { json } from '@sveltejs/kit';
import { acceptDisclosure } from '$lib/server/daydreams';
import { dreamsGuard } from '$lib/server/dream-api';
import type { RequestHandler } from './$types';

/**
 * Accepting that what the user writes goes to a model provider. The same
 * acceptance the first engine asks for, because it is the same provider on
 * the same terms (docs/dreams.md, "What the server sees").
 */
export const POST: RequestHandler = async ({ locals }) => {
	const userId = await dreamsGuard(locals);
	await acceptDisclosure(locals.db, userId);
	return json({ ok: true });
};
