import {
	EMPTY_FEED,
	feedUrl,
	hasMedia,
	type MediaFeed,
	type MediaSource,
	mergeFeeds,
	parseFeed,
	parseRedgifs,
	REDGIFS_TOKEN_URL,
	redgifsSearchUrl,
	SOURCES,
	sourceKey
} from '$lib/playroom/iq-test/media';
import type { Vibe } from '$lib/playroom/iq-test/settings';

const USER_AGENT = 'BoundUp/1.0 (playroom media)';

/** How long a good answer from a source is served before it is asked again. */
export const MEDIA_TTL_MS = 60 * 60 * 1000;

/** How long a source that failed is left alone before it is tried again. */
export const MEDIA_FAILURE_BACKOFF_MS = 5 * 60 * 1000;

/**
 * How long a host that said 429 is left alone when it did not say for how
 * long. Reddit does say, in `x-ratelimit-reset` (seconds), and that wins.
 */
export const RATE_LIMIT_FALLBACK_MS = 60 * 1000;

/** Redgifs' temporary tokens last a day; renew well before that. */
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

type Host = MediaSource['kind'];
type Entry = { feed: MediaFeed; freshUntil: number };

/**
 * Per-isolate caches.
 *
 * Module-level state is safe here where a `db` or `auth` one is not
 * (invariant 2): it holds public data derived from public feeds, nothing about
 * any user, and losing it costs only a refetch.
 *
 * The cache is per source, not per vibe, so a vibe whose reddit top-up was
 * refused still shows its Redgifs pictures, and picks the reddit ones up on a
 * later request once the host's backoff is over.
 */
const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<MediaFeed>>();
const backoffUntil = new Map<Host, number>();
let redgifsToken: { value: string; freshUntil: number } | null = null;

/**
 * A vibe's pictures, from every source it has that can answer.
 *
 * Never throws and never fails outright: a source that is down, refusing or
 * rate-limited contributes what it last had, or nothing, and the page falls
 * back to effects only if every source is empty.
 */
export async function mediaFor(
	vibe: Vibe,
	fetchFn: typeof fetch,
	now = Date.now()
): Promise<MediaFeed> {
	const feeds = await Promise.all(SOURCES[vibe].map((source) => fromSource(source, fetchFn, now)));
	return mergeFeeds(feeds);
}

function fromSource(source: MediaSource, fetchFn: typeof fetch, now: number): Promise<MediaFeed> {
	const key = sourceKey(source);
	const hit = cache.get(key);
	if (hit && now < hit.freshUntil) {
		return Promise.resolve(hit.feed);
	}
	if (now < (backoffUntil.get(source.kind) ?? 0)) {
		return Promise.resolve(hit?.feed ?? EMPTY_FEED);
	}
	// One fetch per source at a time: a burst of visitors on a cold isolate
	// would otherwise each ask, which is exactly what earns a 429.
	const pending = inFlight.get(key);
	if (pending !== undefined) {
		return pending;
	}
	const refresh = fetchSource(source, fetchFn, now)
		.then((feed) => {
			if (feed !== null && hasMedia(feed)) {
				cache.set(key, { feed, freshUntil: now + MEDIA_TTL_MS });
				return feed;
			}
			const fallback = hit?.feed ?? EMPTY_FEED;
			cache.set(key, { feed: fallback, freshUntil: now + MEDIA_FAILURE_BACKOFF_MS });
			return fallback;
		})
		.finally(() => inFlight.delete(key));
	inFlight.set(key, refresh);
	return refresh;
}

/** One source's pictures, or null when it could not answer. */
async function fetchSource(
	source: MediaSource,
	fetchFn: typeof fetch,
	now: number
): Promise<MediaFeed | null> {
	try {
		if (source.kind === 'reddit') {
			const response = await fetchFn(feedUrl(source.subreddit), {
				headers: { 'user-agent': USER_AGENT, accept: 'application/atom+xml, application/xml' }
			});
			if (!checkRateLimit('reddit', response, now)) {
				return null;
			}
			return response.ok ? parseFeed(await response.text()) : null;
		}
		let response = await searchRedgifs(source.tag, fetchFn, now);
		if (response?.status === 401) {
			// Expired, revoked, or fetched from another address: a token is bound
			// to the address that asked for it ("WrongSender"), and the tunnel
			// fallback changes that address mid-isolate. Asked again at once, on
			// the route the host is now on, so this request is not wasted.
			response = await searchRedgifs(source.tag, fetchFn, now);
		}
		if (response === null || response.status === 401) {
			return null;
		}
		if (!checkRateLimit('redgifs', response, now)) {
			return null;
		}
		return response.ok ? parseRedgifs(await response.json()) : null;
	} catch {
		// A network failure on one source is no reason to drop the others.
		return null;
	}
}

/** False, and the host backed off, when a response is a 429. */
function checkRateLimit(host: Host, response: Response, now: number): boolean {
	if (response.status !== 429) {
		return true;
	}
	const reset = Number(response.headers.get('x-ratelimit-reset'));
	backoffUntil.set(
		host,
		now + (Number.isFinite(reset) && reset > 0 ? reset * 1000 : RATE_LIMIT_FALLBACK_MS)
	);
	return false;
}

/**
 * One Redgifs search with the shared token, null without one. A 401 drops
 * the token it used, unless another search has already replaced it, so the
 * next call asks for a new one rather than every parallel search doing so.
 */
async function searchRedgifs(
	tag: string,
	fetchFn: typeof fetch,
	now: number
): Promise<Response | null> {
	const token = await tokenFor(fetchFn, now);
	if (token === null) {
		return null;
	}
	const response = await fetchFn(redgifsSearchUrl(tag), {
		headers: { 'user-agent': USER_AGENT, authorization: `Bearer ${token}` }
	});
	if (response.status === 401 && redgifsToken?.value === token) {
		redgifsToken = null;
	}
	return response;
}

let tokenRequest: Promise<string | null> | null = null;

/**
 * The anonymous Redgifs token, shared. A vibe's tag searches run in parallel,
 * so on a cold isolate they would each ask for one; they wait on one request
 * instead.
 */
function tokenFor(fetchFn: typeof fetch, now: number): Promise<string | null> {
	if (redgifsToken && now < redgifsToken.freshUntil) {
		return Promise.resolve(redgifsToken.value);
	}
	tokenRequest ??= requestToken(fetchFn, now).finally(() => {
		tokenRequest = null;
	});
	return tokenRequest;
}

async function requestToken(fetchFn: typeof fetch, now: number): Promise<string | null> {
	const response = await fetchFn(REDGIFS_TOKEN_URL, { headers: { 'user-agent': USER_AGENT } });
	if (!(response.ok && checkRateLimit('redgifs', response, now))) {
		return null;
	}
	const body = (await response.json()) as { token?: unknown };
	if (typeof body.token !== 'string') {
		return null;
	}
	redgifsToken = { value: body.token, freshUntil: now + TOKEN_TTL_MS };
	return body.token;
}

/** Forget everything. Tests only: each one starts from a cold cache. */
export function clearMediaCache(): void {
	cache.clear();
	inFlight.clear();
	backoffUntil.clear();
	redgifsToken = null;
	tokenRequest = null;
}
