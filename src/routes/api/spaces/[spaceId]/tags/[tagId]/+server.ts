import { error, json } from '@sveltejs/kit';
import { updateTagSchema } from '$lib/schemas/tag';
import { updateTag } from '$lib/server/messaging';
import { createNotifier } from '$lib/server/realtime/backend';
import { publishMessagingEvent } from '$lib/server/realtime/messaging';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ locals, params, request, platform }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const parsed = updateTagSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'Malformed tag');
	}
	const result = await updateTag(
		locals.db,
		params.spaceId,
		locals.user.id,
		params.tagId,
		parsed.data
	);
	if (!result.ok) {
		if (result.reason === 'not-a-member' || result.reason === 'no-such-tag') {
			error(404, 'Not found');
		}
		if (result.reason === 'duplicate-name') {
			error(409, 'That tag already exists');
		}
		error(400, 'Invalid tag');
	}
	const notifier = await createNotifier({ platform });
	// Board-level: a renamed or recoloured tag can be on any thread.
	await publishMessagingEvent(notifier, params.spaceId, { kind: 'tags' });
	return json(result.tag);
};
