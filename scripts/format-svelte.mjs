#!/usr/bin/env node
/**
 * Formats the <script> and <style> blocks of every .svelte file with Biome,
 * leaving the markup exactly as written.
 *
 * Why this exists: Biome's own Svelte formatter (html.experimentalFullSupport)
 * is not safe on this codebase yet — in 2.5.14 it deletes some template
 * comments, duplicates others on every run, and re-flows inline markup whose
 * whitespace is load-bearing (RichTextInline). So biome.jsonc switches the
 * formatter off for .svelte, and this script hands only the embedded
 * TypeScript and CSS to Biome, which formats those languages reliably. Delete
 * it, and the override, once Biome's Svelte formatter can be trusted.
 *
 *   node scripts/format-svelte.mjs           rewrite files in place
 *   node scripts/format-svelte.mjs --check   exit 1 if anything would change
 *   node scripts/format-svelte.mjs a.svelte  only the named files
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

// Attribute values are matched whole, since `generics="T extends Record<K, V>"`
// contains a `>` that is not the end of the tag.
const BLOCK =
	/(?<open><(?<tag>script|style)(?<attributes>\s(?:[^>"']|"[^"]*"|'[^']*')*)?>)(?<body>[\s\S]*?)(?<close><\/\k<tag>>)/g;
const TYPESCRIPT = /lang=["']ts["']/;
const LEADING_NEWLINE = /^\n/;
const ONE_TAB = /^\t/;
const TRAILING_NEWLINES = /\n+$/;
const BIOME = new URL('../node_modules/.bin/biome', import.meta.url).pathname;
const CONCURRENCY = 8;

const args = process.argv.slice(2);
const check = args.includes('--check');
const named = args.filter((arg) => !arg.startsWith('--') && arg.endsWith('.svelte'));
const files =
	named.length > 0
		? named
		: execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.svelte'], {
				encoding: 'utf8'
			})
				.split('\n')
				.filter(Boolean)
				// `--cached` still lists a file deleted in the working tree until the
				// deletion is committed, and reading it would crash the whole run.
				.filter((file) => existsSync(file));

/**
 * Lines that start inside a template literal. Their leading whitespace is
 * string content — the halftone shader source, say — so it must be neither
 * stripped nor added to.
 */
function templateLiteralLines(code) {
	const inside = new Set();
	const scanner = ts.createScanner(
		ts.ScriptTarget.Latest,
		false,
		ts.LanguageVariant.Standard,
		code
	);
	const lineOf = (pos) => code.slice(0, pos).split('\n').length - 1;
	const mark = (start, end) => {
		for (let line = lineOf(start) + 1; line <= lineOf(end); line += 1) {
			inside.add(line);
		}
	};
	// Brace depth at each open `${`, so a `}` is only re-read as the rest of a
	// template when it closes a substitution rather than an ordinary block.
	const substitutions = [];
	let depth = 0;
	let token = scanner.scan();
	while (token !== ts.SyntaxKind.EndOfFileToken) {
		if (token === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
			mark(scanner.getTokenStart(), scanner.getTokenEnd());
		} else if (token === ts.SyntaxKind.TemplateHead) {
			mark(scanner.getTokenStart(), scanner.getTokenEnd());
			substitutions.push(depth);
		} else if (token === ts.SyntaxKind.OpenBraceToken) {
			depth += 1;
		} else if (token === ts.SyntaxKind.CloseBraceToken) {
			if (substitutions.at(-1) === depth) {
				const rescanned = scanner.reScanTemplateToken(false);
				mark(scanner.getTokenStart(), scanner.getTokenEnd());
				if (rescanned === ts.SyntaxKind.TemplateTail) {
					substitutions.pop();
				}
			} else {
				depth -= 1;
			}
		}
		token = scanner.scan();
	}
	return inside;
}

function reindent(code, change, isScript) {
	const skip = isScript ? templateLiteralLines(code) : new Set();
	return code
		.split('\n')
		.map((line, index) => (skip.has(index) || line === '' ? line : change(line)))
		.join('\n');
}

function biomeFormat(code, virtualPath) {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(BIOME, ['format', `--stdin-file-path=${virtualPath}`], {
			stdio: ['pipe', 'pipe', 'pipe']
		});
		let out = '';
		let err = '';
		child.stdout.on('data', (chunk) => {
			out += chunk;
		});
		child.stderr.on('data', (chunk) => {
			err += chunk;
		});
		child.on('close', (status) => {
			if (status === 0) {
				resolvePromise(out);
			} else {
				reject(new Error(`biome could not format ${virtualPath}:\n${err}`));
			}
		});
		child.stdin.end(code);
	});
}

async function formatFile(file) {
	const source = await readFile(file, 'utf8');
	const blocks = [...source.matchAll(BLOCK)];
	let result = '';
	let cursor = 0;
	for (const block of blocks) {
		const [whole] = block;
		const { open, tag, attributes = '', body, close } = block.groups;
		const isScript = tag === 'script';
		let language = 'css';
		if (isScript) {
			language = TYPESCRIPT.test(attributes) ? 'ts' : 'js';
		}
		// Biome resolves settings by path, so the virtual file sits beside the
		// real one and picks up the same overrides.
		const virtualPath = `${file}.${tag}.${language}`;
		const dedented = reindent(
			body.replace(LEADING_NEWLINE, ''),
			(line) => line.replace(ONE_TAB, ''),
			isScript
		);
		const formatted = (await biomeFormat(dedented, virtualPath)).replace(TRAILING_NEWLINES, '');
		const indented = reindent(formatted, (line) => `\t${line}`, isScript);
		result += source.slice(cursor, block.index) + open;
		result += formatted === '' ? '' : `\n${indented}\n`;
		result += close;
		cursor = block.index + whole.length;
	}
	result += source.slice(cursor);
	return { file, changed: result !== source, result };
}

const unformatted = [];
const queue = [...files];
async function worker() {
	for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
		const { changed, result } = await formatFile(file);
		if (!changed) {
			continue;
		}
		if (check) {
			unformatted.push(file);
		} else {
			await writeFile(file, result);
			console.info(`formatted ${file}`);
		}
	}
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

if (unformatted.length > 0) {
	console.error(
		`These .svelte files have unformatted <script> or <style> blocks — run \`npm run format\`:\n${unformatted.map((file) => `  ${file}`).join('\n')}`
	);
	process.exit(1);
}
