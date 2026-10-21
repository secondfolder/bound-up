#!/usr/bin/env -S npx tsx
/**
 * Reviews the daydream prompts with Claude Code (docs/prompt-review.md,
 * "Reviewing with Claude").
 *
 *   npm run prompts:review                       every builder
 *   npm run prompts:review -- --builder daydream one builder (repeatable)
 *   npm run prompts:review -- --since main       weighted to what changed since a ref
 *   npm run prompts:review -- --prepare          write the files only, run nothing
 *
 * It refreshes the snapshot (`prompts:export`), writes what a review reads to
 * prompt-catalogue/.review/ (gitignored) — the brief, and per builder a few
 * whole prompts plus every other paragraph in context (`reviewSelection`) —
 * then runs `claude -p` once per builder, read-only, and gathers the answers
 * into prompt-catalogue/.review/REVIEW.md.
 *
 * One run per builder, because the replies alone are tens of thousands of
 * tokens to read whole, and a review that has to skim is not one. Needs the
 * `claude` CLI on the PATH and signed in; --prepare does not.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { BUILDER_IDS } from '../src/lib/server/daydream/prompt-catalogue/axes.ts';
import { CATALOGUE_DIR, reviewFiles } from '../src/lib/server/daydream/prompt-catalogue/export.ts';

const ROOT = new URL('../', import.meta.url).pathname;
const REVIEW = join(ROOT, CATALOGUE_DIR, '.review');

const args = process.argv.slice(2);
const valuesOf = (flag: string) =>
	args.flatMap((arg, index) =>
		arg === flag && args[index + 1] ? [args[index + 1] as string] : []
	);
const [since] = valuesOf('--since');
const prepareOnly = args.includes('--prepare');
const asked = valuesOf('--builder');
const unknown = asked.filter((id) => !(BUILDER_IDS as readonly string[]).includes(id));
if (unknown.length > 0) {
	console.error(`Unknown builder ${unknown.join(', ')}: choose from ${BUILDER_IDS.join(', ')}.`);
	process.exit(1);
}
const builders = asked.length > 0 ? asked : [...BUILDER_IDS];

execFileSync('npx', ['tsx', join(ROOT, 'scripts/prompts-export.ts')], {
	cwd: ROOT,
	stdio: 'inherit'
});

await rm(REVIEW, { recursive: true, force: true });
for (const [path, contents] of reviewFiles()) {
	const target = join(REVIEW, path);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, contents);
}

let changes = '';
if (since) {
	// The JSON says what the markdown does; the markdown is what reads as a diff.
	changes = execFileSync(
		'git',
		['diff', since, '--', CATALOGUE_DIR, `:!${CATALOGUE_DIR}/**/catalogue.json`],
		{ cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
	);
	await writeFile(join(REVIEW, 'CHANGES.diff'), changes);
}

const relativeReview = `${CATALOGUE_DIR}/.review`;
if (prepareOnly) {
	console.info(`Wrote ${relativeReview}/. Start with ${relativeReview}/BRIEF.md.`);
	process.exit(0);
}

function ask(prompt: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn('claude', ['-p', prompt, '--allowedTools', 'Read,Grep,Glob'], {
			cwd: ROOT,
			stdio: ['ignore', 'pipe', 'inherit']
		});
		let output = '';
		child.stdout.on('data', (chunk: Buffer) => {
			output += chunk.toString();
		});
		child.on('error', (error) =>
			reject(
				new Error(
					`Could not run claude (${error.message}). Install Claude Code and sign in, or use --prepare to write the files only.`
				)
			)
		);
		child.on('close', (code) =>
			code === 0 ? resolve(output.trim()) : reject(new Error(`claude exited with ${code}`))
		);
	});
}

/** What to look at first: what changed since `--since`, when it was given. */
function focusFor(builder: string): string {
	if (!since) {
		return '';
	}
	return changes.includes(`${CATALOGUE_DIR}/${builder}/`)
		? ` ${relativeReview}/CHANGES.diff holds what changed since ${since}: review those changes first and most closely, in the context of the whole prompts.`
		: ` Nothing in it changed since ${since}; review it as a whole.`;
}

const reviews: string[] = [];
for (const builder of builders) {
	console.info(`Reviewing ${builder}…`);
	const focus = focusFor(builder);
	const review = await ask(
		`Read ${relativeReview}/BRIEF.md and follow it for the "${builder}" builder only: its files are in ${relativeReview}/${builder}/ and ${CATALOGUE_DIR}/${builder}/.${focus} Answer with the review itself, in Markdown, and nothing else.`
	);
	await writeFile(join(REVIEW, builder, 'review.md'), `${review}\n`);
	reviews.push(`# ${builder}\n\n${review}`);
}
await writeFile(join(REVIEW, 'REVIEW.md'), `${reviews.join('\n\n')}\n`);
console.info(`Wrote ${relativeReview}/REVIEW.md.`);
