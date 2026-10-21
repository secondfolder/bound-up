import { diffLines, diffWordsWithSpace } from 'diff';

/**
 * The half of the prompt catalogue (docs/prompt-review.md) the debug page
 * runs in the browser: the shapes the server sends it, diffs, placeholder
 * highlighting, and which paragraphs this device has marked as reviewed.
 * Alias-free and pure but for the marks, which are this device's own.
 * The server half — the axes, the builders, the enumeration — is
 * `$lib/server/daydream/prompt-catalogue/`, which shares these types.
 */

export type AxisKind = 'structural' | 'descriptive';

export type AxisValue = { id: string; label: string };

export type Axis = {
	id: string;
	label: string;
	kind: AxisKind;
	values: readonly AxisValue[];
	/** The value every other axis is compared against. */
	baseline: string;
};

export type Combo = Record<string, string>;

export type PromptMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** What a builder sends for one combination: the messages, and the request's settings. */
export type RenderedPrompt = {
	messages: PromptMessage[];
	params: Record<string, string | number | boolean | null>;
};

export type LintRule =
	| 'stray-value'
	| 'double-space'
	| 'space-before-punctuation'
	| 'leading-space'
	| 'trailing-space'
	| 'blank-lines'
	| 'repeated-word'
	| 'unbalanced'
	| 'ordering-twice'
	| 'typo';

export type LintFinding = {
	rule: LintRule;
	/** What was found, with a little either side. */
	excerpt: string;
};

/** What each lint rule (`lint.ts` in the server half) looks for, in a phrase. */
export const LINT_RULE_LABELS: Record<LintRule, string> = {
	'stray-value': 'A value that was never meant to be text: undefined, NaN, [object Object]',
	'double-space': 'Two spaces in a row inside a line',
	'space-before-punctuation': 'A space before a comma, full stop or similar',
	'leading-space': 'A line that starts with one space (two or more is indentation)',
	'trailing-space': 'A line that ends with a space',
	'blank-lines': 'More than one blank line in a row',
	'repeated-word': 'The same word twice in a row',
	unbalanced: 'Brackets or marks that do not pair up in a message',
	'ordering-twice': 'An instruction about order ("before anything else") given more than once',
	typo: 'A known misspelling'
};

export type CatalogueParagraph = {
	id: string;
	text: string;
	/** The roles of the messages it appears in. */
	roles: string[];
	/** How many of the structural combinations it appears in, out of `structuralTotal`. */
	count: number;
	/**
	 * The axes it depends on: each with the values it appears under, where
	 * that is not every value. Approximate where several axes interact: it is
	 * the values seen, not a formula.
	 */
	conditions: Record<string, string[]>;
	/** Seen only when one descriptive axis was swept from the baseline. */
	sweptOnly: boolean;
	/** One combination it appears in, to open it. */
	example: Combo;
};

export type Catalogue = {
	builder: { id: string; label: string; description: string; axes: readonly Axis[] };
	baseline: { combo: Combo; text: string };
	/** Valid structural combinations rendered. */
	structuralTotal: number;
	/** Combinations no device could send, by the reason the schema gives. */
	invalid: { problem: string; count: number }[];
	distinctPrompts: number;
	paragraphs: CatalogueParagraph[];
	lint: (LintFinding & { count: number; example: Combo })[];
};

/** One prompt as /api/debug/prompts renders it. */
export type PromptView =
	| { combo: Combo; ok: false; problem: string }
	| {
			combo: Combo;
			ok: true;
			prompt: RenderedPrompt;
			text: string;
			/** The id of each paragraph, in order (`textHash`), to match them to the catalogue. */
			paragraphIds: string[];
			lint: LintFinding[];
	  };

/** The query-string prefix of an axis value, so an axis id never clashes with another parameter. */
export const AXIS_PARAM = 'a.';

/** A combination as query parameters, naming only what differs from the baseline. */
export function comboParams(axes: readonly Axis[], combo: Combo): [string, string][] {
	return axes.flatMap((axis) => {
		const value = combo[axis.id];
		return value !== undefined && value !== axis.baseline
			? [[`${AXIS_PARAM}${axis.id}`, value]]
			: [];
	});
}

/** A combination as one short line, naming only what differs from the baseline. */
export function describeCombo(axes: readonly Axis[], combo: Combo): string {
	const changed = axes.filter(
		(axis) => combo[axis.id] !== undefined && combo[axis.id] !== axis.baseline
	);
	return changed.length === 0
		? 'baseline'
		: changed.map((axis) => `${axis.id}=${combo[axis.id]}`).join(', ');
}

/** Roughly how many tokens a text is: four characters each, the usual rule of thumb for English. */
export function roughTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/** Where one paragraph of a prompt ends and the next begins: a blank line, or more. */
export const PARAGRAPH_BREAK = /\n{2,}/;

/** Split on, keeping each placeholder as a part of its own. */
const PLACEHOLDER = /(?<placeholder>⟦[^⟧]*⟧)/;

/** A text split into the prompt's own words and `⟦placeholders⟧` standing for the user's. */
export function placeholderSpans(text: string): { text: string; placeholder: boolean }[] {
	return text
		.split(PLACEHOLDER)
		.filter((part) => part !== '')
		.map((part) => ({ text: part, placeholder: part.startsWith('⟦') }));
}

// ── diffs ───────────────────────────────────────────────────────────────────

export type DiffSpan = { text: string; changed: boolean };

export type DiffLine =
	| { kind: 'same'; text: string; before: number; after: number }
	| { kind: 'removed'; spans: DiffSpan[]; before: number }
	| { kind: 'added'; spans: DiffSpan[]; after: number }
	/** Unchanged lines left out between hunks. */
	| { kind: 'skipped'; count: number };

/** The lines of a diff part: `diff` keeps a final newline on each part's value. */
function linesOf(value: string): string[] {
	const lines = value.split('\n');
	return lines.at(-1) === '' ? lines.slice(0, -1) : lines;
}

/**
 * Word-level spans for a block of removed lines against the added lines that
 * replace it, one list per line on each side, so a changed word stands out
 * inside a changed line.
 */
function wordSpans(
	removed: string[],
	added: string[]
): { before: DiffSpan[][]; after: DiffSpan[][] } {
	const parts = diffWordsWithSpace(removed.join('\n'), added.join('\n'));
	const side = (keep: (part: (typeof parts)[number]) => boolean, changed: 'added' | 'removed') => {
		const lines: DiffSpan[][] = [[]];
		for (const part of parts.filter(keep)) {
			part.value.split('\n').forEach((piece, index) => {
				if (index > 0) {
					lines.push([]);
				}
				if (piece !== '') {
					lines.at(-1)?.push({ text: piece, changed: Boolean(part[changed]) });
				}
			});
		}
		return lines;
	};
	return {
		before: side((part) => !part.added, 'removed'),
		after: side((part) => !part.removed, 'added')
	};
}

/**
 * Two prompt texts compared line by line, with changed words marked inside
 * changed lines, and unchanged runs longer than `context` either side of a
 * change folded away. `ignoreWhitespace` compares lines trimmed: spacing
 * inside a line still counts.
 */
export function diffTexts(
	before: string,
	after: string,
	{ context = 3, ignoreWhitespace = false }: { context?: number; ignoreWhitespace?: boolean } = {}
): { lines: DiffLine[]; added: number; removed: number } {
	const parts = diffLines(before, after, { ignoreWhitespace });
	const all: Exclude<DiffLine, { kind: 'skipped' }>[] = [];
	let beforeLine = 1;
	let afterLine = 1;
	let added = 0;
	let removed = 0;
	for (let index = 0; index < parts.length; index += 1) {
		const part = parts[index];
		if (!part) {
			continue;
		}
		if (part.removed) {
			const next = parts[index + 1];
			const removedLines = linesOf(part.value);
			const addedLines = next?.added ? linesOf(next.value) : [];
			const spans = wordSpans(removedLines, addedLines);
			for (const [line, lineSpans] of spans.before.entries()) {
				all.push({ kind: 'removed', spans: lineSpans, before: beforeLine + line });
			}
			beforeLine += removedLines.length;
			removed += removedLines.length;
			if (next?.added) {
				for (const [line, lineSpans] of spans.after.entries()) {
					all.push({ kind: 'added', spans: lineSpans, after: afterLine + line });
				}
				afterLine += addedLines.length;
				added += addedLines.length;
				index += 1;
			}
		} else if (part.added) {
			for (const text of linesOf(part.value)) {
				all.push({ kind: 'added', spans: [{ text, changed: true }], after: afterLine });
				afterLine += 1;
				added += 1;
			}
		} else {
			for (const text of linesOf(part.value)) {
				all.push({ kind: 'same', text, before: beforeLine, after: afterLine });
				beforeLine += 1;
				afterLine += 1;
			}
		}
	}
	const near = all.map((_, index) =>
		all
			.slice(Math.max(0, index - context), index + context + 1)
			.some((other) => other.kind !== 'same')
	);
	const lines: DiffLine[] = [];
	all.forEach((line, index) => {
		if (line.kind !== 'same' || near[index]) {
			lines.push(line);
			return;
		}
		const last = lines.at(-1);
		if (last?.kind === 'skipped') {
			last.count += 1;
		} else {
			lines.push({ kind: 'skipped', count: 1 });
		}
	});
	return { lines, added, removed };
}

/** A diff's lines side by side: removals beside the additions that replace them. */
export function sideBySide(
	lines: readonly DiffLine[]
): { before: DiffLine | null; after: DiffLine | null }[] {
	const rows: { before: DiffLine | null; after: DiffLine | null }[] = [];
	let index = 0;
	while (index < lines.length) {
		const line = lines[index] as DiffLine;
		if (line.kind === 'removed' || line.kind === 'added') {
			const removedRun: DiffLine[] = [];
			const addedRun: DiffLine[] = [];
			while (lines[index]?.kind === 'removed') {
				removedRun.push(lines[index] as DiffLine);
				index += 1;
			}
			while (lines[index]?.kind === 'added') {
				addedRun.push(lines[index] as DiffLine);
				index += 1;
			}
			for (let row = 0; row < Math.max(removedRun.length, addedRun.length); row += 1) {
				rows.push({ before: removedRun[row] ?? null, after: addedRun[row] ?? null });
			}
		} else {
			rows.push({ before: line, after: line });
			index += 1;
		}
	}
	return rows;
}

// ── reviewed marks ─────────────────────────────────────────────────────────

const REVIEWED_KEY = 'prompt-review:reviewed';

/**
 * The paragraphs this device has marked as reviewed, by id. A paragraph's id
 * is a hash of its text, so editing one makes it unreviewed again by itself,
 * and only what changed asks to be read again. A per-device convenience: it
 * lives in this browser and nowhere else, and an empty set if storage is not
 * there to read.
 */
export function readReviewed(): Set<string> {
	try {
		const stored = JSON.parse(localStorage.getItem(REVIEWED_KEY) ?? '[]');
		return new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : []);
	} catch {
		return new Set();
	}
}

export function writeReviewed(ids: ReadonlySet<string>): void {
	try {
		localStorage.setItem(REVIEWED_KEY, JSON.stringify([...ids].sort()));
	} catch {
		// Nowhere to keep it: the marks last as long as the page does.
	}
}
