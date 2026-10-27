import { error, redirect } from '@sveltejs/kit';
import { CONTEXT_DEPENDENCY } from '$lib/context';
import { neverOpened } from '$lib/messaging';
import { contextSpaceIds } from '$lib/server/context';
import { getRecipientsForPartnership } from '$lib/server/keys';
import { listBoard, listRestoreRequests, listTags } from '$lib/server/messaging';
import type { BoardPartnershipView } from '$lib/types';
import type { PageServerLoad } from './$types';

/** The dependency a board registers for each partnership it shows. */
export function boardDependency(partnershipId: string): string {
	return `messages:board:${partnershipId}`;
}

/**
 * The board's data, for the board and for `/new` (the board with its
 * new-message dialog open), which is the same page on another route. Typed on
 * what it reads, since each route's own event names its own route id.
 *
 * It follows the context (docs/messaging.md, "The board in each context"):
 *
 * - **a partnership**: that partnership's board, as it always was;
 * - **Everyone**: every partnership's threads in one board, from one query,
 *   each sticker saying whose it is;
 * - **Me**: no board at all. Messages are between two people, so the page
 *   offers to switch to a partner rather than switching by itself.
 *
 * Which partnerships those are comes from the context's own spaces, which are
 * the viewer's accepted partnerships and nothing else. No write reads any of
 * it: a new thread names its partnership in its URL.
 */
export async function loadBoard({
	locals,
	depends,
	url
}: Pick<Parameters<PageServerLoad>[0], 'locals' | 'depends' | 'url'>) {
	if (!locals.user) {
		error(401, 'Not signed in');
	}
	const viewerId = locals.user.id;
	depends(CONTEXT_DEPENDENCY);

	const [{ context, spaceIds }, spaces] = await Promise.all([
		contextSpaceIds(locals),
		locals.contextSpaces()
	]);
	const shownIds = spaces
		.filter((space) => space.kind === 'shared' && spaceIds.includes(space.spaceId))
		.map((space) => space.spaceId);
	/** Me: the viewer's own space, where there are no messages to show. */
	const solo =
		context.kind === 'space' &&
		spaces.some((space) => space.kind === 'solo' && space.spaceId === context.spaceId);

	// So a send, or a realtime notification, can refresh just this board.
	for (const id of shownIds) {
		depends(boardDependency(id));
	}

	const [threads, partnerships] = await Promise.all([
		listBoard(locals.db, shownIds, viewerId),
		Promise.all(
			shownIds.map(async (id): Promise<BoardPartnershipView | null> => {
				const [recipients, restoreRequests, tags] = await Promise.all([
					getRecipientsForPartnership(locals.db, id, viewerId),
					listRestoreRequests(locals.db, id, viewerId),
					listTags(locals.db, id, viewerId)
				]);
				// Every account has keys, so a partnership without both is broken
				// data: left off rather than shown as a board that cannot send.
				return recipients ? { id, recipients, restoreRequests, tags: tags ?? [] } : null;
			})
		)
	]);
	const shown = partnerships.filter((partnership) => partnership !== null);
	// One partnership on its own, broken: 404 as the old per-partner board
	// did, rather than an empty board that would look like no messages.
	if (context.kind === 'space' && !solo && shown.length === 0) {
		error(404, 'Partner not found');
	}

	// `?thread=` rings a thread on the board, or goes straight to one the
	// viewer has opened before. Decided here, at tap time, and read off the
	// board rather than queried, so "never opened" means exactly what makes a
	// tile sealed. A thread not on this board (another context's, deleted, or
	// not theirs) is ignored.
	const requested = url.searchParams.get('thread');
	const tapped = requested ? threads.find((thread) => thread.id === requested) : undefined;
	if (tapped && !neverOpened(tapped)) {
		redirect(303, `/messages/${tapped.id}`);
	}

	return {
		// Returned here as well as by the app layout, and this one wins: the
		// switcher must say what the board shows, and a client-side navigation
		// re-runs this load without the layout's.
		context,
		/** `me` for the viewer's own space, which has no messages. */
		view: solo ? ('me' as const) : ('board' as const),
		partnerships: shown,
		threads,
		highlightThreadId: tapped ? tapped.id : null
	};
}
