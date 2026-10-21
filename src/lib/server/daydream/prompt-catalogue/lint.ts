import {
	type LintFinding,
	type LintRule,
	PARAGRAPH_BREAK,
	type RenderedPrompt
} from '$lib/prompt-review';

/**
 * Mechanical checks over a rendered prompt (docs/prompt-review.md, "Lint"):
 * the slips a person reading thousands of variants would miss, all of them
 * ones that have shipped here — a template's leftover space before
 * "Rate the idea", a word typed twice, the same ordering instruction given
 * twice. They read what is sent, not the source, so a slip that only shows
 * when two branches meet is caught too.
 *
 * Findings are for a reviewer, not a gate: the catalogue lists them, and the
 * snapshot makes a new one show in the diff.
 */

/** Phrases that claim first place: given twice, one of them is wrong. */
const ORDERING_PHRASES = [
	'before anything else',
	'first of all',
	'above all else',
	'the very first'
];

/** Misspellings seen here or common enough to check for. */
const TYPOS = [
	'seperate',
	'approprate',
	'definately',
	'occured',
	'recieve',
	'wich',
	'teh',
	'untill',
	'sumarise',
	'privilates',
	'posible',
	'breif',
	'inculding'
];

/** Words a sentence may legitimately repeat ("that that" is rare enough to be worth a look). */
const REPEATABLE = new Set(['had', 'very', 'ha', 'no', 'so', 'bye', 'hush', 'more', 'now']);

/** A word, then the same word again. Not after a hyphen: "a check-in in your own voice" says "in" once. */
const REPEATED_WORD = /(?<![-\w])(?<word>[A-Za-z]+)\b[ ,]+\k<word>\b/gi;

const PAIRS: [string, string][] = [
	['[[', ']]'],
	['{', '}'],
	['(', ')'],
	['“', '”'],
	['⟦', '⟧']
];

function around(text: string, index: number, length: number): string {
	const start = Math.max(0, index - 30);
	const end = Math.min(text.length, index + length + 30);
	return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`.replace(
		/\n/g,
		'⏎'
	);
}

function count(text: string, needle: string): number {
	let found = 0;
	let index = text.indexOf(needle);
	while (index !== -1) {
		found += 1;
		index = text.indexOf(needle, index + needle.length);
	}
	return found;
}

/** The checks that need only a paragraph: run once per distinct paragraph, which is most of the cost saved. */
export function lintText(text: string): LintFinding[] {
	const findings: LintFinding[] = [];
	const scan = (rule: LintRule, pattern: RegExp) => {
		for (const match of text.matchAll(pattern)) {
			findings.push({ rule, excerpt: around(text, match.index, match[0].length) });
		}
	};
	scan('stray-value', /\bundefined\b|\bNaN\b|\[object Object\]/g);
	// Not after a digit: a timetable's "19:05  Kneel" lines its entries up on purpose.
	scan('double-space', /[^\s\d] {2,}\S/g);
	scan('space-before-punctuation', / [,.;:!?](?=\s|$)/g);
	// One space only: two or more is a list indented on purpose.
	scan('leading-space', /^ \S/gm);
	scan('trailing-space', /\S +$/gm);
	for (const match of text.matchAll(REPEATED_WORD)) {
		if (!REPEATABLE.has(match.groups?.word?.toLowerCase() ?? '')) {
			findings.push({ rule: 'repeated-word', excerpt: around(text, match.index, match[0].length) });
		}
	}
	const lower = text.toLowerCase();
	for (const typo of TYPOS) {
		for (const match of lower.matchAll(new RegExp(`\\b${typo}\\b`, 'g'))) {
			findings.push({ rule: 'typo', excerpt: around(text, match.index, typo.length) });
		}
	}
	return findings;
}

/** The checks that need a whole message or prompt: pairs, blank lines, and order claimed twice. */
export function lintStructure(prompt: RenderedPrompt): LintFinding[] {
	const findings: LintFinding[] = [];
	for (const message of prompt.messages) {
		const text = message.content;
		for (const match of text.matchAll(/\n{3,}/g)) {
			findings.push({ rule: 'blank-lines', excerpt: around(text, match.index, match[0].length) });
		}
		for (const [open, close] of PAIRS) {
			const opened = count(text, open);
			const closed = count(text, close);
			if (opened !== closed) {
				findings.push({
					rule: 'unbalanced',
					excerpt: `${message.role} message: ${opened} × ${open} against ${closed} × ${close}`
				});
			}
		}
	}
	const whole = prompt.messages
		.map((message) => message.content)
		.join('\n\n')
		.toLowerCase();
	for (const phrase of ORDERING_PHRASES) {
		const times = count(whole, phrase);
		if (times > 1) {
			findings.push({ rule: 'ordering-twice', excerpt: `"${phrase}" ×${times}` });
		}
	}
	return findings;
}

/** Every check on one prompt, for a single variant on the debug page. */
export function lintPrompt(prompt: RenderedPrompt): LintFinding[] {
	return [
		...prompt.messages.flatMap((message) =>
			message.content.split(PARAGRAPH_BREAK).flatMap((paragraph) => lintText(paragraph))
		),
		...lintStructure(prompt)
	];
}
