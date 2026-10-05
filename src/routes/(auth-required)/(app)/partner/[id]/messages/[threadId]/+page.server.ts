import { error } from '@sveltejs/kit';
import { getRecipientsForPartnership } from '$lib/server/keys';
import {
	getThread,
	listTags,
	markThreadOpened,
	requireThreadMembership
} from '$lib/server/messaging';
import { createNotifier } from '$lib/server/realtime/backend';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, depends, platform }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	// The thread id is re-joined against this partnership rather than trusted:
	// being in *a* partnership is not being in *this* one.
	const membership = await requireThreadMembership(
		locals.db,
		params.id,
		params.threadId,
		locals.user.id
	);
	if (!membership) {
		error(404, 'Not found');
	}

	depends(`messages:thread:${params.threadId}`);

	/**
	 * A load that writes, which is unusual enough to justify.
	 *
	 * Opening the thread *is* the read event — there is no separate gesture to
	 * hang an action on, and doing it from a client `fetch` after hydration
	 * would lose the read for anyone who taps in and straight back out again.
	 *
	 * Awaited, alongside the reads so it costs no extra round trip. It used to
	 * be left running after the response, so as not to make anyone wait on a
	 * write, and that lost reads: Workers may cancel work a request does not
	 * wait for, and going straight back to the board could load it before the
	 * write landed. Either way a thread just read showed as unread. Locally the
	 * Node server always let it finish, so only the deployed app showed it.
	 *
	 * A failure is logged rather than failing the page: the thread stays
	 * unread, which opening it again fixes.
	 */
	const [thread, recipients, tags, readMoved] = await Promise.all([
		getThread(locals.db, params.threadId, membership.icon, locals.user.id),
		getRecipientsForPartnership(locals.db, params.id, locals.user.id),
		listTags(locals.db, params.id, locals.user.id),
		markThreadOpened(locals.db, params.threadId, locals.user.id).catch((cause: unknown) => {
			console.error('could not mark thread read', cause);
			return false;
		})
	]);

	// Tells a partner with this thread open that their read receipt moved.
	// Only when it did: this load re-runs on every event about the thread,
	// `read` included, so publishing on every open would have two open pages
	// answering each other for ever. Awaited for the same reason the write is;
	// `publish` never throws.
	if (readMoved) {
		const notifier = await createNotifier({ platform });
		await notifier.publish(params.id, { kind: 'read', threadId: params.threadId });
	}

	// Every account has keys, so a partnership without both is broken data.
	if (!recipients) {
		error(404, 'Partner not found');
	}

	return {
		partner: {
			id: membership.partnership.id,
			name: membership.partnership.partnerName,
			// For the read receipt's avatar.
			image: membership.partnership.counterpart?.image ?? null
		},
		thread,
		tags: tags ?? [],
		recipients
	};
};
