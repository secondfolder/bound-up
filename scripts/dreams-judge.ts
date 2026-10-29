#!/usr/bin/env -S npx tsx
/**
 * Compares two bench folders with the pairwise judge (docs/dreams.md,
 * "Quality tools"): every pair of runs of the same brief, every question,
 * asked in both orders. Results are cached by content, so judging again after
 * a change only judges what changed.
 *
 *   npm run dreams:judge -- --a dream-bench/<folder-a> --b dream-bench/<folder-b> --model openai/gpt-5-mini
 *
 * Use a judge from a different model family than the writer, or it favours
 * its own style. It costs real money; the report says how much.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
	combine,
	emptyTally,
	evenMaterial,
	JUDGE_QUESTIONS,
	judgeMessages,
	type Outcome,
	pairRuns,
	parseVerdict,
	type Verdict
} from '../src/lib/server/dream/bench/judge.ts';
import type { BenchRun } from '../src/lib/server/dream/bench/run.ts';
import { complete } from '../src/lib/server/dream/openrouter.ts';
import { apiKey, ROOT } from './dreams-key.ts';

const BASE_URL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
const MARKDOWN_EXTENSION = /\.md$/;
const CACHE = join(ROOT, 'dream-bench', '.judge-cache.json');

const { values } = parseArgs({
	options: {
		a: { type: 'string' },
		b: { type: 'string' },
		model: { type: 'string' }
	}
});

type Cache = Record<string, { verdict: Verdict | null; reason: string; cost: number }>;

async function readJson<T>(path: string, fallback: T): Promise<T> {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as T;
	} catch {
		return fallback;
	}
}

async function main(): Promise<void> {
	if (!(values.a && values.b && values.model)) {
		throw new Error('Pass --a and --b (two dream-bench folders) and --model (the judge).');
	}
	const judge = values.model;
	const key = await apiKey();
	const runsA = await readJson<BenchRun[]>(join(resolve(values.a), 'runs.json'), []);
	const runsB = await readJson<BenchRun[]>(join(resolve(values.b), 'runs.json'), []);
	const pairs = pairRuns(runsA, runsB);
	if (pairs.length === 0) {
		throw new Error('No runs of the same brief in both folders to compare.');
	}
	const writers = new Set([...runsA, ...runsB].map((run) => run.model.split('/')[0]));
	if (writers.has(judge.split('/')[0])) {
		process.stderr.write(
			`Warning: ${judge} is from the same family as a writer, and may favour it.\n`
		);
	}
	const cache = await readJson<Cache>(CACHE, {});
	const tally = emptyTally();
	const notes: string[] = [];
	let cost = 0;
	const ask = async (brief: string, question: string, first: string, second: string) => {
		const id = createHash('sha256')
			.update(JSON.stringify([judge, question, first, second]))
			.digest('hex');
		const cached = cache[id];
		if (cached) {
			return cached;
		}
		const completion = await complete({
			baseUrl: BASE_URL,
			apiKey: key,
			model: judge,
			messages: judgeMessages(brief, question, first, second),
			temperature: 0,
			maxTokens: 300
		});
		const parsed = parseVerdict(completion.text);
		const entry = {
			verdict: parsed?.verdict ?? null,
			reason: parsed?.reason ?? '',
			cost: completion.usage.cost ?? 0
		};
		cost += entry.cost;
		cache[id] = entry;
		return entry;
	};
	for (const pair of pairs) {
		const [a, b] = evenMaterial(pair.a, pair.b);
		for (const question of JUDGE_QUESTIONS) {
			const aFirst = await ask(pair.brief, question.text, a, b);
			const bFirst = await ask(pair.brief, question.text, b, a);
			const outcome: Outcome = combine(aFirst.verdict, bFirst.verdict);
			tally[question.id][outcome] += 1;
			if (outcome !== 'inconsistent') {
				notes.push(`- ${pair.a.brief.id} · ${question.id}: **${outcome}**. ${aFirst.reason}`);
			}
		}
		process.stdout.write(`· ${pair.a.brief.id}\n`);
	}
	await writeFile(CACHE, JSON.stringify(cache));
	const labelA = runsA[0]?.label ?? basename(values.a);
	const labelB = runsB[0]?.label ?? basename(values.b);
	const lines = [
		`# Judge: A ${labelA} against B ${labelB}`,
		'',
		`${pairs.length} pairs, judged by ${judge}, $${cost.toFixed(4)} this time (cached verdicts are free).`,
		'Only verdicts that agreed in both orders count. The judge sorts; your votes decide.',
		'',
		'| Question | A wins | B wins | Ties | Inconsistent |',
		'| --- | --- | --- | --- | --- |',
		...JUDGE_QUESTIONS.map((question) => {
			const row = tally[question.id];
			return `| ${question.id} | ${row.a} | ${row.b} | ${row.tie} | ${row.inconsistent} |`;
		}),
		'',
		'## Reasons',
		'',
		...notes
	];
	const out = join(ROOT, 'dream-bench', `judge-${labelA}-vs-${labelB}.md`);
	await writeFile(out, lines.join('\n'));
	await writeFile(
		out.replace(MARKDOWN_EXTENSION, '.json'),
		JSON.stringify({ a: values.a, b: values.b, judge, tally }, null, '\t')
	);
	process.stdout.write(`\nWrote ${out}\n`);
}

main().catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exit(1);
});
