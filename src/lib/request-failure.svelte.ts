/**
 * Telling people when a request failed. See docs/request-failures.md.
 *
 * **Every request the browser sends must end in visible feedback if it
 * fails.** Two kinds of failure, two places:
 *
 * - **Expected** ones — a validation error, a wrong password, a rate limit, a
 *   file too large — are answered next to whatever caused them, by the code
 *   that knows what they mean. That code already exists at each site.
 * - **Unexpected** ones — the server erroring, the network being down, a
 *   timeout — mean the same thing wherever they happen, so they go through
 *   `reportRequestFailure` to one notice the root layout shows
 *   (`RequestFailureNotice.svelte`). A site with an inline message slot may use
 *   `describeRequestFailure` for its wording instead.
 *
 * This exists because a failure used to be silent in more than one place. A
 * signup against a database missing a migration answered 500, and superforms'
 * default `onError` rethrows, so the error went to the console and nothing
 * appeared on the page at all.
 */

export const NETWORK_FAILURE = "Couldn't reach Bound Up. Check your connection and try again.";
export const SERVER_FAILURE = 'Something went wrong on our side. Please try again in a moment.';
export const GENERIC_FAILURE = "That didn't work. Please try again.";

/** What a status means to someone using the app. */
function describeStatus(status: number): string {
	if (status === 0) {
		return NETWORK_FAILURE;
	}
	if (status === 401) {
		return 'You have been signed out. Sign in again, then try that once more.';
	}
	if (status === 403) {
		return "You don't have permission to do that.";
	}
	if (status === 404 || status === 410) {
		return "That isn't there any more. Refresh the page and try again.";
	}
	if (status === 413) {
		return 'That is too large to send.';
	}
	if (status === 429) {
		return 'Too many attempts. Wait a minute, then try again.';
	}
	if (status >= 500) {
		return SERVER_FAILURE;
	}
	return GENERIC_FAILURE;
}

function statusOf(cause: unknown): number | null {
	if (typeof cause === 'object' && cause !== null && 'status' in cause) {
		const { status } = cause as { status: unknown };
		return typeof status === 'number' ? status : null;
	}
	return null;
}

/**
 * Words for a failed request.
 *
 * Takes whatever the failure produced: a `Response`, superforms' error result
 * (which carries a `status`), a thrown error, or `null` from `tryFetch` for a
 * request that never got an answer. A `TypeError` is what `fetch` throws when
 * the network fails, and a `TimeoutError` what `AbortSignal.timeout` does.
 */
function unreachable(cause: unknown): boolean {
	return (
		cause instanceof TypeError || (cause instanceof DOMException && cause.name === 'TimeoutError')
	);
}

export function describeRequestFailure(cause: unknown): string {
	if (cause === null || unreachable(cause)) {
		return NETWORK_FAILURE;
	}
	// superforms and `use:enhance` wrap a submit that never got an answer in an
	// error result, with the thrown error inside and a made-up status outside.
	if (typeof cause === 'object' && 'error' in cause && unreachable(cause.error)) {
		return NETWORK_FAILURE;
	}
	const status = statusOf(cause);
	if (status !== null) {
		return describeStatus(status);
	}
	return GENERIC_FAILURE;
}

/**
 * `fetch` that never throws: a request that got no answer comes back `null`.
 *
 * So `if (!response?.ok)` covers both ways a request fails, and a call site
 * cannot forget the one `fetch` throws for. Not for streaming or anything that
 * wants the rejection's detail.
 */
export async function tryFetch(input: string | URL, init?: RequestInit): Promise<Response | null> {
	try {
		return await fetch(input, init);
	} catch (error) {
		// Aborting on purpose is not a failure anyone needs telling about.
		if (error instanceof DOMException && error.name === 'AbortError') {
			throw error;
		}
		return null;
	}
}

// ── the app-wide notice ──────────────────────────────────────────────────────

type Notice = { message: string; id: number };

let notice = $state<Notice | null>(null);
let nextId = 0;

/** The notice to show, if any. Read by `RequestFailureNotice.svelte`. */
export function currentRequestFailure(): Notice | null {
	return notice;
}

/**
 * Shows the app-wide notice for a failed request.
 *
 * `cause` is anything `describeRequestFailure` takes; `message` replaces the
 * wording when the site knows better what failed. A new failure replaces the
 * one on screen rather than stacking: the latest is the one worth reading.
 */
export function reportRequestFailure(cause: unknown, message?: string): void {
	nextId += 1;
	notice = { message: message ?? describeRequestFailure(cause), id: nextId };
}

export function dismissRequestFailure(): void {
	notice = null;
}
