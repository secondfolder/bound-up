import type { HypnoFile } from './hypno';
import type { Vibe } from './settings';

/**
 * Hypno and porn music videos from PMVHaven, for every vibe's hypno.
 *
 * Pure and alias-free: the server fetches and caches (`playroom-pmv.ts`), this
 * decides what to ask for and what to keep.
 *
 * **Its search pages, not its API.** PMVHaven has a JSON API, but its
 * robots.txt disallows `/api/`. Its search page is allowed, and it is
 * server-rendered: the results are in the page's `__NUXT_DATA__` payload,
 * which is what is read here. Measured, not documented, so it is checked
 * field by field and anything that does not fit is dropped.
 *
 * **The file is derived where it can be.** A search result carries no
 * `videoUrl`, only its HLS master playlist. For a video uploaded since the
 * site's rebuild, that sits beside the MP4 at `videos/<file>.mp4/master.m3u8`,
 * and taking the playlist's name off gives the MP4. An older one keeps its
 * playlist in a folder named for its old id, which says nothing about the
 * file's name; for those `mediaUrl` is empty, and the server reads the file
 * from the video's own page when one is picked (`parseVideoPage`).
 *
 * Either way the bucket serves the MP4 with range requests and no referrer
 * check, but with no CORS header: the page cannot route it through Web Audio,
 * and HLS (which needs `fetch`) is out for the same reason.
 */

const ORIGIN = 'https://pmvhaven.com';
const BUCKET = 'https://pmvhavencloud.s3.eu-west-par.io.cloud.ovh.net/';
/** A master playlist beside its MP4, from which the MP4 can be read off. */
const MASTER_BESIDE_FILE =
	/^https:\/\/pmvhavencloud\.s3\.eu-west-par\.io\.cloud\.ovh\.net\/videos\/[^/?#]+\.mp4\/master\.m3u8$/;
/** A master playlist in an old id's folder: the video is real, its file name unknown. */
const MASTER_IN_FOLDER =
	/^https:\/\/pmvhavencloud\.s3\.eu-west-par\.io\.cloud\.ovh\.net\/[0-9a-f]{24}\/master\.m3u8$/;
/** An MP4 in the bucket, either way it is laid out. */
const MP4 =
	/^https:\/\/pmvhavencloud\.s3\.eu-west-par\.io\.cloud\.ovh\.net\/(?:videos|[0-9a-f]{24})\/[^/?#]+\.mp4$/;
const ID = /^[0-9a-f]{24}$/;
const PAYLOAD = /<script[^>]*id="__NUXT_DATA__"[^>]*>(?<payload>[\s\S]*?)<\/script>/;

/**
 * The searches each vibe's index is built from, chosen by what they turned up
 * on 2026-10-12: each gave a page of results on theme, most with music and
 * many with a voice-over. Feminisation leads with DeepSlutPuppy, the series
 * held up as the model of the genre: fast, spoken, with music and sound.
 */
export const PMV_QUERIES: Record<Vibe, readonly string[]> = {
	gooner: ['gooning encouragement', 'goon hypno', 'brainmelter', 'gooning'],
	bambi: ['bambi', 'bambi sleep', 'bimbo hypno', 'bimbo pmv'],
	misogyny: ['misogyny', 'male supremacy', 'wife training', 'anti-feminism'],
	denial: ['chastity', 'tease and denial', 'edging', 'cock hero'],
	feminisation: ['deepslutpuppy', 'sissy hypno', 'feminization', 'sissy pmv'],
	degradation: ['humiliation', 'degradation', 'cum slut', 'free use']
};

/** A search results page. Results are ranked by PMVHaven's own relevance. */
export function pmvSearchUrl(query: string): string {
	return `${ORIGIN}/search?${new URLSearchParams({ q: query })}`;
}

/** Where a video lives on PMVHaven, for credit. The bare id is enough. */
export function pmvPageUrl(id: string): string {
	return `${ORIGIN}/video/${id}`;
}

/**
 * The payload is Nuxt's: one flat array, where objects and arrays hold the
 * indexes of their values rather than the values. A reference is followed
 * only as far as a primitive or an array of them, which is all a result's
 * fields need.
 */
function reader(payload: unknown[]) {
	const at = (value: unknown): unknown => (typeof value === 'number' ? payload[value] : value);
	return {
		string: (value: unknown): string | null => {
			const resolved = at(value);
			return typeof resolved === 'string' ? resolved : null;
		},
		number: (value: unknown): number | null => {
			const resolved = at(value);
			return typeof resolved === 'number' && Number.isFinite(resolved) ? resolved : null;
		},
		flag: (value: unknown): boolean => at(value) === true,
		strings: (value: unknown): string[] => {
			const resolved = at(value);
			if (!Array.isArray(resolved)) {
				return [];
			}
			return resolved.flatMap((item) => {
				const text = at(item);
				return typeof text === 'string' ? [text] : [];
			});
		}
	};
}

/** Description length kept, as for bambicloud: enough to choose by. */
const DESCRIPTION_LIMIT = 400;

/**
 * The playable videos on one search results page, as hypno files.
 *
 * `fileType` is "voice-over" for the ones with talking and "pmv" otherwise,
 * which the drawer shows and the random pick favours (see `pickPmv`).
 */
export function parseSearchPage(html: string): HypnoFile[] {
	// Annotated: Biome's inference believes `exec` never returns null (see AGENTS.md).
	const match: RegExpExecArray | null = PAYLOAD.exec(html);
	if (!match) {
		return [];
	}
	let payload: unknown;
	try {
		payload = JSON.parse(match.groups?.payload ?? '');
	} catch {
		return [];
	}
	if (!Array.isArray(payload)) {
		return [];
	}
	const read = reader(payload);
	const files: HypnoFile[] = [];
	const seen = new Set<string>();
	for (const entry of payload) {
		if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
			continue;
		}
		const raw = entry as Record<string, unknown>;
		if (!('hlsMasterPlaylistUrl' in raw && 'title' in raw)) {
			continue;
		}
		const id = read.string(raw._id);
		const master = read.string(raw.hlsMasterPlaylistUrl);
		const title = read.string(raw.title);
		const beside = master !== null && MASTER_BESIDE_FILE.test(master);
		const inFolder = master !== null && MASTER_IN_FOLDER.test(master);
		if (!(id && ID.test(id) && (beside || inFolder) && title) || seen.has(id)) {
			continue;
		}
		seen.add(id);
		const voiceOver = read.flag(raw.hasVoiceOver);
		files.push({
			source: 'pmvhaven',
			pageUrl: pmvPageUrl(id),
			uuid: id,
			name: title.trim(),
			author: read.string(raw.uploaderUsername) ?? read.string(raw.uploader) ?? '',
			durationMs: (read.number(raw.durationSeconds) ?? 0) * 1000,
			fileType: voiceOver ? 'voice-over' : 'pmv',
			triggers: read.strings(raw.tags).slice(0, 12),
			description: (read.string(raw.description) ?? '').trim().slice(0, DESCRIPTION_LIMIT),
			warnings: read.flag(raw.seizureWarning) ? ['Flashing images'] : [],
			// Empty when it has to be read from the video's own page.
			mediaUrl: beside && master ? master.slice(0, -'/master.m3u8'.length) : '',
			plays: read.number(raw.views) ?? 0
		});
	}
	return files;
}

/**
 * The MP4 of one video, from that video's own page, which carries the
 * `videoUrl` a search result does not. Null when the page has no such video,
 * or its file is anywhere but PMVHaven's own bucket.
 */
export function parseVideoPage(html: string, id: string): string | null {
	const match: RegExpExecArray | null = PAYLOAD.exec(html);
	let payload: unknown;
	try {
		payload = JSON.parse(match?.groups?.payload ?? '');
	} catch {
		return null;
	}
	if (!Array.isArray(payload)) {
		return null;
	}
	const read = reader(payload);
	for (const entry of payload) {
		if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
			continue;
		}
		const raw = entry as Record<string, unknown>;
		if ('videoUrl' in raw && read.string(raw._id) === id) {
			const url = read.string(raw.videoUrl);
			return url?.startsWith(BUCKET) && MP4.test(url) ? url : null;
		}
	}
	return null;
}

/**
 * How much likelier a video with a voice-over is to be picked at random than
 * one without: talking is what makes a PMV a hypno rather than a montage.
 */
export const VOICE_OVER_WEIGHT = 3;

/** One at random, voice-overs favoured, avoiding `excludeId` when anything else is on offer. */
export function pickPmv(
	files: readonly HypnoFile[],
	random: () => number,
	excludeId?: string
): HypnoFile | null {
	const pool =
		excludeId && files.length > 1 ? files.filter((file) => file.uuid !== excludeId) : files;
	const weight = (file: HypnoFile) => (file.fileType === 'voice-over' ? VOICE_OVER_WEIGHT : 1);
	const total = pool.reduce((sum, file) => sum + weight(file), 0);
	let roll = random() * total;
	for (const file of pool) {
		roll -= weight(file);
		if (roll < 0) {
			return file;
		}
	}
	return pool.at(-1) ?? null;
}
