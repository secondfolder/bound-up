import type { Vibe } from './settings';

/**
 * Where the pictures in the porn-showing levels (3 and 4) come from,
 * and how each source's answer is read.
 *
 * Pure and alias-free: the endpoint fetches, this decides what to fetch and
 * what to keep, which is the part worth testing.
 */

/**
 * One place pictures come from.
 *
 * - `redgifs`: a search on Redgifs' own API, or one of its niches (a
 *   community's curated feed, by its slug in `redgifs.com/niches/…`). The
 *   main source: every vibe has tags with thousands of results, and the API
 *   showed no rate limit in use. Each result is a clip (id, SD file, whether
 *   it has sound) plus a poster still; a niche answers in the same shape.
 *   A search is by `tags`, a `query`, or both (see `RedgifsSearch`).
 * - `reddit`: a subreddit's weekly top feed. A top-up only. Unauthenticated,
 *   reddit allows one feed request a minute (`x-ratelimit-remaining: 0` after
 *   a single request, measured), so it cannot carry five vibes on its own —
 *   which is how denial, feminisation and degradation once showed nothing:
 *   whichever vibe asked first got the minute's request.
 */
/**
 * What a Redgifs search asks for: `tags`, a `query`, or both, which must all
 * match.
 *
 * - `tags` is one tag, or a list searched for clips with every one of them,
 *   to narrow a tag too broad on its own: Redgifs reads a comma-separated
 *   list as "all of" (there is no "any of": a repeated `tags=` uses only the
 *   first).
 * - `query` is free text, matched more loosely than a tag: "mind control"
 *   found 4,254 clips where the Mind Control tag had 3,361, taking in
 *   related tags such as Hypnosis (checked 2026-10-22). For a tag too sparse
 *   or too strict on its own.
 */
export type RedgifsSearch =
	| { tags: string | readonly string[]; query?: string }
	| { tags?: string | readonly string[]; query: string };

export type MediaSource =
	| ({ kind: 'redgifs' } & RedgifsSearch)
	| { kind: 'redgifs'; niche: string }
	| { kind: 'reddit'; subreddit: string };

const SHARED_SOURCES: readonly MediaSource[] = [
	{ kind: 'redgifs', tags: ['Caption', 'Goon'] },
	{ kind: 'redgifs', niche: 'rough-sex' },
	{ kind: 'redgifs', niche: 'goonette' },
	{ kind: 'redgifs', niche: 'triple-penetration' },
	{ kind: 'redgifs', niche: 'oil-porn' },
	{ kind: 'redgifs', niche: 'throatfucking' }
];

/**
 * The only sources the media endpoint will fetch, per vibe.
 *
 * A fixed list is what keeps a public, signed-out endpoint from being an open
 * proxy: the only input it takes is a vibe. Change it here; nothing else names
 * a tag or a subreddit. r/degradation and r/humiliation are not here because
 * both answer 404.
 */
export const SOURCES: Record<Vibe, readonly MediaSource[]> = {
	// Gooning itself, and the PMVs gooners loop. Checked 2026-10-11: every
	// tag answers thousands, tagged on theme.
	gooner: [
		...SHARED_SOURCES,
		{ kind: 'redgifs', tags: 'Gooner' },
		{ kind: 'redgifs', tags: ['caption', 'edging'] }
	],
	bambi: [
		...SHARED_SOURCES,
		{ kind: 'redgifs', niche: 'bimbo' },
		{ kind: 'redgifs', tags: ['bimbo', 'hypno'] }
	],
	misogyny: [
		...SHARED_SOURCES,
		{ kind: 'redgifs', niche: 'misogyny' },
		{ kind: 'redgifs', niche: 'cnc' },
		{ kind: 'redgifs', niche: 'real-bdsm' },
		{ kind: 'redgifs', niche: 'face-fucking' },
		{ kind: 'redgifs', tags: ['housewife', 'cleaning'] }
	],
	denial: [
		...SHARED_SOURCES,
		{ kind: 'redgifs', niche: 'female-chastity' },
		{ kind: 'redgifs', tags: 'Chastity' }
	],
	feminisation: [
		...SHARED_SOURCES,
		{ kind: 'redgifs', tags: ['Feminization', 'hypno'] },
		{ kind: 'redgifs', niche: 'feminizing-hypnosis' },
		{ kind: 'redgifs', niche: 'trans-women' }
	],
	degradation: [
		...SHARED_SOURCES,
		{ kind: 'redgifs', niche: 'real-bdsm' },
		{ kind: 'redgifs', niche: 'face-fucking' },
		{ kind: 'redgifs', niche: 'bodywriting' },
		{ kind: 'redgifs', niche: 'cumslut' }
	]
};

/**
 * One Redgifs clip.
 *
 * `video` is the clip's own SD MP4 when the source gave one (a tag search
 * does; a reddit link does not). The page plays that itself, so a global
 * volume can reach it; without one, or if the file is refused, the clip falls
 * back to Redgifs' own player, which has a sound button of its own. See
 * `ClipPlayer.svelte`.
 */
export type Clip = { id: string; video: string | null; sound: boolean };

/** Where a picture or clip was posted: its title, and the page to see it on. */
export type Origin = { title: string; page: string };

export type MediaFeed = {
	/** Image URLs, drawn as plain `<img>`: `i.redd.it` images and Redgifs posters. */
	images: string[];
	clips: Clip[];
	/**
	 * Where each came from, by image URL or `clip:<id>` (`originKey`), for the
	 * link over an item. Missing for one whose source said nothing usable.
	 */
	origins?: Record<string, Origin>;
};

export const EMPTY_FEED: MediaFeed = { images: [], clips: [] };

/** The key an item's origin is kept under: its URL, or a clip's id. */
export function originKey(item: { kind: 'picture' | 'clip'; key: string }): string {
	return item.kind === 'clip' ? `clip:${item.key}` : item.key;
}

/**
 * A title from a third party, as text: entities undone, tags dropped,
 * whitespace folded, and kept short. Undone twice: reddit escapes its
 * titles itself, and the feed's XML escapes them again, so an ampersand
 * arrives as `&amp;amp;`.
 */
function titleFrom(raw: string): string {
	const decode = (escaped: string) =>
		escaped.replace(/&(?:amp|lt|gt|quot|#39|#x27|apos);/g, (entity) => ENTITIES[entity] ?? entity);
	const text = decode(decode(raw))
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > 120 ? `${text.slice(0, 119)}…` : text;
}

const ENTITIES: Record<string, string> = {
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&#39;': "'",
	'&#x27;': "'",
	'&apos;': "'"
};

/**
 * A page to link to, only on the hosts the feeds come from: the link is
 * third-party data, and anything else (a `javascript:` URL, someone's own
 * site) is dropped rather than put in an `href`.
 */
const ORIGIN_PAGE =
	/^https:\/\/(?:www\.)?(?:reddit\.com\/r\/[^\s"<>]+|redgifs\.com\/watch\/[a-z0-9]+)$/i;

function originOf(title: string, page: string): Origin | null {
	const clean = titleFrom(title);
	return ORIGIN_PAGE.test(page) ? { title: clean === '' ? 'Untitled' : clean, page } : null;
}

/** Redgifs' own page for a clip. */
export function redgifsPage(id: string): string {
	return `https://www.redgifs.com/watch/${id}`;
}

/** A stable cache key for a source. */
export function sourceKey(source: MediaSource): string {
	if (source.kind === 'reddit') {
		return `reddit:${source.subreddit}`;
	}
	if ('niche' in source) {
		return `redgifs-niche:${source.niche}`;
	}
	const tags = `redgifs:${tagList(source.tags).join(',')}`;
	return source.query === undefined ? tags : `${tags}?query=${source.query}`;
}

/** The feed URL for one subreddit: this week's top posts, as Atom. */
export function feedUrl(subreddit: string): string {
	return `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top/.rss?t=week`;
}

/** Redgifs' anonymous token, which its search needs. Keyless, valid for a day. */
export const REDGIFS_TOKEN_URL = 'https://api.redgifs.com/v2/auth/temporary';

/** How many results one search asks for. */
export const REDGIFS_PAGE = 40;

/**
 * A search of Redgifs' gifs (its clips), trending first. Text goes in
 * `query=`, not `search_text=`: the API accepts the latter and ignores it,
 * answering every search with the same front page.
 */
export function redgifsGifsSearchUrl(search: RedgifsSearch): string {
	const tags = tagList(search.tags);
	const params = [
		...(tags.length > 0 ? [`tags=${tags.map(encodeURIComponent).join(',')}`] : []),
		...(search.query === undefined ? [] : [`query=${encodeURIComponent(search.query)}`]),
		'order=trending',
		`count=${REDGIFS_PAGE}`
	];
	return `https://api.redgifs.com/v2/gifs/search?${params.join('&')}`;
}

/** A source's tags as a list: none, one, or several that must all match. */
function tagList(tags: string | readonly string[] | undefined): readonly string[] {
	if (tags === undefined) {
		return [];
	}
	return typeof tags === 'string' ? [tags] : tags;
}

/**
 * A niche's feed, hottest first. Not `trending`, which a niche refuses with
 * a 400 ("BadOrder") although its own error message lists it as allowed;
 * `hot` is the nearest it accepts (checked 2026-10-22).
 */
export function redgifsNicheUrl(niche: string): string {
	return `https://api.redgifs.com/v2/niches/${encodeURIComponent(niche)}/gifs?order=hot&count=${REDGIFS_PAGE}`;
}

/** What to ask Redgifs for a source of its: a search or a niche's feed. */
export function redgifsUrl(source: Extract<MediaSource, { kind: 'redgifs' }>): string {
	return 'niche' in source ? redgifsNicheUrl(source.niche) : redgifsGifsSearchUrl(source);
}

/**
 * Full-size images only. `preview.redd.it` is reddit's resized copy, which
 * for NSFW posts is often blurred or dead, and gallery posts only have those —
 * so they are left out rather than shown broken.
 */
const IMAGE = /https:\/\/i\.redd\.it\/[a-z0-9]+\.(?:jpe?g|png|gif|webp)/gi;
const REDGIFS_LINK = /https?:\/\/(?:www\.|v3\.)?redgifs\.com\/(?:watch|ifr)\/(?<id>[a-z0-9]+)/gi;
const REDGIFS_ID = /^[a-z0-9]+$/;
const REDGIFS_POSTER = /^https:\/\/media\.redgifs\.com\/[A-Za-z0-9-]+\.jpg$/;
const REDGIFS_VIDEO = /^https:\/\/media\.redgifs\.com\/[A-Za-z0-9-]+\.mp4$/;

const ENTRY = /<entry>[\s\S]*?<\/entry>/g;
const ENTRY_TITLE = /<title>(?<title>[\s\S]*?)<\/title>/;
const ENTRY_LINK = /<link href="(?<href>[^"]+)"/;

/**
 * Every distinct image and Redgifs id an Atom feed's escaped HTML links to,
 * each with the post it is from: its title, and the post's page (a clip's
 * page is its Redgifs page, which plays it).
 */
export function parseFeed(xml: string): MediaFeed {
	// From the whole feed, whatever its shape; the posts only say where each
	// came from, below.
	const images = new Set<string>();
	for (const [url] of xml.matchAll(IMAGE)) {
		images.add(url);
	}
	const ids = new Set<string>();
	for (const match of xml.matchAll(REDGIFS_LINK)) {
		const id = match.groups?.id;
		if (id) {
			ids.add(id.toLowerCase());
		}
	}
	const origins: Record<string, Origin> = {};
	for (const [entry] of xml.matchAll(ENTRY)) {
		const title: RegExpExecArray | null = ENTRY_TITLE.exec(entry);
		const link: RegExpExecArray | null = ENTRY_LINK.exec(entry);
		const post = originOf(
			title?.groups?.title ?? '',
			(link?.groups?.href ?? '').replace(/&amp;/g, '&')
		);
		if (!post) {
			continue;
		}
		for (const [url] of entry.matchAll(IMAGE)) {
			origins[url] ??= post;
		}
		for (const match of entry.matchAll(REDGIFS_LINK)) {
			const id = match.groups?.id?.toLowerCase();
			const clip = id ? originOf(post.title, redgifsPage(id)) : null;
			if (id && clip) {
				origins[originKey({ kind: 'clip', key: id })] ??= clip;
			}
		}
	}
	// A link carries no file and says nothing about sound: these play in
	// Redgifs' own player.
	return {
		images: [...images],
		clips: [...ids].map((id) => ({ id, video: null, sound: false })),
		origins
	};
}

/**
 * The clips and posters in a Redgifs search answer.
 *
 * Checked field by field rather than trusted: the answer comes from a third
 * party, and only an id that is safe in a path, and a poster and a video on
 * Redgifs' own media host, are passed on to the browser. The video is the SD
 * file: the clips play small, beside or behind a question.
 */
export function parseRedgifs(body: unknown): MediaFeed {
	const gifs = (body as { gifs?: unknown } | null)?.gifs;
	if (!Array.isArray(gifs)) {
		return EMPTY_FEED;
	}
	const images: string[] = [];
	const clips: Clip[] = [];
	const origins: Record<string, Origin> = {};
	for (const entry of gifs as unknown[]) {
		if (typeof entry !== 'object' || entry === null) {
			continue;
		}
		const gif = entry as {
			id?: unknown;
			hasAudio?: unknown;
			description?: unknown;
			userName?: unknown;
			urls?: { poster?: unknown; sd?: unknown } | null;
		};
		const id = typeof gif.id === 'string' && REDGIFS_ID.test(gif.id) ? gif.id : null;
		// Its description if it has one, else who posted it.
		const described = typeof gif.description === 'string' ? titleFrom(gif.description) : '';
		const title =
			described ||
			(typeof gif.userName === 'string' && gif.userName !== '' ? `By ${gif.userName}` : 'Redgifs');
		const origin = id ? originOf(title, redgifsPage(id)) : null;
		const poster = gif.urls?.poster;
		if (typeof poster === 'string' && REDGIFS_POSTER.test(poster)) {
			images.push(poster);
			if (origin) {
				origins[poster] = origin;
			}
		}
		if (id) {
			const video = gif.urls?.sd;
			clips.push({
				id,
				video: typeof video === 'string' && REDGIFS_VIDEO.test(video) ? video : null,
				sound: gif.hasAudio === true
			});
			if (origin) {
				origins[originKey({ kind: 'clip', key: id })] = origin;
			}
		}
	}
	return { images, clips, origins };
}

/**
 * Feeds merged without duplicates, interleaved rather than concatenated, so
 * the first pictures shown are a mix of every source rather than all of the
 * first one.
 */
export function mergeFeeds(feeds: readonly MediaFeed[]): MediaFeed {
	const images = interleave(
		feeds.map((feed) => feed.images),
		(image) => image
	);
	const clips = interleave(
		feeds.map((feed) => feed.clips),
		(clip) => clip.id
	);
	// The same clip can come from a tag search (with its file) and a reddit
	// link (without): keep the one the page can play itself.
	const playable = new Map(
		feeds.flatMap((feed) =>
			feed.clips.filter((clip) => clip.video !== null).map((clip) => [clip.id, clip])
		)
	);
	// The first source to say where an item came from is kept.
	const origins: Record<string, Origin> = {};
	for (const feed of feeds) {
		for (const [key, origin] of Object.entries(feed.origins ?? {})) {
			origins[key] ??= origin;
		}
	}
	return { images, clips: clips.map((clip) => playable.get(clip.id) ?? clip), origins };
}

function interleave<T>(lists: readonly T[][], keyOf: (item: T) => string): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	const longest = Math.max(0, ...lists.map((list) => list.length));
	for (let i = 0; i < longest; i += 1) {
		for (const list of lists) {
			const item = list[i];
			if (item !== undefined && !seen.has(keyOf(item))) {
				seen.add(keyOf(item));
				out.push(item);
			}
		}
	}
	return out;
}

export function hasMedia(feed: MediaFeed): boolean {
	return feed.images.length + feed.clips.length > 0;
}

/**
 * The same feed in a fresh random order, for "New porn".
 *
 * Reshuffled in the browser rather than fetched again: a vibe's feed is a
 * hundred or more pictures and clips, so a new order almost always shows ones
 * not yet seen, at once, and without spending reddit's one request a minute.
 * `random` is injectable so a test can pin the order.
 */
export function shuffleFeed(feed: MediaFeed, random: () => number = Math.random): MediaFeed {
	return { ...feed, images: shuffled(feed.images, random), clips: shuffled(feed.clips, random) };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1));
		[copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
	}
	return copy;
}

export function isVibe(value: string | null): value is Vibe {
	return value !== null && Object.hasOwn(SOURCES, value);
}
