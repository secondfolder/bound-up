import { error, json } from '@sveltejs/kit';
import { createTagSchema } from '$lib/schemas/tag';
import { createTag, listTags } from '$lib/server/messaging';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const tags = await listTags(locals.db, params.spaceId, locals.user.id);
	if (!tags) {
		error(404, 'Not found');
	}
	return json({ tags });
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const parsed = createTagSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'Malformed tag');
	}
	const result = await createTag(locals.db, params.spaceId, locals.user.id, parsed.data);
	if (!result.ok) {
		if (result.reason === 'not-a-member') {
			error(404, 'Not found');
		}
		if (result.reason === 'duplicate-name') {
			error(409, 'That tag already exists');
		}
		if (result.reason === 'id-taken') {
			error(409, 'That tag may already have been made. Reload to check.');
		}
		error(400, 'Tag name must contain 1 to 80 characters');
	}
	return json(result.tag, { status: 201 });
};
