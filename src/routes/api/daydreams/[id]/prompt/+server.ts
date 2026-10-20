import { error, json } from '@sveltejs/kit';
import { daydreamGuard } from '$lib/server/daydream/guard';
import { pictureArchitectureFor, readImageConfig } from '$lib/server/daydream/image-config';
import { buildMessages, replyRequestSchema } from '$lib/server/daydream/prompt';
import { ownsDaydream } from '$lib/server/daydreams';
import { requireFeature } from '$lib/server/features';
import type { RequestHandler } from './$types';

/**
 * What the model would be sent for a reply, without sending it: debug mode's
 * "Show prompt" in the Daydreams raw log (docs/debug-mode.md).
 *
 * Takes exactly what `../reply` takes and answers with `buildMessages`, the
 * system prompt and the conversation as the model reads them. It is a rebuild
 * from what the page holds now (the setup as it stands today, say), not a
 * record of what was sent: that is the passage's own `sent`, kept since
 * `daydream-turn` v5 (`$lib/daydream/sent-record.ts`), and this stands in
 * for it on a passage written before.
 *
 * Like `../reply`, it handles what the user wrote in plaintext and so stores,
 * logs and inspects none of it. Unlike it, it never reaches the model, so it
 * costs nothing, needs no disclosure accepted and counts against no limit.
 * Gated on debug mode as well as Daydreams, because the server's prompt is
 * not otherwise something a page is shown.
 */
export const POST: RequestHandler = async ({ locals, params, platform, request }) => {
	const userId = await daydreamGuard(locals);
	await requireFeature(locals.db, userId, 'debugMode');
	if (!(await ownsDaydream(locals.db, userId, params.id))) {
		error(404, 'That daydream is not there any more.');
	}
	const parsed = replyRequestSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'That could not be sent. Reload and try again.');
	}
	return json({
		messages: buildMessages(parsed.data, {
			pictures: pictureArchitectureFor(
				readImageConfig(locals.settings, platform),
				parsed.data.setup.pictures.style
			)
		})
	});
};
