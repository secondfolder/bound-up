#!/usr/bin/env -S npx tsx
/**
 * Writes the prompt catalogue: every prompt the daydream builders can send,
 * into prompt-catalogue/ (gitignored; docs/prompt-review.md).
 *
 *   npm run prompts:export
 *
 * Run it to read what a prompt change sends, and for the debug page, which
 * reads what it writes. With --full it also writes every distinct prompt whole,
 * one JSON line each, to prompt-catalogue/.full/ (gitignored), for grepping:
 * close to 200 MB, mostly the replies, so only when asked for.
 *
 *   npm run prompts:export -- --full
 *
 * Files the export no longer produces are deleted, so a builder or axis that
 * goes away takes its files with it. Anything starting with a dot is left
 * alone: that is where the full export and the review script's output live.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import {
	CATALOGUE_DIR,
	exportFiles,
	fullExport
} from '../src/lib/server/daydream/prompt-catalogue/export.ts';

const ROOT = new URL('../', import.meta.url).pathname;
const OUT = join(ROOT, CATALOGUE_DIR);
const FULL = join(OUT, '.full');

async function filesUnder(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
	const nested = await Promise.all(
		entries
			.filter((entry) => !entry.name.startsWith('.'))
			.map((entry) =>
				entry.isDirectory()
					? filesUnder(join(directory, entry.name))
					: Promise.resolve([join(directory, entry.name)])
			)
	);
	return nested.flat();
}

const started = performance.now();
const { files, catalogues } = exportFiles();

for (const existing of await filesUnder(OUT)) {
	if (!files.has(relative(OUT, existing))) {
		await rm(existing);
	}
}
for (const [path, contents] of files) {
	const target = join(OUT, path);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, contents);
}
if (process.argv.includes('--full')) {
	await mkdir(FULL, { recursive: true });
	for (const [path, contents] of fullExport()) {
		await writeFile(join(FULL, path), contents);
	}
}

for (const catalogue of catalogues) {
	console.info(
		`${catalogue.builder.id.padEnd(14)} ${String(catalogue.distinctPrompts).padStart(6)} prompts  ${String(catalogue.paragraphs.length).padStart(4)} paragraphs  ${catalogue.lint.length} lint`
	);
}
console.info(
	`Wrote ${CATALOGUE_DIR}/ in ${Math.round(performance.now() - started)} ms. Read it there, or at /debug/prompts on the dev server.`
);
