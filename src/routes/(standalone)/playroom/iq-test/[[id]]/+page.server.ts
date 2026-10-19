import { error } from '@sveltejs/kit';
import { DIALOG_SEEN_COOKIE } from '$lib/playroom/iq-test/device';
import { readDebugMode } from '$lib/server/debug';
import { getIqTestResult, listIqTestResults } from '$lib/server/iq-test';
import { verifySharedResult } from '$lib/server/iq-test-share';
import type { IqTestResultView } from '$lib/types';
import type { PageServerLoad } from './$types';

/** An account result's id. Anything else in the URL is read as a shared token. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A result opened by its link: `isMine` when the viewer took it. A token's
 * result is no one's as far as the server can tell — the page decides that
 * from the device's own history.
 */
export type SharedResultView = { result: IqTestResultView; isMine: boolean };

/**
 * Public: the test needs no account. A signed-in visitor gets their saved
 * history; a signed-out one gets null, and the page shows what this device
 * kept instead.
 *
 * `dialogSeen` decides whether the page is first rendered under the setup
 * dialog: not again after it has been dealt with in this browser session, and
 * never over a result opened by its link, which is shown first.
 *
 * With an `id`, the page is that result's own: an account's result by its
 * UUID, or a signed-out one carried in a signed token (see
 * `iq-test-share.ts`). Either way a link to nothing is a 404, so a result
 * that was deleted, or a token edited by hand, does not open.
 */
export const load: PageServerLoad = async ({ locals, cookies, params }) => {
	const shared = params.id ? await sharedResult(locals, params.id) : null;
	const dialogSeen = shared !== null || cookies.get(DIALOG_SEEN_COOKIE) === '1';
	if (!locals.user) {
		return { history: null, dialogSeen, debug: false, shared };
	}
	const [history, debug] = await Promise.all([
		listIqTestResults(locals.db, locals.user.id),
		// Debug mode shows the testing aids (docs/debug-mode.md). The test is
		// marked in the browser and nothing on the server depends on a score
		// being honest, so there is nothing here to enforce beyond whether
		// they are shown.
		readDebugMode(locals.db, locals.user.id, cookies)
	]);
	return { history, dialogSeen, debug, shared };
};

async function sharedResult(locals: App.Locals, id: string): Promise<SharedResultView> {
	if (UUID.test(id)) {
		const found = await getIqTestResult(locals.db, id.toLowerCase(), locals.user?.id ?? null);
		if (!found) {
			error(404, 'That result is not here any more.');
		}
		return found;
	}
	const result = await verifySharedResult((await locals.auth.$context).secret, id);
	if (!result) {
		error(404, 'That result link is not valid.');
	}
	return { result: { ...result, id, shareToken: id }, isMine: false };
}
