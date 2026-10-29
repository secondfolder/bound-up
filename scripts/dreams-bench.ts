#!/usr/bin/env -S npx tsx
/**
 * Runs the new daydream engine's bench: each brief through reading the brief,
 * picking, building and a few passages, on one or more models, and writes
 * every prompt and reply plus the automatic checks to dream-bench/
 * (gitignored). See docs/dreams.md, "Quality tools".
 *
 *   npm run dreams:bench -- --models nousresearch/hermes-4-405b
 *   npm run dreams:bench -- --models a/b,c/d --briefs training,texts --runs 3 --seed tuesday
 *   npm run dreams:bench -- --models a/b --briefs training --runs 1 --passages 20 --persona eager
 *
 * `--plain` leaves out code's variety (nudges, the weighted pick, the name
 * pool), as a baseline to measure it against.
 *
 * `--persona` has a simulated player take every turn (bench/player.ts):
 * eager, terse, steers, contrary, continues or explorer. Without it every
 * turn is Continue.
 *
 * The OpenRouter key comes from OPENROUTER_API_KEY, or else from local.db's
 * server settings (Admin → Server settings), so a dev server's key works as-is.
 * It costs real money: the summary prints what each run spent. It sends only
 * to the best tier of providers local.db's adult-content check found, as
 * the app does.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { BENCH_BRIEFS, type BenchBrief } from '../src/lib/server/dream/bench/briefs.ts';
import { isPersona, PERSONAS } from '../src/lib/server/dream/bench/player.ts';
import { runDocument, summary } from '../src/lib/server/dream/bench/report.ts';
import { type BenchRun, runBrief } from '../src/lib/server/dream/bench/run.ts';
import { stream } from '../src/lib/server/dream/openrouter.ts';
import { isStep, SAMPLING, type Sampling } from '../src/lib/server/dream/sampling.ts';
import { apiKey, bestTierProviders, ROOT } from './dreams-key.ts';

const BASE_URL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';

const { values } = parseArgs({
	options: {
		models: { type: 'string' },
		briefs: { type: 'string' },
		runs: { type: 'string' },
		passages: { type: 'string', default: '2' },
		seed: { type: 'string', default: 'bench' },
		concurrency: { type: 'string', default: '4' },
		temperature: { type: 'string' },
		label: { type: 'string' },
		'fingerprint-model': { type: 'string' },
		persona: { type: 'string' },
		plain: { type: 'boolean', default: false }
	}
});

/**
 * The prompt version under test: the commit, marked "+dirty" when the engine's
 * code has uncommitted changes, so two bench folders can be told apart.
 */
function defaultLabel(): string {
	const git = (args: string[]): string =>
		execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
	try {
		const commit = git(['rev-parse', '--short', 'HEAD']);
		const dirty = git(['status', '--porcelain', 'src/lib/dream', 'src/lib/server/dream']);
		return dirty ? `${commit}+dirty` : commit;
	} catch {
		return 'unlabelled';
	}
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
	/** The app's settings for the step (`SAMPLING`), unless --temperature overrides them. */
	const samplingFor = (step: string): Sampling => {
		const name = step.split(' ')[0] ?? '';
		const base: Sampling = isStep(name) ? SAMPLING[name] : SAMPLING.passage;
		return values.temperature
			? { ...base, temperature: Number.parseFloat(values.temperature) }
			: base;
	};
	const label = values.label ?? defaultLabel();
	const { persona } = values;
	if (persona !== undefined && !isPersona(persona)) {
		throw new Error(`Unknown --persona "${persona}". Known: ${Object.keys(PERSONAS).join(', ')}`);
	}
	const fingerprintModel = values['fingerprint-model'] ?? models[0] ?? '';
	// The best tier of providers, as the app routes (docs/dreams.md).
	const routes = new Map<string, string[]>();
	for (const model of new Set([...models, fingerprintModel])) {
		routes.set(model, await bestTierProviders(model));
	}
	const fingerprint = (messages: Parameters<typeof stream>[0]['messages']) =>
		stream({
			baseUrl: BASE_URL,
			apiKey: key,
			model: fingerprintModel,
			providers: routes.get(fingerprintModel),
			messages,
			temperature: 0,
			maxTokens: 400
		});
	const tasks: (() => Promise<BenchRun>)[] = [];
	for (const brief of chosenBriefs()) {
		const runs = values.runs ? Number.parseInt(values.runs, 10) : (brief.runs ?? 3);
		for (const model of models) {
			for (let index = 0; index < runs; index += 1) {
				const seed = `${values.seed}-${index + 1}`;
				tasks.push(async () => {
					const run = await runBrief(brief, {
						label,
						model,
						fingerprint,
						seed,
						passages,
						// The same model plays the user: a session is one model's to run.
						...(persona ? { player: { persona } } : {}),
						plain: values.plain,
						complete: (messages, step) =>
							stream({
								baseUrl: BASE_URL,
								apiKey: key,
								model,
								providers: routes.get(model),
								messages,
								...samplingFor(step)
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
	const out = join(ROOT, 'dream-bench', `${stamp}-${label}-${values.seed}`);
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
