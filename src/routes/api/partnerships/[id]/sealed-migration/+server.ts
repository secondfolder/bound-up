import { error, json } from '@sveltejs/kit';
import { sealedMigrationSchema } from '$lib/schemas/messageForm';
import { listLegacyMessages, sealLegacyMessages } from '$lib/server/messaging';
import type { RequestHandler } from './$types';

/**
 * Moving a partnership's messages from the original scheme into its vault.
 *
 * Run by either partner's device in the background (`messaging/vault-migration.ts`),
 * and by the helping partner before a restore. `GET` hands out rows still in
 * the original scheme — every one is encrypted to both partners, so nothing
 * here is something the caller could not already read — and `POST` writes
 * back sealed copies, once each. See `sealLegacyMessages` for what bounds it.
 */

export const GET: RequestHandler = async ({ locals, params, url }) => {
	// Endpoints carry their own auth check: see /api/keys/unlock-bundle.
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const page = await listLegacyMessages(locals.db, {
		partnershipId: params.id,
		actorId: locals.user.id,
		messagesAfter: url.searchParams.get('messagesAfter'),
		reactionsAfter: url.searchParams.get('reactionsAfter')
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
	const parsed = sealedMigrationSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		error(400, parsed.error.issues[0]?.message ?? 'Malformed migration');
	}
	const result = await sealLegacyMessages(locals.db, {
		partnershipId: params.id,
		actorId: locals.user.id,
		...parsed.data
	});
	if (!result.ok) {
		error(result.reason === 'not-a-member' ? 404 : 400, result.reason);
	}
	return json({ sealed: result.sealed });
};
