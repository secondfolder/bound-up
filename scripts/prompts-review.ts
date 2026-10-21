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
 * It refreshes the catalogue (`prompts:export`), writes what a review reads to
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
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { BUILDER_IDS } from '../src/lib/server/daydream/prompt-catalogue/axes.ts';
import {
	CATALOGUE_DIR,
	reviewFiles,
	unifiedDiff
} from '../src/lib/server/daydream/prompt-catalogue/export.ts';

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

/**
 * Writes the catalogue in `cwd`. With the heap `prompts:export` gives it:
 * enumerating every reply peaks a little over Node's default 4 GB, and a
 * checkout from before that flag has a package.json without it.
 */
const exportIn = (cwd: string) =>
	execFileSync('npx', ['tsx', 'scripts/prompts-export.ts'], {
		cwd,
		stdio: 'inherit',
		env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' }
	});

exportIn(ROOT);

await rm(REVIEW, { recursive: true, force: true });
for (const [path, contents] of reviewFiles()) {
	const target = join(REVIEW, path);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, contents);
}

/** The files an export writes that read as a diff: the JSON says what the markdown does. */
const COMPARED = [
	'lint.md',
	...BUILDER_IDS.flatMap((id) =>
		['baseline.md', 'axes.md', 'paragraphs.md'].map((file) => `${id}/${file}`)
	)
];

/**
 * What changed in the catalogue since `ref`. The catalogue is not committed
 * (docs/prompt-review.md), so it is exported at `ref` too, in a worktree of
 * its own that borrows this checkout's node_modules, and the two compared.
 */
async function changesSince(ref: string): Promise<string> {
	const before = await mkdtemp(join(tmpdir(), 'prompts-before-'));
	execFileSync('git', ['worktree', 'add', '--detach', before, ref], {
		cwd: ROOT,
		stdio: 'inherit'
	});
	try {
		await symlink(join(ROOT, 'node_modules'), join(before, 'node_modules'));
		// tsx resolves `$lib` through the tsconfig SvelteKit generates.
		execFileSync('npx', ['svelte-kit', 'sync'], { cwd: before, stdio: 'inherit' });
		exportIn(before);
		const read = (root: string, path: string) =>
			readFile(join(root, CATALOGUE_DIR, path), 'utf8').catch(() => '');
		const diffs = await Promise.all(
			COMPARED.map(async (path) => {
				const diff = unifiedDiff(await read(before, path), await read(ROOT, path));
				return diff ? `--- ${CATALOGUE_DIR}/${path}\n${diff}` : '';
			})
		);
		return diffs.filter(Boolean).join('\n\n');
	} finally {
		execFileSync('git', ['worktree', 'remove', '--force', before], { cwd: ROOT, stdio: 'inherit' });
	}
}

let changes = '';
if (since) {
	changes = await changesSince(since);
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
