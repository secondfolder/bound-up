import { error } from '@sveltejs/kit';
import { firstUnreadMessageId } from '$lib/messaging';
import { getRecipientsForPartnership } from '$lib/server/keys';
import { findThreadMembership, getThread, listTags, openThread } from '$lib/server/messaging';
import { createNotifier } from '$lib/server/realtime/backend';
import { publishMessagingEvent } from '$lib/server/realtime/messaging';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, depends, platform }) => {
	if (!locals.user) {
		error(401, 'Not signed in');
	}

	// The thread's own partnership, never the context's: a link to a thread
	// (a notification's, a sticker's on an Everyone board) means the same
	// thing whatever this device is looking at, and opening it leaves the
	// context alone (docs/contexts.md, "Items carry their own space"). Not
	// being in that partnership is a 404, like no such thread.
	const membership = await findThreadMembership(locals.db, params.threadId, locals.user.id);
	if (!membership) {
		error(404, 'Not found');
	}
	const partnershipId = membership.partnership.id;

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
	 * unread, which opening it again fixes, and opens at its end.
	 *
	 * The mark as it stood before is what says where the thread opens: at the
	 * oldest message after it. That is only true of the first load — every
	 * later one, after a live event, finds the mark just moved — so the page
	 * reads it once, when it opens (`ThreadView`'s `firstUnreadId`).
	 */
	const [thread, recipients, tags, opened] = await Promise.all([
		getThread(locals.db, params.threadId, membership.icon, locals.user.id),
		getRecipientsForPartnership(locals.db, partnershipId, locals.user.id),
		listTags(locals.db, partnershipId, locals.user.id),
		openThread(locals.db, params.threadId, locals.user.id).catch((cause: unknown) => {
			console.error('could not mark thread read', cause);
			return null;
		})
	]);
	const readMoved = opened?.moved ?? false;

	// Tells a partner with this thread open that their read receipt moved.
	// Only when it did: this load re-runs on every event about the thread,
	// `read` included, so publishing on every open would have two open pages
	// answering each other for ever. Awaited for the same reason the write is;
	// `publish` never throws.
	if (readMoved) {
		const notifier = await createNotifier({ platform });
		await publishMessagingEvent(notifier, locals.db, partnershipId, {
			kind: 'read',
			threadId: params.threadId
		});
	}

	// Every account has keys, so a partnership without both is broken data.
	if (!recipients) {
		error(404, 'Partner not found');
	}

	return {
		partner: {
			id: membership.partnership.id,
			names: membership.partnership.names,
			// For the read receipt's avatar.
			image: membership.partnership.counterpart?.image ?? null
		},
		thread,
		firstUnreadId: opened ? firstUnreadMessageId(thread.messages, opened.readUpTo) : null,
		tags: tags ?? [],
		recipients
	};
};
