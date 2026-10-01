import { error, redirect } from '@sveltejs/kit';
import { neverOpened } from '$lib/messaging';
import { getRecipientsForPartnership } from '$lib/server/keys';
import { listBoard, listRestoreRequests, listTags, requireMembership } from '$lib/server/messaging';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, depends, url }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	const membership = await requireMembership(locals.db, params.id, locals.user.id);
	// 404 rather than 403, matching the other partner routes: distinguishing
	// them would confirm the id is real. A pending invite lands here too — there
	// is nobody to message yet.
	if (!membership) {
		error(404, 'Partner not found');
	}

	// So a send, or a realtime notification, can refresh just this board.
	depends(`messages:board:${params.id}`);

	const [threads, recipients, restoreRequests, tags] = await Promise.all([
		listBoard(locals.db, params.id, locals.user.id),
		getRecipientsForPartnership(locals.db, params.id, locals.user.id),
		listRestoreRequests(locals.db, params.id, locals.user.id),
		listTags(locals.db, params.id, locals.user.id)
	]);

	// `?thread=` is where a push notification's tap lands (see
	// `notifyPartner`). Decided here, at tap time, not when the push was sent:
	// a thread opened since, on another device say, goes straight to the
	// thread. One never opened stays on the board, highlighted, so it is first
	// seen as its sealed envelope like every other new thread. Read off the
	// board rather than queried, so "never opened" means exactly what makes a
	// tile sealed. A thread not on this board (deleted, or not theirs) is ignored.
	const requested = url.searchParams.get('thread');
	const tapped = requested ? threads.find((thread) => thread.id === requested) : undefined;
	if (tapped && !neverOpened(tapped)) {
		redirect(303, `/partner/${params.id}/messages/${tapped.id}`);
	}
	const highlightThreadId = tapped ? tapped.id : null;

	// Every account has keys, so a partnership without both is broken data —
	// 404 like the membership check rather than rendering a board that cannot
	// send.
	if (!recipients) {
		error(404, 'Partner not found');
	}

	return {
		partner: {
			id: membership.partnership.id,
			name: membership.partnership.partnerName
		},
		threads,
		tags: tags ?? [],
		// Public keys. `mine` is included so a server that swapped it can be
		// caught, not only a swapped partner key — see docs/encryption.md.
		recipients,
		restoreRequests,
		highlightThreadId
	};
};
