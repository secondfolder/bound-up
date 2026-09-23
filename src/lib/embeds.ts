import { find as findLinks } from 'linkifyjs';
import { createLimiter } from './concurrency';

/**
 * URL → embed classification, plus the oEmbed fetch with its module cache.
 *
 * Pure string/URL logic only, so it runs anywhere (SSR, the browser, node tests).
 * The fetch half uses global `fetch` and is only ever called from the browser
 * after mount — never during SSR or prerender, so no third-party request
 * happens on the server.
 *
 * Provider strategy: a curated map covers the hosts we care most about
 * (redgifs, reddit, youtube, direct images) with zero third-party calls or
 * keys; everything else goes through noembed.com, a free keyless oEmbed
 * aggregator, and any host it does not know simply stays a plain link.
 * No paid service, no API keys, and failures degrade silently to a link.
 */

export type EmbedSpec =
	| { kind: 'image'; url: string }
	| { kind: 'iframe'; src: string; title: string }
	| { kind: 'oembed'; endpoint: string }
	| { kind: 'server-oembed'; url: string };

export type CachedEmbedDetails = {
	href: string;
	fetchedAt: number;
	kind: 'image' | 'iframe' | 'card';
	providerName: string | null;
	title: string | null;
	description: string | null;
	thumbnailUrl: string | null;
	canonicalUrl: string | null;
	imageUrl: string | null;
	iframeSrc: string | null;
	iframeHeight: number | null;
	faviconUrl: string | null;
	themeColor: string | null;
};

export type ResolvedLinkMatch = {
	value: string;
	href: string;
	start: number;
	end: number;
	embed: EmbedSpec | null;
};

/** Hosts noembed.com is known to cover well; anything else stays a plain link. */
const NOEMBED_HOSTS = new Set([
	'vimeo.com',
	'player.vimeo.com',
	'soundcloud.com',
	'www.soundcloud.com',
	'open.spotify.com',
	'x.com',
	'www.x.com',
	'twitter.com',
	'www.twitter.com',
	'imgur.com',
	'www.imgur.com',
	'tiktok.com',
	'www.tiktok.com',
	'instagram.com',
	'www.instagram.com',
	'dailymotion.com',
	'www.dailymotion.com',
	'twitch.tv',
	'www.twitch.tv',
	'streamable.com',
	'www.streamable.com',
	'bandcamp.com',
	'www.bandcamp.com'
]);

const IMAGE_EXTENSION = /\.(?:jpe?g|png|gif|webp|avif)(?:[?#]|$)/i;
const HTTP_SCHEME = /^https?:\/\//i;
const REDGIFS_PATH = /^\/(?:watch|ifr)\/(?<id>[a-z0-9-]+)/i;
const YOUTUBE_HOST = /(?:^|\.)youtube\.com$/i;
const YOUTUBE_NOCOOKIE_HOST = /(?:^|\.)youtube-nocookie\.com$/i;
const YOUTUBE_SHORTS_PATH = /^\/shorts\/(?<id>[a-zA-Z0-9_-]+)/;
const YOUTUBE_ID = /^[a-zA-Z0-9_-]{6,20}$/;
const REDDIT_HOST = /(?:^|\.)reddit\.com$/i;
const REDDIT_EMBEDDABLE_PATH = /\/(?:comments|s)\//;
const LEADING_WWW = /^www\./;

/**
 * `http:`/`https:` only. Everything else — `javascript:`, `data:`, `vbscript:`
 * — is rejected here so no non-web scheme ever reaches an href or an iframe
 * src. Message text is partner-controlled input; this is the gate.
 */
export function isSafeHttpUrl(href: string): boolean {
	if (!HTTP_SCHEME.test(href)) {
		return false;
	}
	try {
		const url = new URL(href);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

/** `redgifs.com/watch/<id>` (and `/ifr/<id>`) → the documented player iframe. */
function redgifsSpec(url: URL): EmbedSpec | null {
	const match: RegExpExecArray | null = REDGIFS_PATH.exec(url.pathname);
	if (!match) {
		return null;
	}
	const [, id] = match;
	// Redgifs' own embed path. No API call, no key — this is the player they
	// hand out for exactly this purpose.
	return {
		kind: 'iframe',
		src: `https://www.redgifs.com/ifr/${id}`,
		title: 'Redgifs video'
	};
}

function youtubeSpec(url: URL): EmbedSpec | null {
	let id: string | null = null;
	if (url.hostname === 'youtu.be') {
		id = url.pathname.slice(1).split('/')[0] || null;
	} else if (YOUTUBE_HOST.test(url.hostname)) {
		const v = url.searchParams.get('v');
		if (v) {
			id = v;
		} else {
			const shorts: RegExpExecArray | null = YOUTUBE_SHORTS_PATH.exec(url.pathname);
			if (shorts) {
				[, id] = shorts;
			}
		}
	}
	if (!(id && YOUTUBE_ID.test(id))) {
		return null;
	}
	// -nocookie keeps the player off the tracking domain; it is the same player.
	return {
		kind: 'iframe',
		src: `https://www.youtube-nocookie.com/embed/${id}`,
		title: 'YouTube video'
	};
}

/**
 * Reddit embeddable pages: comment threads and share links (the `/r/<sub>/s/<id>`
 * short form the share button produces).
 *
 * Reddit's oEmbed endpoint works but is CORS-blocked, so these resolve
 * through our own `/api/oembed` proxy — which means the URL reaches the
 * server. That is the one place message plaintext touches it at all (see
 * docs/user-commitments-and-product-goals.md), so `UrlEmbed` holds the request until the embed is in or
 * near the scrollport: the lookup happens for embeds a reader actually
 * reaches, not for every reddit link in the thread's history.
 */
function redditSpec(url: URL): EmbedSpec | null {
	if (!REDDIT_HOST.test(url.hostname)) {
		return null;
	}
	if (!REDDIT_EMBEDDABLE_PATH.test(url.pathname)) {
		return null;
	}
	return { kind: 'server-oembed', url: url.href };
}

/**
 * Classify a URL into an embed, or null to leave it as a plain link.
 * The scheme check runs first — see isSafeHttpUrl.
 */
export function embedSpecFor(href: string): EmbedSpec | null {
	if (!isSafeHttpUrl(href)) {
		return null;
	}
	let url: URL;
	try {
		url = new URL(href);
	} catch {
		return null;
	}
	const host = url.hostname.toLowerCase();

	if (host === 'redgifs.com' || host === 'www.redgifs.com') {
		const spec = redgifsSpec(url);
		if (spec) {
			return spec;
		}
		return null;
	}
	if (host === 'youtu.be' || YOUTUBE_HOST.test(host) || YOUTUBE_NOCOOKIE_HOST.test(host)) {
		const spec = youtubeSpec(url);
		if (spec) {
			return spec;
		}
		return null;
	}
	if (REDDIT_HOST.test(host)) {
		const spec = redditSpec(url);
		if (spec) {
			return spec;
		}
		return null;
	}
	// Direct image links embed natively — most often Imgur/i.imgur, but any
	// host serving a known image extension counts.
	if (IMAGE_EXTENSION.test(url.pathname)) {
		return { kind: 'image', url: url.href };
	}
	if (NOEMBED_HOSTS.has(host)) {
		return {
			kind: 'oembed',
			endpoint: `https://noembed.com/embed?url=${encodeURIComponent(url.href)}`
		};
	}
	return null;
}

/**
 * The safe, normalised URLs a piece of text contains, plus their embed class.
 *
 * RichText renders from this, and message-metadata caching reuses the same
 * function so the set of URLs that gets cached cannot drift from the set the
 * UI later tries to render.
 */
export function findRenderableLinks(
	text: string,
	maxEmbeds = Number.POSITIVE_INFINITY
): ResolvedLinkMatch[] {
	const found = findLinks(text).filter(
		(match) => match.type === 'url' && isSafeHttpUrl(match.href)
	);

	const result: ResolvedLinkMatch[] = [];
	let embedsUsed = 0;
	for (const match of found) {
		const embed = embedsUsed < maxEmbeds ? embedSpecFor(match.href) : null;
		if (embed) {
			embedsUsed += 1;
		}
		result.push({
			value: match.value,
			href: match.href,
			start: match.start,
			end: match.end,
			embed
		});
	}
	return result;
}

export type OembedResult = {
	title: string | null;
	providerName: string | null;
	description: string | null;
	thumbnailUrl: string | null;
	/** Raw `html` from the provider. Sanitised before it is ever rendered. */
	html: string | null;
	/** Provider-suggested frame height in px, when it sends one. */
	height: number | null;
	/**
	 * Canonical permalink, sent only by our own proxy (reddit): the resolved
	 * comments URL the client frames directly at embed.reddit.com. The oEmbed
	 * `html` path cannot be used for reddit — its widget script dies in a
	 * sandboxed srcdoc frame and reddit's frame-ancestors rejects srcdoc
	 * parents — so the client frames the permalink instead, the same posture
	 * as the redgifs player.
	 */
	permalink: string | null;
	/**
	 * The URL the post links out to (redgifs video, article, …), sent only by
	 * our proxy from the post's RSS entry. When the client can embed it
	 * natively it does — reddit's own frame serves dead previews for NSFW
	 * posts, so the outbound link is the only way to show the actual media.
	 */
	outbound: string | null;
};

/**
 * Module-level cache: messages re-render on every invalidate() and the board
 * can show the same URL many times, but each URL only needs one fetch per
 * page load. Failures are cached too ('error') so a dead provider is not
 * re-hit for every message.
 */
const oembedCache = new Map<string, OembedResult | 'error'>();

/**
 * How many embed lookups may be in flight at once, across the whole page.
 *
 * One queue shared by the reader's oEmbed fetches, the composer's preview
 * lookups and the thread's metadata backfill, because they end up at the
 * same providers: pasting a hundred links
 * would otherwise fire a hundred requests at noembed and reddit in the same
 * instant. Three keeps the first screenful quick without hammering anyone.
 * The send path and the refresh button deliberately skip it — someone is
 * waiting on those, so they must not queue behind background previews — and
 * the server caps its own fan-out to the providers.
 */
export const MAX_CONCURRENT_EMBED_REQUESTS = 3;
const embedRequestLimit = createLimiter(MAX_CONCURRENT_EMBED_REQUESTS);

/**
 * How long a queued lookup may hold its slot.
 *
 * Without a cap, three requests that never answer would stall every embed on
 * the page behind them — a failure mode the queue itself introduced, since
 * before it a hung request only ever held up its own embed. A timed-out
 * lookup fails like any other, and is remembered like any other failure.
 */
export const EMBED_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Runs `task` with a signal that aborts after `EMBED_REQUEST_TIMEOUT_MS`.
 *
 * Built from `setTimeout` rather than `AbortSignal.timeout`, so the timer is
 * cleared as soon as the task settles and follows fake timers in tests.
 */
async function withRequestTimeout<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(
		() => controller.abort(new DOMException('Embed lookup timed out', 'TimeoutError')),
		EMBED_REQUEST_TIMEOUT_MS
	);
	try {
		return await task(controller.signal);
	} finally {
		clearTimeout(timer);
	}
}

export function cachedOembed(endpoint: string): OembedResult | 'error' | undefined {
	return oembedCache.get(endpoint);
}

export async function fetchOembed(endpoint: string): Promise<OembedResult | 'error'> {
	const cached = oembedCache.get(endpoint);
	if (cached) {
		return cached;
	}
	try {
		// The body is read inside the queued task so a slot is held until the
		// response is fully in, not only until its headers are.
		const data: unknown = await embedRequestLimit(() =>
			withRequestTimeout(async (signal) => {
				const response = await fetch(endpoint, {
					headers: { accept: 'application/json' },
					signal
				});
				if (!response.ok) {
					throw new Error(`oembed ${response.status}`);
				}
				return response.json();
			})
		);
		if (typeof data !== 'object' || data === null || !('html' in data || 'title' in data)) {
			throw new Error('oembed payload unrecognised');
		}
		const record = data as Record<string, unknown>;
		const result: OembedResult = {
			title: typeof record.title === 'string' ? record.title : null,
			providerName: typeof record.provider_name === 'string' ? record.provider_name : null,
			description: typeof record.description === 'string' ? record.description : null,
			thumbnailUrl:
				typeof record.thumbnail_url === 'string' && isSafeHttpUrl(record.thumbnail_url)
					? record.thumbnail_url
					: null,
			// The html is partner-influenced third-party input; UrlEmbed runs it
			// through DOMPurify before it touches the DOM.
			html: typeof record.html === 'string' ? record.html : null,
			height: typeof record.height === 'number' ? record.height : null,
			permalink:
				typeof record.permalink === 'string' && isSafeHttpUrl(record.permalink)
					? record.permalink
					: null,
			outbound:
				typeof record.outbound === 'string' && isSafeHttpUrl(record.outbound)
					? record.outbound
					: null
		};
		oembedCache.set(endpoint, result);
		return result;
	} catch {
		// Swallowed on purpose: the caller falls back to a plain link, and
		// logging would trip the e2e console-error net for an expected
		// third-party outage.
		oembedCache.set(endpoint, 'error');
		return 'error';
	}
}

/**
 * Why a preview lookup came back empty, in words a reader can be shown.
 *
 * Thrown by `requestEmbedMetadata` so the one caller that surfaces failures —
 * the reader's Show button, which inserts a card titled with the reason —
 * has something better than "it did not work". Everyone else catches it and
 * degrades to a plain link as before.
 */
export class EmbedLookupError extends Error {}

function requestEmbedMetadata(urls: string[], queued: boolean): Promise<CachedEmbedDetails[]> {
	const request = async (signal?: AbortSignal) => {
		let response: Response;
		try {
			response = await fetch('/api/embed-metadata', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ urls }),
				signal
			});
		} catch (error) {
			throw new EmbedLookupError(
				error instanceof DOMException && error.name === 'TimeoutError'
					? 'Timed out loading this preview'
					: "Couldn't reach the server to load this preview",
				{ cause: error }
			);
		}
		if (!response.ok) {
			// SvelteKit's `error()` answers with `{ message }`; use it when there is
			// one, since "Not signed in" says more than a bare 401.
			const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
			const reason =
				typeof body?.message === 'string' && body.message
					? body.message
					: `HTTP ${response.status}`;
			throw new EmbedLookupError(`Couldn't load this preview (${reason})`);
		}
		// Read inside the queued task so the slot is held until the body is in,
		// not only until the headers are.
		const result = (await response.json().catch(() => null)) as {
			embeds?: CachedEmbedDetails[];
		} | null;
		if (!(result && Array.isArray(result.embeds))) {
			throw new EmbedLookupError("Couldn't load this preview (unexpected response)");
		}
		return result.embeds;
	};
	// Only a queued request holds a slot others are waiting for, so only it
	// needs the timeout.
	return queued ? embedRequestLimit(() => withRequestTimeout(request)) : request();
}

/**
 * Preview details for URLs, resolved by our own endpoint.
 *
 * The one place `/api/embed-metadata` is called from. Uncached on purpose:
 * the send path wants what is true now, and the refresh button exists to
 * replace a cached entry — handing either a remembered answer would defeat
 * them. `fetchEmbedDetails` is the cached, one-URL form for the composer.
 *
 * `queued` puts the request through the page-wide embed queue; see
 * `MAX_CONCURRENT_EMBED_REQUESTS` for who uses it and who does not.
 */
export async function fetchEmbedMetadata(
	urls: string[],
	{ queued = false }: { queued?: boolean } = {}
): Promise<CachedEmbedDetails[]> {
	if (urls.length === 0) {
		return [];
	}
	try {
		return await requestEmbedMetadata(urls, queued);
	} catch {
		// Same posture as the oEmbed fetch: a preview that cannot be resolved
		// degrades to a plain link rather than to a console error.
		return [];
	}
}

/** One URL's preview, or why there is not one. */
export type EmbedDetailsResult =
	| { ok: true; details: CachedEmbedDetails }
	| { ok: false; error: string };

/**
 * Details for one URL, remembered for the page.
 *
 * The composer draws the same card the reader will, which means resolving the
 * same details the send path is about to cache. The promise is cached rather
 * than its result, so an embed that is removed and put back does not ask
 * twice, and neither do two editors showing the same link. Failures are
 * remembered too, for the same reason `oembedCache` remembers them: a dead
 * provider should not be asked again for every copy of the link on the page.
 */
const embedDetailsCache = new Map<string, Promise<EmbedDetailsResult>>();

export function fetchEmbedDetailsResult(url: string): Promise<EmbedDetailsResult> {
	const cached = embedDetailsCache.get(url);
	if (cached !== undefined) {
		return cached;
	}
	const pending = requestEmbedMetadata([url], true).then(
		(embeds): EmbedDetailsResult => {
			const details = embeds.find((embed) => embed.href === url);
			// The endpoint leaves out a URL its provider could not describe,
			// without saying why — so this is as specific as it can be.
			return details
				? { ok: true, details }
				: { ok: false, error: 'No preview is available for this link' };
		},
		(error: unknown): EmbedDetailsResult => ({
			ok: false,
			error: error instanceof EmbedLookupError ? error.message : "Couldn't load this preview"
		})
	);
	embedDetailsCache.set(url, pending);
	return pending;
}

/** `fetchEmbedDetailsResult` for callers that only care whether it worked. */
export async function fetchEmbedDetails(url: string): Promise<CachedEmbedDetails | null> {
	const result = await fetchEmbedDetailsResult(url);
	return result.ok ? result.details : null;
}

/**
 * A card that says why a preview could not be loaded.
 *
 * Shaped as ordinary cached details so `UrlEmbed` draws it like any other
 * card, with the reason as its title and the link's host as its provider.
 * Anything the URL alone can still draw — a direct image, a curated player —
 * appears under it, because a `card` entry leaves those to the spec.
 */
export function embedErrorDetails(url: string, error: string): CachedEmbedDetails {
	let host: string | null = null;
	try {
		host = new URL(url).hostname.replace(LEADING_WWW, '');
	} catch {
		// Left null: the title is the part that matters.
	}
	return {
		href: url,
		fetchedAt: Date.now(),
		kind: 'card',
		providerName: host,
		title: error,
		description: null,
		thumbnailUrl: null,
		canonicalUrl: null,
		imageUrl: null,
		iframeSrc: null,
		iframeHeight: null,
		faviconUrl: null,
		themeColor: null
	};
}

/** Test hook: clear the module caches between cases. */
export function clearOembedCache(): void {
	oembedCache.clear();
	embedDetailsCache.clear();
}
