import type { HypnoFile } from '$lib/playroom/iq-test/hypno';
import {
	PMV_QUERIES,
	parseSearchPage,
	parseVideoPage,
	pmvPageUrl,
	pmvSearchUrl
} from '$lib/playroom/iq-test/pmv';
import type { Vibe } from '$lib/playroom/iq-test/settings';
import { MAX_AGE_HEADER } from '$lib/server/porn-relay/hosts';

const USER_AGENT = 'BoundUp/1.0 (playroom hypno)';

/**
 * How long the relay, on Workers, may keep a page for every isolate (see
 * `$lib/server/porn-relay`). A search page as long as an index lives; a video
 * page for a month, since its file does not change once uploaded. Ignored
 * where there is no relay.
 */
const SEARCH_MAX_AGE_S = 6 * 60 * 60;
const VIDEO_MAX_AGE_S = 30 * 24 * 60 * 60;

/** How long a vibe's index is served before PMVHaven is asked again. */
export const PMV_TTL_MS = 6 * 60 * 60 * 1000;

/** How long a failed rebuild is left alone, serving the last good index meanwhile. */
export const PMV_FAILURE_BACKOFF_MS = 5 * 60 * 1000;

/**
 * Each vibe's PMVHaven videos, from its searches (see `PMV_QUERIES`), cached
 * per isolate for six hours: four search pages per vibe per isolate, rather
 * than one per pick. Like the bambicloud index, it holds public data only,
 * and never throws: with PMVHaven down it serves the last good index, or an
 * empty one, and the page plays no hypno.
 */
const indexes = new Map<Vibe, { files: HypnoFile[]; freshUntil: number }>();
const building = new Map<Vibe, Promise<HypnoFile[]>>();

export function pmvIndex(
	vibe: Vibe,
	fetchFn: typeof fetch,
	now = Date.now()
): Promise<HypnoFile[]> {
	const cached = indexes.get(vibe);
	if (cached && now < cached.freshUntil) {
		return Promise.resolve(cached.files);
	}
	const inFlight = building.get(vibe);
	if (inFlight !== undefined) {
		return inFlight;
	}
	const previous = cached?.files ?? [];
	const build = buildIndex(vibe, fetchFn)
		.then((files) => {
			if (files.length > 0) {
				indexes.set(vibe, { files, freshUntil: now + PMV_TTL_MS });
				return files;
			}
			indexes.set(vibe, { files: previous, freshUntil: now + PMV_FAILURE_BACKOFF_MS });
			return previous;
		})
		.finally(() => {
			building.delete(vibe);
		});
	building.set(vibe, build);
	return build;
}

async function buildIndex(vibe: Vibe, fetchFn: typeof fetch): Promise<HypnoFile[]> {
	// One at a time: a handful of pages, and PMVHaven owes us nothing.
	const pages: HypnoFile[][] = [];
	for (const query of PMV_QUERIES[vibe]) {
		pages.push(await fetchSearch(fetchFn, query));
	}
	const seen = new Set<string>();
	return pages.flat().filter((file) => {
		if (seen.has(file.uuid)) {
			return false;
		}
		seen.add(file.uuid);
		return true;
	});
}

async function fetchSearch(fetchFn: typeof fetch, query: string): Promise<HypnoFile[]> {
	try {
		const response = await fetchFn(pmvSearchUrl(query), {
			headers: {
				'user-agent': USER_AGENT,
				accept: 'text/html',
				[MAX_AGE_HEADER]: String(SEARCH_MAX_AGE_S)
			}
		});
		if (!response.ok) {
			// Logged: an empty index looks exactly like a quiet PMVHaven otherwise,
			// which is how a 451 for every visitor in Australia went unnoticed.
			console.error(`PMVHaven search "${query}" answered ${response.status}`);
			return [];
		}
		return parseSearchPage(await response.text());
	} catch (error) {
		console.error(`PMVHaven search "${query}" failed`, error);
		return [];
	}
}

/** Files read from video pages, by id. They do not change once uploaded. */
const resolved = new Map<string, string>();

/**
 * A video with its file filled in. Most search results have to be looked up
 * on their own page (see `parseVideoPage`), which is done here once per
 * video per isolate, and only for a video already in the index — so nothing
 * a visitor sends picks a page to fetch. Null when the file cannot be found.
 */
export async function withMedia(file: HypnoFile, fetchFn: typeof fetch): Promise<HypnoFile | null> {
	if (file.mediaUrl) {
		return file;
	}
	const known = resolved.get(file.uuid);
	if (known) {
		return { ...file, mediaUrl: known };
	}
	try {
		const response = await fetchFn(pmvPageUrl(file.uuid), {
			headers: {
				'user-agent': USER_AGENT,
				accept: 'text/html',
				[MAX_AGE_HEADER]: String(VIDEO_MAX_AGE_S)
			}
		});
		const url = response.ok ? parseVideoPage(await response.text(), file.uuid) : null;
		if (!url) {
			return null;
		}
		resolved.set(file.uuid, url);
		return { ...file, mediaUrl: url };
	} catch {
		return null;
	}
}

/** Forget everything. Tests only: each one starts from a cold cache. */
export function clearPmvIndex(): void {
	indexes.clear();
	building.clear();
	resolved.clear();
}
