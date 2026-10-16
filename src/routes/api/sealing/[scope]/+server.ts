import { error, json } from '@sveltejs/kit';
import { sealedContentSchema } from '$lib/schemas/sealing';
import {
	type ContentScope,
	listUnsealedContent,
	sealUnsealedContent
} from '$lib/server/content-sealing';
import { isClientId } from '$lib/vault';
import type { RequestHandler } from './$types';

/**
 * Sealing tasks and rewards written before sealing existed, in one scope:
 * `self`, or a partnership's id. See `server/content-sealing.ts`.
 */

function scopeOf(param: string): ContentScope {
	if (param === 'self') {
		return { kind: 'self' };
	}
	if (isClientId(param)) {
		return { kind: 'partnership', partnershipId: param };
	}
	error(404, 'Not found');
}

export const GET: RequestHandler = async ({ locals, params, url }) => {
	// Endpoints carry their own auth check: see /api/keys/unlock-bundle.
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const page = await listUnsealedContent(locals.db, locals.user.id, scopeOf(params.scope), {
		tasks: url.searchParams.get('tasks'),
		completions: url.searchParams.get('completions'),
		rewards: url.searchParams.get('rewards'),
		claims: url.searchParams.get('claims')
	});
	if (!page) {
		error(404, 'Not found');
	}
	return json(page);
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const parsed = sealedContentSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, 'Malformed request');
	}
	const result = await sealUnsealedContent(
		locals.db,
		locals.user.id,
		scopeOf(params.scope),
		parsed.data
	);
	if (!result.ok) {
		error(result.reason === 'not-found' ? 404 : 400, result.reason);
	}
	return json({ sealed: result.sealed });
};
