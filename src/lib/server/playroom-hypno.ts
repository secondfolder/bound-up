import { filesPageUrl, type HypnoFile, parseFilesPage } from '$lib/playroom/iq-test/hypno';

const USER_AGENT = 'BoundUp/1.0 (playroom hypno)';

/** How long a good index is served before bambicloud is asked again. */
export const HYPNO_TTL_MS = 6 * 60 * 60 * 1000;

/** How long a failed rebuild is left alone, serving the last good index meanwhile. */
export const HYPNO_FAILURE_BACKOFF_MS = 5 * 60 * 1000;

/** Pages fetched at once while building. Polite, and fast enough on a cold isolate. */
const CONCURRENCY = 3;

/** A safety stop, should the API ever report a total it never reaches. */
const MAX_PAGES = 60;

/**
 * Every playable file on bambicloud, most played first, cached per isolate.
 *
 * The whole index rather than a query per request, for three reasons:
 * - **Categories:** the API's own `fileTypes` filter answers 500 (measured),
 *   so filtering by category has to be done here.
 * - **Random:** it has no random sort, so a random pick needs every candidate.
 * - **Cost:** it is about 15 requests per isolate per six hours, against one
 *   per search.
 *
 * Module-level state is safe here where a `db` or `auth` one is not
 * (invariant 2): it holds public data, nothing about any user, and losing it
 * costs a rebuild. Never throws: with bambicloud down it serves the last good
 * index, or an empty one, and the page simply plays no hypno.
 */
let index: { files: HypnoFile[]; freshUntil: number } | null = null;
let building: Promise<HypnoFile[]> | null = null;

export function hypnoIndex(fetchFn: typeof fetch, now = Date.now()): Promise<HypnoFile[]> {
	if (index && now < index.freshUntil) {
		return Promise.resolve(index.files);
	}
	if (building !== null) {
		return building;
	}
	const previous = index?.files ?? [];
	building = buildIndex(fetchFn)
		.then((files) => {
			if (files.length > 0) {
				index = { files, freshUntil: now + HYPNO_TTL_MS };
				return files;
			}
			index = { files: previous, freshUntil: now + HYPNO_FAILURE_BACKOFF_MS };
			return previous;
		})
		.finally(() => {
			building = null;
		});
	return building;
}

async function buildIndex(fetchFn: typeof fetch): Promise<HypnoFile[]> {
	const first = await fetchPage(fetchFn, 0);
	if (first === null) {
		return [];
	}
	const pages = Math.min(MAX_PAGES, Math.ceil(first.total / 50));
	const offsets = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => (i + 1) * 50);
	const rest: HypnoFile[][] = [];
	for (let i = 0; i < offsets.length; i += CONCURRENCY) {
		const batch = await Promise.all(
			offsets.slice(i, i + CONCURRENCY).map((offset) => fetchPage(fetchFn, offset))
		);
		// A page that failed is a gap, not a failure: the rest is still useful.
		rest.push(...batch.map((page) => page?.files ?? []));
	}
	const seen = new Set<string>();
	return [first.files, ...rest].flat().filter((file) => {
		if (seen.has(file.uuid)) {
			return false;
		}
		seen.add(file.uuid);
		return true;
	});
}

async function fetchPage(
	fetchFn: typeof fetch,
	offset: number
): Promise<{ files: HypnoFile[]; total: number } | null> {
	try {
		const response = await fetchFn(filesPageUrl(offset), {
			headers: { 'user-agent': USER_AGENT, accept: 'application/json' }
		});
		return response.ok ? parseFilesPage(await response.json()) : null;
	} catch {
		return null;
	}
}

/** Forget everything. Tests only: each one starts from a cold cache. */
export function clearHypnoIndex(): void {
	index = null;
	building = null;
}
