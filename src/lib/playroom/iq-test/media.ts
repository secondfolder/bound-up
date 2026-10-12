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
 * - `redgifs`: a tag search on Redgifs' own API. The main source: every vibe
 *   has tags with thousands of results, and the API showed no rate limit in
 *   use. Each result is a clip (id, SD file, whether it has sound) plus a
 *   poster still.
 * - `reddit`: a subreddit's weekly top feed. A top-up only. Unauthenticated,
 *   reddit allows one feed request a minute (`x-ratelimit-remaining: 0` after
 *   a single request, measured), so it cannot carry five vibes on its own —
 *   which is how denial, feminisation and degradation once showed nothing:
 *   whichever vibe asked first got the minute's request.
 */
export type MediaSource = { kind: 'redgifs'; tag: string } | { kind: 'reddit'; subreddit: string };

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
		{ kind: 'redgifs', tag: 'Gooning' },
		{ kind: 'redgifs', tag: 'PMV' },
		{ kind: 'redgifs', tag: 'Gooner' }
	],
	// Bambi's own corner: hypno, trance and mind-control porn, the bimbo PMVs
	// her fans watch, and the handful tagged Bambi Sleep by name. Not the plain
	// "Bambi" tag, which is mostly performers called Bambi, nor a generic
	// "Bimbo". Checked 2026-10-11: "Bimbo Hypno" 386, "Mind Control" 3,361,
	// "Brainwash" 72, "Trance" 86, "Bimbo PMV" 180, "Bambi Sleep" 9.
	bambi: [
		{ kind: 'redgifs', tag: 'Bimbo Hypno' },
		{ kind: 'redgifs', tag: 'Mind Control' },
		{ kind: 'redgifs', tag: 'Bimbo PMV' },
		{ kind: 'redgifs', tag: 'Brainwash' },
		{ kind: 'redgifs', tag: 'Trance' },
		{ kind: 'redgifs', tag: 'Bambi Sleep' }
	],
	misogyny: [
		{ kind: 'redgifs', tag: 'Housewife' },
		{ kind: 'redgifs', tag: 'Submissive' },
		{ kind: 'redgifs', tag: 'Slut' },
		{ kind: 'reddit', subreddit: 'BimboFetish' }
	],
	denial: [
		{ kind: 'redgifs', tag: 'Chastity' },
		{ kind: 'redgifs', tag: 'Edging' },
		{ kind: 'redgifs', tag: 'Orgasm Denial' },
		{ kind: 'reddit', subreddit: 'chastity' }
	],
	feminisation: [
		{ kind: 'redgifs', tag: 'Feminization' },
		{ kind: 'redgifs', tag: 'Sissy' },
		{ kind: 'redgifs', tag: 'Crossdressing' },
		{ kind: 'reddit', subreddit: 'feminization' }
	],
	degradation: [
		{ kind: 'redgifs', tag: 'Degradation' },
		{ kind: 'redgifs', tag: 'Humiliation' },
		{ kind: 'redgifs', tag: 'Face Slapping' },
		{ kind: 'redgifs', tag: 'Cum Slut' }
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
	return source.kind === 'redgifs' ? `redgifs:${source.tag}` : `reddit:${source.subreddit}`;
}

/** The feed URL for one subreddit: this week's top posts, as Atom. */
export function feedUrl(subreddit: string): string {
	return `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top/.rss?t=week`;
}

/** Redgifs' anonymous token, which its search needs. Keyless, valid for a day. */
export const REDGIFS_TOKEN_URL = 'https://api.redgifs.com/v2/auth/temporary';

/** How many results one tag search asks for. */
export const REDGIFS_PAGE = 40;

/**
 * A tag search, trending first. `tags=` and not `search_text=`: the API
 * accepts the latter and ignores it, answering every query with the same
 * front page.
 */
export function redgifsSearchUrl(tag: string): string {
	return `https://api.redgifs.com/v2/gifs/search?tags=${encodeURIComponent(tag)}&order=trending&count=${REDGIFS_PAGE}`;
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
