#!/usr/bin/env -S npx tsx
/**
 * Runs the new daydream engine's bench: each brief through reading the brief,
 * picking, building and a few passages, on one or more models, and writes
 * every prompt and reply plus the automatic checks to dream-bench/
 * (gitignored). See docs/dreams.md, "Quality tools".
 *
 *   npm run dreams:bench -- --models nousresearch/hermes-4-405b
 *   npm run dreams:bench -- --models a/b,c/d --briefs training,texts --runs 3 --seed tuesday
 *
 * The OpenRouter key comes from OPENROUTER_API_KEY, or else from local.db's
 * server settings (Admin → Server settings), so a dev server's key works as-is.
 * It costs real money: the summary prints what each run spent.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createClient } from '@libsql/client';
import { BENCH_BRIEFS, type BenchBrief } from '../src/lib/server/dream/bench/briefs.ts';
import { runDocument, summary } from '../src/lib/server/dream/bench/report.ts';
import { type BenchRun, runBrief } from '../src/lib/server/dream/bench/run.ts';
import { complete } from '../src/lib/server/dream/openrouter.ts';

const ROOT = new URL('../', import.meta.url).pathname;
const BASE_URL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';

const { values } = parseArgs({
	options: {
		models: { type: 'string' },
		briefs: { type: 'string' },
		runs: { type: 'string' },
		passages: { type: 'string', default: '2' },
		seed: { type: 'string', default: 'bench' },
		concurrency: { type: 'string', default: '4' },
		temperature: { type: 'string', default: '1' }
	}
});

async function apiKey(): Promise<string> {
	if (process.env.OPENROUTER_API_KEY) {
		return process.env.OPENROUTER_API_KEY;
	}
	const db = createClient({ url: `file:${join(ROOT, 'local.db')}` });
	try {
		const result = await db.execute({
			sql: 'select value from server_settings where key = ?',
			args: ['openrouterApiKey']
		});
		const value = result.rows[0]?.value;
		if (typeof value === 'string' && value) {
			return value;
		}
	} catch {
		// No local.db, or no settings table yet: fall through to the message below.
	} finally {
		db.close();
	}
	throw new Error(
		'No OpenRouter key: set OPENROUTER_API_KEY, or set one in Admin → Server settings on a dev server (local.db).'
	);
}

function chosenBriefs(): BenchBrief[] {
	if (!values.briefs) {
		return [...BENCH_BRIEFS];
	}
	const ids = new Set(values.briefs.split(','));
	const chosen = BENCH_BRIEFS.filter((brief) => ids.has(brief.id));
	if (chosen.length !== ids.size) {
		const known = BENCH_BRIEFS.map((brief) => brief.id).join(', ');
		throw new Error(`Unknown brief in --briefs "${values.briefs}". Known: ${known}`);
	}
	return chosen;
}

async function pool<T>(tasks: (() => Promise<T>)[], size: number): Promise<T[]> {
	const results: T[] = [];
	let next = 0;
	const worker = async (): Promise<void> => {
		while (next < tasks.length) {
			const index = next;
			next += 1;
			const task = tasks[index];
			if (task) {
				results[index] = await task();
			}
		}
	};
	await Promise.all(Array.from({ length: size }, worker));
	return results;
}

async function main(): Promise<void> {
	if (!values.models) {
		throw new Error('Pass --models with one or more OpenRouter model ids, comma-separated.');
	}
	const key = await apiKey();
	const models = values.models.split(',');
	const passages = Number.parseInt(values.passages, 10);
	const temperature = Number.parseFloat(values.temperature);
	const tasks: (() => Promise<BenchRun>)[] = [];
	for (const brief of chosenBriefs()) {
		const runs = values.runs ? Number.parseInt(values.runs, 10) : (brief.runs ?? 3);
		for (const model of models) {
			for (let index = 0; index < runs; index += 1) {
				const seed = `${values.seed}-${index + 1}`;
				tasks.push(async () => {
					const run = await runBrief(brief, {
						model,
						seed,
						passages,
						complete: (messages) =>
							complete({
								baseUrl: BASE_URL,
								apiKey: key,
								model,
								messages,
								temperature,
								maxTokens: 4000
							})
					});
					process.stdout.write(`${run.error ? '✗' : '·'} ${brief.id} · ${model} · ${seed}\n`);
					return run;
				});
			}
		}
	}
	process.stdout.write(`Running ${tasks.length} bench runs…\n`);
	const results = await pool(tasks, Number.parseInt(values.concurrency, 10));
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const out = join(ROOT, 'dream-bench', `${stamp}-${values.seed}`);
	await mkdir(join(out, 'runs'), { recursive: true });
	await writeFile(join(out, 'summary.md'), summary(results));
	await writeFile(join(out, 'runs.json'), JSON.stringify(results, null, '\t'));
	for (const run of results) {
		const name = `${run.brief.id}--${run.model.replace(/\W+/g, '-')}--${run.seed}.md`;
		await writeFile(join(out, 'runs', name), runDocument(run));
	}
	process.stdout.write(`\nWrote ${out}/summary.md\n`);
}

main().catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exit(1);
});
