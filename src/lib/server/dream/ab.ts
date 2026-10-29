/**
 * The blind A/B page's server half (docs/dreams.md, "Quality tools"): it
 * reads bench folders from dream-bench/, draws a pair of runs of the same
 * brief from two prompt versions, hides which is which, and appends votes to
 * dream-bench/votes.jsonl.
 *
 * Development only: dream-bench/ is on the developer's machine, and the route
 * imports this module only behind `dev`, so it never reaches a build.
 *
 * Alias-free, so the bench's own modules can share it.
 */

import { appendFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findTag, parseMarkup, plainText } from '../../dream/markup';
import type { Random } from '../../dream/random';
import type { Vote } from './bench/leaderboard';
import type { BenchRun } from './bench/run';

export type AbSide = { title: string; telling: string; passages: string[] };

export type AbPair = {
	/** Opaque to the page: which folder and run each side is, and which side is A. */
	pairId: string;
	brief: string;
	left: AbSide;
	right: AbSide;
};

export type AbVersion = { label: string; folders: string[]; runs: number };

type PairRef = {
	a: { folder: string; index: number; label: string };
	b: { folder: string; index: number; label: string };
	leftIsA: boolean;
};

export const VOTE_TAGS = ['samey', 'offBrief', 'tooMuchMarkup', 'flat', 'loved'] as const;
export type VoteTag = (typeof VOTE_TAGS)[number];

const VOTES_FILE = 'votes.jsonl';
const runsCache = new Map<string, BenchRun[]>();

/** A bench folder never changes once written, so its runs are read once. */
async function runsIn(root: string, folder: string): Promise<BenchRun[]> {
	const path = join(root, folder, 'runs.json');
	const cached = runsCache.get(path);
	if (cached) {
		return cached;
	}
	try {
		const runs = JSON.parse(await readFile(path, 'utf8')) as BenchRun[];
		runsCache.set(path, runs);
		return runs;
	} catch {
		return [];
	}
}

/** Every prompt version with bench runs, newest folder first. */
export async function listVersions(root: string): Promise<AbVersion[]> {
	const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
	const folders = entries
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
		.map((entry) => entry.name)
		.sort()
		.reverse();
	const versions = new Map<string, AbVersion>();
	for (const folder of folders) {
		const runs = (await runsIn(root, folder)).filter((run) => !run.error);
		const label = runs[0]?.label;
		if (!label) {
			continue;
		}
		const version = versions.get(label) ?? { label, folders: [], runs: 0 };
		version.folders.push(folder);
		version.runs += runs.length;
		versions.set(label, version);
	}
	return [...versions.values()];
}

/** A passage as a reader would read it: its text, without the footer. */
function readable(source: string): string {
	const nodes = parseMarkup(source, { final: true });
	const footer = findTag(nodes, 'after');
	return plainText(nodes.filter((node) => node !== footer)).trim();
}

function side(run: BenchRun): AbSide {
	return {
		title: run.build?.title ?? '(untitled)',
		telling: run.build?.telling ?? '',
		passages: run.passages.map(readable)
	};
}

type Located = { folder: string; index: number; run: BenchRun };

async function locate(root: string, version: AbVersion): Promise<Located[]> {
	const found: Located[] = [];
	for (const folder of version.folders) {
		for (const [index, run] of (await runsIn(root, folder)).entries()) {
			if (!run.error && run.passages.length > 0) {
				found.push({ folder, index, run });
			}
		}
	}
	return found;
}

function pick<T>(items: readonly T[], random: Random): T | undefined {
	return items[Math.floor(random() * items.length)];
}

/** A random pair of runs of one brief, one from each version, sides shuffled. */
export async function randomPair(
	root: string,
	a: AbVersion,
	b: AbVersion,
	random: Random
): Promise<AbPair | null> {
	const runsA = await locate(root, a);
	const runsB = await locate(root, b);
	const shared = [...new Set(runsA.map((entry) => entry.run.brief.id))].filter((id) =>
		runsB.some((entry) => entry.run.brief.id === id)
	);
	const brief = pick(shared, random);
	const fromA = pick(
		runsA.filter((entry) => entry.run.brief.id === brief),
		random
	);
	const fromB = pick(
		runsB.filter((entry) => entry.run.brief.id === brief),
		random
	);
	if (!(fromA && fromB)) {
		return null;
	}
	const leftIsA = random() < 0.5;
	const ref: PairRef = {
		a: { folder: fromA.folder, index: fromA.index, label: a.label },
		b: { folder: fromB.folder, index: fromB.index, label: b.label },
		leftIsA
	};
	return {
		pairId: Buffer.from(JSON.stringify(ref)).toString('base64url'),
		brief: fromA.run.brief.brief,
		left: side(leftIsA ? fromA.run : fromB.run),
		right: side(leftIsA ? fromB.run : fromA.run)
	};
}

export type StoredVote = Vote & {
	brief: string;
	runA: string;
	runB: string;
	tags: VoteTag[];
	at: string;
};

/** Records a vote for the side the person saw, turned back into A and B. */
export async function recordVote(
	root: string,
	pairId: string,
	choice: 'left' | 'right' | 'tie',
	tags: readonly VoteTag[]
): Promise<StoredVote> {
	const ref = JSON.parse(Buffer.from(pairId, 'base64url').toString('utf8')) as PairRef;
	let winner: Vote['winner'] = 'tie';
	if (choice !== 'tie') {
		winner = (choice === 'left') === ref.leftIsA ? 'a' : 'b';
	}
	const runs = await runsIn(root, ref.a.folder);
	const vote: StoredVote = {
		a: ref.a.label,
		b: ref.b.label,
		winner,
		brief: runs[ref.a.index]?.brief.id ?? '',
		runA: `${ref.a.folder}#${ref.a.index}`,
		runB: `${ref.b.folder}#${ref.b.index}`,
		tags: [...tags],
		at: new Date().toISOString()
	};
	await appendFile(join(root, VOTES_FILE), `${JSON.stringify(vote)}\n`);
	return vote;
}

export async function readVotes(root: string): Promise<StoredVote[]> {
	const text = await readFile(join(root, VOTES_FILE), 'utf8').catch(() => '');
	return text
		.split('\n')
		.filter(Boolean)
		.flatMap((line) => {
			try {
				return [JSON.parse(line) as StoredVote];
			} catch {
				return [];
			}
		});
}
