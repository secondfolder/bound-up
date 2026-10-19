import { LEVEL_LABELS, type Level, type SideKey } from '../answers';
import { kinkById, sidesOf } from '../catalog';
import { answersPerChunk, CHUNK_LENGTH, decodeKinklistHash } from './kinklist-hash';
import { type ImportedAnswer, type ImportResult, mostPositive } from './result';

/**
 * Links from the KinkList family of sites: Goctionni's KinkList, and the
 * lists built on it. Their answers are in the hash, by position in the list
 * as that site has it, so each site's list is kept here as a snapshot
 * (`lists/*.json`, made by `.local/kinks/tools/gen_import_lists.py`), with
 * each item mapped to the catalogue kink it means.
 */

export type ListSourceId =
	| 'goctionni'
	| 'adhesivecheese-classic'
	| 'adhesivecheese-detailed'
	| 'adhesivecheese-plsno'
	| 'kinksheet'
	| 'notlewdjustkinky'
	| 'notlewdjustkinky-irl';

export type SourceList = {
	id: ListSourceId;
	title: string;
	/** What each answer level means, by its number in the hash; 0 is "not entered". */
	levels: (Level | null)[];
	categories: {
		name: string;
		columns: string[];
		items: { name: string; id?: string; side?: SideKey; ignore?: boolean }[];
	}[];
};

/**
 * Loaded only when a link from that site is imported: together they are most
 * of 100 KB that nothing else needs.
 */
const LOADERS: Record<ListSourceId, () => Promise<{ default: unknown }>> = {
	goctionni: () => import('./lists/goctionni.json'),
	'adhesivecheese-classic': () => import('./lists/adhesivecheese-classic.json'),
	'adhesivecheese-detailed': () => import('./lists/adhesivecheese-detailed.json'),
	'adhesivecheese-plsno': () => import('./lists/adhesivecheese-plsno.json'),
	kinksheet: () => import('./lists/kinksheet.json'),
	notlewdjustkinky: () => import('./lists/notlewdjustkinky.json'),
	'notlewdjustkinky-irl': () => import('./lists/notlewdjustkinky-irl.json')
};

export async function loadSourceList(id: ListSourceId): Promise<SourceList> {
	return (await LOADERS[id]()).default as SourceList;
}

export type DetectedLink = {
	/** The lists the link could be from. One, except for adhesiveCheese's, whose link does not say which preset. */
	sources: ListSourceId[];
	hash: string;
};

const GOCTIONNI_VERSION = /\/v(?<major>\d+)(?:\.\d+)*b?\.html$/i;

/**
 * Which site a link is from, or null for one this cannot read. Goctionni's
 * links name their version file; the lists differ before v1, and only v1 and
 * later are kept.
 */
export function detectKinklistLink(text: string): DetectedLink | null {
	let url: URL;
	try {
		url = new URL(text.trim());
	} catch {
		return null;
	}
	// The sites themselves ignore a hash this short: it holds nothing.
	if (url.hash.length < 11) {
		return null;
	}
	const host = url.hostname.toLowerCase();
	const path = url.pathname.toLowerCase();
	const hash = url.hash.slice(1);
	if (host.endsWith('adhesivecheese.github.io')) {
		return {
			sources: ['adhesivecheese-classic', 'adhesivecheese-detailed', 'adhesivecheese-plsno'],
			hash
		};
	}
	if (host.endsWith('kinksheet.com')) {
		return { sources: ['kinksheet'], hash };
	}
	if (host.endsWith('notlewdjustkinky.com')) {
		return {
			sources: [path.includes('kinklist_irl') ? 'notlewdjustkinky-irl' : 'notlewdjustkinky'],
			hash
		};
	}
	const version = GOCTIONNI_VERSION.exec(path) as RegExpExecArray | null;
	if (
		(host.includes('goctionni') || path.includes('goctionni') || path.includes('kinklist')) &&
		version
	) {
		return Number(version.groups?.major) >= 1 ? { sources: ['goctionni'], hash } : null;
	}
	return null;
}

function positions(list: SourceList): number {
	return list.categories.reduce(
		(sum, category) => sum + category.items.length * Math.max(category.columns.length, 1),
		0
	);
}

/**
 * Whether a hash fits a list: the sites write exactly as many 8-character
 * chunks as the list's answers need, so the length alone says which list a
 * link was made on. The contents cannot: the sites' encoder drops zero digits
 * inside a chunk, so even the padding after the last answer may not decode to
 * "not entered". 0 for a fit, Infinity otherwise. Picks adhesiveCheese's
 * preset, whose link does not name it.
 */
export function fitOf(list: SourceList, hash: string): number {
	if (!decodeKinklistHash(hash, list.levels.length)) {
		return Number.POSITIVE_INFINITY;
	}
	const perChunk = answersPerChunk(list.levels.length);
	const chunks = Math.ceil(positions(list) / perChunk);
	return hash.length === chunks * CHUNK_LENGTH ? 0 : Number.POSITIVE_INFINITY;
}

const FIRST_SIDE = /^(?:giving|actor|self|on self|as dom(?:inant)?|dominant|aggressor|performing)$/;
const SECOND_SIDE =
	/^(?:receiving|recieving|subject|partner|on others|as sub(?:missive)?|submissive|target)$/;

/** Which side a column's heading means: "Giving", "Self", "As Dominant"… or neither. */
export function sideOfColumn(column: string): SideKey | null {
	const name = column.trim().toLowerCase();
	if (FIRST_SIDE.test(name)) {
		return 'a';
	}
	if (SECOND_SIDE.test(name)) {
		return 'b';
	}
	return null;
}

type Collected = { name: string; side: SideKey | null; level: Level; column?: string };

function listEntries(entries: Collected[]): string {
	return entries
		.map(
			(entry) =>
				`${entry.name}${entry.column ? ` (${entry.column})` : ''}: ${LEVEL_LABELS[entry.level]}`
		)
		.join(' · ');
}

/** One kink's answer from everything that landed on it. */
function combine(id: string | null, entries: Collected[]): ImportedAnswer {
	const item = id ? kinkById(id) : undefined;
	const hasSides = item ? sidesOf(item) !== null : false;
	const sided = hasSides ? entries.filter((entry) => entry.side !== null) : [];
	const both = hasSides ? entries.filter((entry) => entry.side === null) : entries;
	const answer: ImportedAnswer = {};
	const whole = mostPositive(both.map((entry) => entry.level));
	if (whole) {
		answer.level = whole;
	}
	for (const side of ['a', 'b'] as const) {
		const level = mostPositive(
			sided.filter((entry) => entry.side === side).map((entry) => entry.level)
		);
		if (level) {
			answer.sides = { ...answer.sides, [side]: { level } };
		}
	}
	// Where several answers were folded into one, say what they were.
	const distinct = new Set(entries.map((entry) => `${entry.side}:${entry.level}`));
	const folded = both.length > 1 && new Set(both.map((entry) => entry.level)).size > 1;
	if (folded || (distinct.size > 1 && !hasSides)) {
		answer.note = `Imported as ${listEntries(entries)}`;
	}
	return answer;
}

/** What a list's answers mean for this catalogue. */
export function importFromList(list: SourceList, values: readonly number[]): ImportResult {
	const byKink = new Map<string, Collected[]>();
	const unmatched: ImportResult['unmatched'] = [];
	let position = 0;
	for (const category of list.categories) {
		const columns = category.columns.length > 0 ? category.columns : ['General'];
		for (const item of category.items) {
			const collected: Collected[] = [];
			for (const column of columns) {
				const level = list.levels[values[position] ?? 0] ?? null;
				position += 1;
				if (!level) {
					continue;
				}
				const side = item.side ?? (columns.length === 2 ? sideOfColumn(column) : null);
				collected.push({
					name: item.name,
					side,
					level,
					column: columns.length > 1 ? column : undefined
				});
			}
			if (collected.length === 0 || item.ignore) {
				continue;
			}
			if (item.id) {
				byKink.set(item.id, [...(byKink.get(item.id) ?? []), ...collected]);
			} else {
				unmatched.push({
					name: item.name,
					category: category.name,
					answer: combine(null, collected)
				});
			}
		}
	}
	const answers: ImportResult['answers'] = {};
	for (const [id, entries] of byKink) {
		answers[id] = combine(id, entries);
	}
	return { source: list.title, answers, unmatched };
}

/** A link from the KinkList family, read: the list it fits best and what it says. */
export async function importKinklistLink(
	detected: DetectedLink,
	choose?: ListSourceId
): Promise<{ result: ImportResult; source: ListSourceId; alternatives: ListSourceId[] } | null> {
	const lists = await Promise.all(detected.sources.map(loadSourceList));
	const ranked = lists
		.map((list) => ({ list, fit: fitOf(list, detected.hash) }))
		.filter((entry) => Number.isFinite(entry.fit))
		.toSorted((a, b) => a.fit - b.fit);
	const picked = ranked.find((entry) => entry.list.id === choose) ?? ranked[0];
	if (!picked) {
		return null;
	}
	const values = decodeKinklistHash(detected.hash, picked.list.levels.length) ?? [];
	return {
		result: importFromList(picked.list, values),
		source: picked.list.id,
		alternatives: ranked.map((entry) => entry.list.id)
	};
}
