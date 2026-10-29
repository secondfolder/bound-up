import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seededRandom } from '../../dream/random';
import { listVersions, randomPair, readVotes, recordVote } from './ab';
import { BENCH_BRIEFS } from './bench/briefs';
import type { BenchRun } from './bench/run';

const [brief] = BENCH_BRIEFS;
let root = '';

function run(label: string, passage: string): BenchRun {
	if (!brief) {
		throw new Error('the bench has no briefs');
	}
	return {
		brief,
		label,
		model: 'stub',
		seed: 's',
		nudges: [],
		reading: {
			musts: [],
			research: { needed: false, text: '' },
			spread: { n: 1, reason: '' },
			directions: [],
			pick: { by: 'code', reason: '' },
			ask: null,
			rest: []
		},
		picked: null,
		build: null,
		passages: [passage],
		steps: [],
		checks: [],
		fingerprint: null,
		cost: 0
	};
}

async function folder(name: string, runs: BenchRun[]): Promise<void> {
	await mkdir(join(root, name));
	await writeFile(join(root, name, 'runs.json'), JSON.stringify(runs));
}

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'dream-ab-'));
	await folder('2026-10-29-old', [run('v1', 'Old prose.\n<after>\n{"next": "x"}\n</after>')]);
	await folder('2026-10-30-new', [run('v2', 'New prose.')]);
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

describe('the A/B page', () => {
	it('lists versions by label, newest first', async () => {
		expect((await listVersions(root)).map((version) => version.label)).toEqual(['v2', 'v1']);
	});

	it('draws a blind pair of one brief, without footers', async () => {
		const [v2, v1] = await listVersions(root);
		if (!(v1 && v2)) {
			throw new Error('expected two versions');
		}
		const pair = await randomPair(root, v1, v2, seededRandom(1));
		const texts = [pair?.left.passages[0], pair?.right.passages[0]].sort();
		expect(texts).toEqual(['New prose.', 'Old prose.']);
		expect(pair?.pairId).not.toContain('v1');
	});

	it('turns a vote for a side back into A or B, whichever side it was on', async () => {
		const [v2, v1] = await listVersions(root);
		if (!(v1 && v2)) {
			throw new Error('expected two versions');
		}
		for (const seed of [1, 2, 3, 4]) {
			const pair = await randomPair(root, v1, v2, seededRandom(seed));
			if (!pair) {
				throw new Error('expected a pair');
			}
			const newIsLeft = pair.left.passages[0] === 'New prose.';
			const vote = await recordVote(root, pair.pairId, newIsLeft ? 'left' : 'right', ['loved']);
			// v2 is B, so a vote for the new prose is a win for B, on either side.
			expect(vote).toMatchObject({ a: 'v1', b: 'v2', winner: 'b', tags: ['loved'] });
		}
		expect(await readVotes(root)).toHaveLength(4);
	});
});
