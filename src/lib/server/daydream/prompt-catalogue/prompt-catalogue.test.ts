import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defined } from '$lib/testing/defined';
import { BUILDERS, baselineCombo, builderById, comboFrom, comboLabel } from './axes';
import {
	buildCatalogue,
	interactionProblems,
	paragraphContext,
	paragraphsOf,
	renderAll,
	reviewSelection,
	structuralAxes,
	textHash
} from './enumerate';
import { CATALOGUE_DIR, exportFiles, unifiedDiff } from './export';
import { lintPrompt } from './lint';
import { renderPrompt } from './render';

const builder = (id: string) => defined(builderById(id), `the "${id}" builder`);

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

describe('the committed prompt catalogue', () => {
	it('is what the builders produce now', { timeout: 60_000 }, async () => {
		const { files } = exportFiles();
		const root = join(process.cwd(), CATALOGUE_DIR);
		const onDisk = (await filesUnder(root))
			.map((path) => relative(root, path))
			.sort((a, b) => a.localeCompare(b));
		const stale =
			'The prompt catalogue is out of date: run `npm run prompts:export` and read the diff.';
		expect(onDisk, stale).toEqual([...files.keys()].sort((a, b) => a.localeCompare(b)));
		for (const [path, contents] of files) {
			// One file at a time, so a failure names it rather than dumping the lot.
			expect(await readFile(join(root, path), 'utf8'), `${path}: ${stale}`).toBe(contents);
		}
	});
});

describe('the axes', () => {
	it('gives every builder a baseline that is a request a device could send', () => {
		for (const entry of BUILDERS) {
			const result = renderPrompt(entry.id, baselineCombo(entry));
			expect(result.ok, `${entry.id}: ${result.ok ? '' : result.problem}`).toBe(true);
		}
	});

	it('reads a combination from a query, with anything missing or unknown at its baseline', () => {
		const reply = builder('reply');
		const combo = comboFrom(reply, { narrator: 'monologue', heat: 'scalding', nonsense: 'x' });
		expect(combo.narrator).toBe('monologue');
		expect(combo.heat).toBe('unset');
		expect(combo).not.toHaveProperty('nonsense');
		expect(comboLabel(reply, combo)).toBe('narrator=monologue');
		expect(comboLabel(reply, baselineCombo(reply))).toBe('baseline');
	});

	it('only ever swaps descriptive values for lines the baseline sweep shows', {
		timeout: 60_000
	}, () => {
		// Sampled for the replies, whose structural product is 20,000-odd;
		// every combination for the rest. Empty is what makes the catalogue
		// complete: see `interactionProblems`.
		for (const entry of BUILDERS) {
			expect(interactionProblems(entry, entry.id === 'reply' ? 41 : 1), entry.id).toEqual([]);
		}
	});
});

describe('the catalogue', () => {
	it('lists each paragraph once, with the options it appears under', () => {
		const catalogue = buildCatalogue(builder('daydream'));
		const texts = catalogue.paragraphs.map((paragraph) => paragraph.text);
		expect(new Set(texts).size).toBe(texts.length);
		const kept = defined(
			catalogue.paragraphs.find((paragraph) =>
				paragraph.text.includes('It was suggested to them as "monologue"')
			),
			'the paragraph keeping a monologue voice'
		);
		expect(kept.conditions.voice).toEqual(['monologue']);
		expect(kept.sweptOnly).toBe(false);
		const rules = defined(
			catalogue.paragraphs.find((paragraph) =>
				paragraph.text.startsWith('You help one adult user')
			),
			'the rules'
		);
		expect(rules.conditions).toEqual({});
		expect(rules.count).toBe(catalogue.structuralTotal);
	});

	it('counts the combinations no device could send, by reason, and reviews none of them', () => {
		const catalogue = buildCatalogue(builder('chips'));
		expect(catalogue.invalid).toEqual([{ problem: 'field: Chips are for one field', count: 54 }]);
		expect(catalogue.structuralTotal).toBe(66);
	});

	it('marks a paragraph only a swept descriptive value brings in', () => {
		const catalogue = buildCatalogue(builder('daydream'));
		const limits = catalogue.paragraphs.find((paragraph) => paragraph.text.includes('⟦limits⟧'));
		expect(defined(limits, 'the limits paragraph').conditions.limits).toEqual(['set']);
	});

	it('gives the same text the same id, and different text a different one', () => {
		expect(textHash('a paragraph')).toBe(textHash('a paragraph'));
		expect(textHash('a paragraph')).not.toBe(textHash('a paragraph.'));
		expect(textHash('')).toMatch(/^[0-9a-f]{14}$/);
	});

	it('splits a prompt into paragraphs at blank lines, keeping each one’s role', () => {
		expect(
			paragraphsOf({
				messages: [
					{ role: 'system', content: 'One.\n\nTwo\nlines.\n\n\nThree. ' },
					{ role: 'user', content: 'Four.' }
				],
				params: {}
			})
		).toEqual([
			{ role: 'system', text: 'One.' },
			{ role: 'system', text: 'Two\nlines.' },
			{ role: 'system', text: 'Three. ' },
			{ role: 'user', text: 'Four.' }
		]);
	});
});

describe('the review selection', () => {
	it('reads the baseline whole first, and every other paragraph whole or in context', () => {
		for (const entry of BUILDERS.filter(({ id }) => id !== 'reply')) {
			const { whole, inContext } = reviewSelection(entry);
			const first = defined(whole[0], `${entry.id}'s first whole prompt`);
			expect(comboLabel(entry, first.combo), entry.id).toBe('baseline');
			expect(whole.length).toBeLessThanOrEqual(12);
			const reviewed = new Set([
				...whole.flatMap(({ prompt }) => paragraphsOf(prompt).map(({ text }) => text)),
				...inContext.map(({ text }) => text)
			]);
			for (const { prompt } of renderAll(entry).structural) {
				for (const { text } of paragraphsOf(prompt)) {
					expect(reviewed.has(text), `${entry.id}: ${text.slice(0, 60)}`).toBe(true);
				}
			}
		}
	});

	it('covers every structural option in the whole prompts it reads', () => {
		const entry = builder('daydream');
		const { whole } = reviewSelection(entry);
		for (const axis of structuralAxes(entry)) {
			for (const value of axis.values) {
				expect(
					whole.some(({ combo }) => combo[axis.id] === value.id),
					`${axis.id}=${value.id}`
				).toBe(true);
			}
		}
	});

	it('shows a paragraph with its section and neighbours', () => {
		const context = paragraphContext(
			{
				messages: [
					{ role: 'system', content: '# Rules\n\nFirst.\n\nSecond.\n\nThird.' },
					{ role: 'user', content: 'Ask.' }
				],
				params: {}
			},
			'Second.'
		);
		expect(context).toBe(
			'[system message, under "# Rules"]\n\n…\nFirst.\n\n>>>>\nSecond.\n<<<<\n\nThird.\n…'
		);
	});
});

describe('lint', () => {
	const lint = (content: string) =>
		lintPrompt({ messages: [{ role: 'user', content }], params: {} }).map(({ rule }) => rule);

	it.each([
		['stray-value', 'The name is undefined here.'],
		['double-space', 'Two  spaces.'],
		['space-before-punctuation', 'A space , here.'],
		['leading-space', 'One.\n Leading.'],
		['trailing-space', 'Trailing. \nNext.'],
		['blank-lines', 'One.\n\n\nTwo.'],
		['repeated-word', 'If so, then, then do it.'],
		['unbalanced', 'Mark [[idea|this.'],
		['ordering-twice', 'Before anything else, read. Decide this before anything else.'],
		['typo', 'A seperate voice.']
	] as const)('finds %s', (rule, content) => {
		expect(lint(content)).toContain(rule);
	});

	it('lets alone what is meant: an indented list, a timetable, and a check-in in a sentence', () => {
		expect(lint('Steps:\n  1. First.\n  2. Second.')).toEqual([]);
		expect(lint('19:05  Kneel.')).toEqual([]);
		expect(lint('Write a short check-in in your own voice.')).toEqual([]);
	});
});

describe('the export', () => {
	it('diffs two texts as hunks only', () => {
		expect(unifiedDiff('a\nb\nc\n', 'a\nB\nc\n')).toBe('@@ -1,3 +1,3 @@\n a\n-b\n+B\n c');
		expect(unifiedDiff('same\n', 'same\n')).toBe('');
	});
});
