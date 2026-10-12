import type { Rng } from './random';
import { type SettingsLike, showsPorn } from './settings';

/**
 * The hypno playing beside the IQ test, wherever it comes from: what a file
 * is, which runs play one, and how the drawer searches. The bambicloud half
 * is here; PMVHaven's is in `pmv.ts`, which makes files of the same shape.
 *
 * Bambi hypnos for the IQ test's bambi vibe, from bambicloud.com.
 *
 * Pure and alias-free: the endpoint fetches and caches, this decides what is
 * kept and how it is searched, which is the part worth testing.
 *
 * bambicloud's API is undocumented: everything here was read off its own web
 * app and measured (see docs/playroom.md, "Hypno"). It needs no account to
 * list files, and its audio CDN streams with range requests, checks no
 * referrer, and sends `Access-Control-Allow-Origin: *` — which is what lets
 * the page route a file through its own volume.
 */

export const BAMBICLOUD_API = 'https://api.bambicloud.com';
const AUDIO_ORIGIN = 'https://cdn.bambicloud.com/';
const AUDIO_FILE = /^https:\/\/cdn\.bambicloud\.com\/[A-Za-z0-9/_-]+\.(?:mp3|m4a|wav|flac)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WHITESPACE = /\s+/u;

/** The API's page size limit: it refuses anything over 50. */
export const BAMBICLOUD_PAGE = 50;

/** Description length kept: enough to choose by, not the essays some have. */
const DESCRIPTION_LIMIT = 400;

/** bambicloud's own file types, in the order the drawer lists them. */
export const HYPNO_CATEGORIES = [
	{ id: 'loop', label: 'Loops' },
	{ id: 'subliminal', label: 'Subliminals' },
	{ id: 'music', label: 'Music' },
	{ id: 'ai music', label: 'AI music' },
	{ id: 'induction', label: 'Inductions' },
	{ id: 'deepener', label: 'Deepeners' },
	{ id: 'programming', label: 'Programming' },
	{ id: 'full session', label: 'Full sessions' },
	{ id: 'awakener', label: 'Awakeners' }
] as const;
export type HypnoCategory = (typeof HYPNO_CATEGORIES)[number]['id'];

export function isHypnoCategory(value: string): value is HypnoCategory {
	return HYPNO_CATEGORIES.some((category) => category.id === value);
}

/**
 * Which remembered category selection a run uses. Without porn it gets music
 * by default; with porn, loops and subliminals. Kept apart so tightening one
 * does not change the other.
 */
export type CategoryTier = 'mood' | 'porn';

export function categoryTier(settings: SettingsLike): CategoryTier {
	return showsPorn(settings) ? 'porn' : 'mood';
}

export function defaultCategories(settings: SettingsLike): HypnoCategory[] {
	return categoryTier(settings) === 'mood' ? ['music', 'ai music'] : ['loop', 'subliminal'];
}

/**
 * Where a hypno comes from.
 *
 * - `bambicloud`: Bambi Sleep audio, routed through the page's own volume.
 * - `pmvhaven`: hypno and porn music videos, shown among the porn. Its
 *   files send no CORS header, so they are played by a plain element whose
 *   own `volume` the sound module sets (see `registerDirect`).
 */
export const HYPNO_SOURCES = ['bambicloud', 'pmvhaven'] as const;
export type HypnoSource = (typeof HYPNO_SOURCES)[number];

export function isHypnoSource(value: unknown): value is HypnoSource {
	return typeof value === 'string' && (HYPNO_SOURCES as readonly string[]).includes(value);
}

/**
 * Which source a run's hypno plays from. Bambi has both, bambicloud unless
 * the taker has switched it; every other vibe has only PMVHaven.
 */
export function hypnoSourceFor(vibe: string | null, preferred: HypnoSource | null): HypnoSource {
	return vibe === 'bambi' ? (preferred ?? 'bambicloud') : 'pmvhaven';
}

export type HypnoFile = {
	source: HypnoSource;
	/** Where it lives on its own site, for credit. */
	pageUrl: string;
	uuid: string;
	name: string;
	author: string;
	durationMs: number;
	fileType: string;
	triggers: string[];
	description: string;
	warnings: string[];
	/** The file itself: audio from bambicloud, an MP4 from PMVHaven. */
	mediaUrl: string;
	plays: number;
};

/** Where a file lives on bambicloud, for credit. */
export function hypnoPageUrl(uuid: string): string {
	return `https://bambicloud.com/file/${uuid}`;
}

/** A page of playable files, most played first. Locked (Patreon-only) files are left out. */
export function filesPageUrl(offset: number): string {
	const params = new URLSearchParams({
		showLocked: 'false',
		pageSize: String(BAMBICLOUD_PAGE),
		pageOffset: String(offset),
		sortType: 'playcount',
		sortDirection: 'descending'
	});
	return `${BAMBICLOUD_API}/files?${params}`;
}

type RawFile = {
	uuid?: unknown;
	name?: unknown;
	duration?: unknown;
	fileType?: unknown;
	description?: unknown;
	audioURL?: unknown;
	plays?: unknown;
	author?: { username?: unknown } | null;
	triggers?: unknown;
	warnings?: unknown;
};

/**
 * The playable files in one page of `/files`, and the total the API reports.
 *
 * Checked field by field: the answer is a third party's, and only an audio
 * file on bambicloud's own CDN, with a real id, is passed on to the browser.
 * A Patreon-locked file has no `audioURL` without the creator's token, so it
 * drops out here too, even if `showLocked=false` ever stops working.
 */
export function parseFilesPage(body: unknown): { files: HypnoFile[]; total: number } {
	const page = body as { files?: unknown; totalItems?: unknown } | null;
	const total = typeof page?.totalItems === 'number' ? page.totalItems : 0;
	if (!Array.isArray(page?.files)) {
		return { files: [], total };
	}
	const files: HypnoFile[] = [];
	for (const entry of page.files as unknown[]) {
		if (typeof entry !== 'object' || entry === null) {
			continue;
		}
		const raw = entry as RawFile;
		if (
			!(
				typeof raw.uuid === 'string' &&
				UUID.test(raw.uuid) &&
				typeof raw.audioURL === 'string' &&
				raw.audioURL.startsWith(AUDIO_ORIGIN) &&
				AUDIO_FILE.test(raw.audioURL) &&
				typeof raw.name === 'string'
			)
		) {
			continue;
		}
		files.push({
			source: 'bambicloud',
			pageUrl: hypnoPageUrl(raw.uuid),
			uuid: raw.uuid,
			name: raw.name.trim(),
			author: typeof raw.author?.username === 'string' ? raw.author.username : '',
			durationMs: typeof raw.duration === 'number' ? raw.duration : 0,
			fileType: typeof raw.fileType === 'string' ? raw.fileType : '',
			triggers: namesOf(raw.triggers),
			description:
				typeof raw.description === 'string'
					? raw.description.trim().slice(0, DESCRIPTION_LIMIT)
					: '',
			warnings: warningsOf(raw.warnings),
			mediaUrl: raw.audioURL,
			plays: typeof raw.plays === 'number' ? raw.plays : 0
		});
	}
	return { files, total };
}

function namesOf(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.flatMap((trigger: unknown) => {
		const name = (trigger as { name?: unknown } | null)?.name;
		return typeof name === 'string' ? [name] : [];
	});
}

function warningsOf(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.flatMap((warning: unknown) => {
		const text = (warning as { text?: unknown } | null)?.text;
		return typeof text === 'string' ? [text] : [];
	});
}

export type HypnoFilter = {
	query?: string;
	categories?: readonly string[];
	trigger?: string;
	/** Longest acceptable, in minutes. */
	maxMinutes?: number;
};

/**
 * Files matching a filter. The query matches name, author, triggers and
 * description, case-insensitive, all words required. Categories are any-of;
 * none means every category.
 */
export function filterHypnos(files: readonly HypnoFile[], filter: HypnoFilter): HypnoFile[] {
	const words = (filter.query ?? '')
		.toLowerCase()
		.split(WHITESPACE)
		.filter((word) => word.length > 0);
	const categories =
		filter.categories && filter.categories.length > 0 ? new Set(filter.categories) : null;
	const trigger = filter.trigger?.toLowerCase();
	const maxMs = filter.maxMinutes ? filter.maxMinutes * 60_000 : null;
	return files.filter((file) => {
		if (categories && !categories.has(file.fileType)) {
			return false;
		}
		if (trigger && !file.triggers.some((name) => name.toLowerCase() === trigger)) {
			return false;
		}
		if (maxMs !== null && file.durationMs > maxMs) {
			return false;
		}
		if (words.length === 0) {
			return true;
		}
		const haystack = [file.name, file.author, file.description, ...file.triggers]
			.join(' ')
			.toLowerCase();
		return words.every((word) => haystack.includes(word));
	});
}

/** One at random, avoiding `excludeUuid` when anything else is on offer. */
export function pickRandom(
	files: readonly HypnoFile[],
	rng: Pick<Rng, 'int'>,
	excludeUuid?: string
): HypnoFile | null {
	const pool =
		excludeUuid && files.length > 1 ? files.filter((file) => file.uuid !== excludeUuid) : files;
	if (pool.length === 0) {
		return null;
	}
	return pool[rng.int(0, pool.length - 1)] ?? null;
}

/** The most used triggers, for the drawer's chips. */
export function triggerCounts(
	files: readonly HypnoFile[],
	limit = 15
): { name: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const file of files) {
		for (const name of file.triggers) {
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
	}
	return [...counts]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
		.slice(0, limit);
}

/** How many files each category has, in the drawer's order. */
export function categoryCounts(
	files: readonly HypnoFile[]
): { id: HypnoCategory; count: number }[] {
	return HYPNO_CATEGORIES.map(({ id }) => ({
		id,
		count: files.filter((file) => file.fileType === id).length
	}));
}

/** "12:34", or "1:02:03" past an hour. */
export function formatDuration(ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
