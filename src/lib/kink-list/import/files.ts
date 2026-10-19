import { z } from 'zod';
import {
	DETAIL_KEYS,
	DETAIL_STEPS,
	type Detail,
	LEVEL_LABELS,
	LEVELS,
	type Level,
	type ListPayload,
	listPayloadSchema
} from '../answers';
import { catalog, normaliseSearch, sidesOf } from '../catalog';
import type { ImportedAnswer, ImportResult } from './result';

/**
 * Files in and out: Bound Up's own JSON (everything, exactly) and CSV (a
 * spreadsheet anyone can read), and CSV from elsewhere — kinkbdsmtest.com's
 * export, the Duchy's checklist saved as CSV, or anyone's own spreadsheet.
 * Pure: the page reads the file and hands over its text.
 */

// ── JSON ─────────────────────────────────────────────────────────────────────

export const EXPORT_FORMAT = 'bound-up-kink-list';

const exportSchema = z.object({
	format: z.literal(EXPORT_FORMAT),
	version: z.literal(1),
	list: listPayloadSchema
});

export function exportJson(list: ListPayload, now = new Date()): string {
	return `${JSON.stringify({ format: EXPORT_FORMAT, version: 1, exportedAt: now.toISOString(), list }, null, 2)}\n`;
}

/** A Bound Up export, or null for anything else. Untrusted input: parsed, never cast. */
export function readExportJson(text: string): ListPayload | null {
	try {
		const parsed = exportSchema.safeParse(JSON.parse(text));
		return parsed.success ? parsed.data.list : null;
	} catch {
		return null;
	}
}

// ── CSV out ──────────────────────────────────────────────────────────────────

const NEEDS_QUOTES = /[",\n\r]/;
const BYTE_ORDER_MARK = /^\uFEFF/;
/** "Hard limit (never)" reads as "Hard limit". */
const TRAILING_ASIDE = /\s*\(.*\)$/;
const NAME_HEADING = /^(?:kink|activity|item|name|act|fetish|title)s?$/i;
const ANSWER_HEADING = /answer|response|rating|choice|interest|status|selection|your/i;
const NOTE_HEADING = /note|comment|condition/i;
const CATEGORY_HEADING = /^(?:category|section|group)$/i;

const CSV_HEADINGS = [
	'Id',
	'Category',
	'Kink',
	'Answer',
	'First side',
	'First side answer',
	'Second side',
	'Second side answer',
	'Into it as a fantasy',
	'Into actually doing it',
	'Experience',
	'Note'
] as const;

function csvCell(value: string): string {
	return NEEDS_QUOTES.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function stepWord(detail: Detail | undefined, key: (typeof DETAIL_KEYS)[number]): string {
	const step = detail?.[key];
	return step === undefined ? '' : (DETAIL_STEPS[key][step] ?? '');
}

/** Every kink with an answer or a note, one row each, catalogue order then custom kinks. */
export function exportCsv(list: ListPayload): string {
	const rows: string[][] = [[...CSV_HEADINGS]];
	const categoryName = (id: string) => catalog.items.find((item) => item.id === id)?.name ?? '';
	const row = (
		id: string,
		category: string,
		name: string,
		sides: readonly [string, string] | null
	) => {
		const answer = list.answers[id];
		if (!(answer && (answer.level || answer.sides || answer.note || answer.detail))) {
			return;
		}
		const level = (value: Level | undefined) => (value ? LEVEL_LABELS[value] : '');
		rows.push([
			id,
			category,
			name,
			level(answer.level),
			answer.sides ? (sides?.[0] ?? 'First side') : '',
			level(answer.sides?.a?.level),
			answer.sides ? (sides?.[1] ?? 'Second side') : '',
			level(answer.sides?.b?.level),
			stepWord(answer.detail, 'fantasy'),
			stepWord(answer.detail, 'doing'),
			stepWord(answer.detail, 'experience'),
			answer.note ?? ''
		]);
	};
	const byId = new Map(catalog.items.map((item) => [item.id, item]));
	for (const item of catalog.items) {
		if (item.parent === undefined) {
			continue;
		}
		let category = item;
		while (category.parent) {
			category = byId.get(category.parent) ?? category;
		}
		row(item.id, category.name, item.name, sidesOf(item));
	}
	for (const [key, kink] of Object.entries(list.custom)) {
		if (!kink.removed) {
			row(key, categoryName(kink.categoryId), kink.name, null);
		}
	}
	return `${rows.map((cells) => cells.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

// ── CSV in ───────────────────────────────────────────────────────────────────

/** RFC 4180-ish: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	const input = text.replace(BYTE_ORDER_MARK, '');
	for (let index = 0; index < input.length; index += 1) {
		const char = input[index];
		if (quoted) {
			if (char === '"' && input[index + 1] === '"') {
				cell += '"';
				index += 1;
			} else if (char === '"') {
				quoted = false;
			} else {
				cell += char;
			}
		} else if (char === '"') {
			quoted = true;
		} else if (char === ',') {
			row.push(cell);
			cell = '';
		} else if (char === '\n' || char === '\r') {
			if (char === '\r' && input[index + 1] === '\n') {
				index += 1;
			}
			row.push(cell);
			rows.push(row);
			row = [];
			cell = '';
		} else {
			cell += char;
		}
	}
	if (cell || row.length > 0) {
		row.push(cell);
		rows.push(row);
	}
	return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
}

/**
 * Answer words, as other lists spell them, to ours. Numbers are left out on
 * purpose: a 1 to 5 means opposite things on different lists.
 */
const ANSWER_WORDS: Record<string, Level> = {
	favorite: 'love',
	favourite: 'love',
	love: 'love',
	'love it': 'love',
	'fetish need': 'love',
	'must have': 'love',
	like: 'like',
	yes: 'like',
	'like it': 'like',
	'liked it': 'like',
	curious: 'curious',
	maybe: 'curious',
	interested: 'curious',
	'would try': 'curious',
	'might try': 'curious',
	'want to try': 'curious',
	'would love to try': 'curious',
	okay: 'dont-mind',
	ok: 'dont-mind',
	indifferent: 'dont-mind',
	neutral: 'dont-mind',
	"don't mind": 'dont-mind',
	'dont mind': 'dont-mind',
	fine: 'dont-mind',
	conditional: 'conditional',
	depends: 'conditional',
	no: 'not-for-me',
	'not for me': 'not-for-me',
	'soft limit': 'not-for-me',
	'soft no': 'not-for-me',
	'no desire': 'not-for-me',
	pass: 'not-for-me',
	'hard limit': 'limit',
	limit: 'limit',
	never: 'limit',
	'hard no': 'limit'
};
for (const level of LEVELS) {
	ANSWER_WORDS[normaliseSearch(LEVEL_LABELS[level])] = level;
}

export function answerFromWord(word: string): Level | undefined {
	return (
		ANSWER_WORDS[normaliseSearch(word.replace(TRAILING_ASIDE, ''))] ??
		ANSWER_WORDS[word.trim().toLowerCase()]
	);
}

/** Catalogue kinks by name and every alias, for matching a spreadsheet's names. */
const NAME_INDEX = (() => {
	const index = new Map<string, string>();
	for (const item of catalog.items) {
		if (item.parent === undefined) {
			continue;
		}
		for (const name of [item.name, ...(item.aliases ?? [])]) {
			const key = normaliseSearch(name);
			if (!index.has(key)) {
				index.set(key, item.id);
			}
		}
	}
	return index;
})();

export function kinkIdForName(name: string): string | undefined {
	return NAME_INDEX.get(normaliseSearch(name));
}

function column(headings: string[], pattern: RegExp): number {
	return headings.findIndex((heading) => pattern.test(heading.trim()));
}

function stepFor(key: (typeof DETAIL_KEYS)[number], word: string | undefined): number | undefined {
	if (!word?.trim()) {
		return undefined;
	}
	const index = DETAIL_STEPS[key].findIndex(
		(step) => step.toLowerCase() === word.trim().toLowerCase()
	);
	return index === -1 ? undefined : index;
}

/** Bound Up's own CSV, read back exactly by its Id column. */
function readOwnCsv(rows: string[][]): ImportResult {
	const [headings = [], ...body] = rows;
	const at = (name: (typeof CSV_HEADINGS)[number]) => headings.indexOf(name);
	const result: ImportResult = { source: 'a Bound Up spreadsheet', answers: {}, unmatched: [] };
	for (const cells of body) {
		const cell = (name: (typeof CSV_HEADINGS)[number]) => cells[at(name)] ?? '';
		const answer: ImportedAnswer = {};
		const level = answerFromWord(cell('Answer'));
		if (level) {
			answer.level = level;
		}
		const a = answerFromWord(cell('First side answer'));
		const b = answerFromWord(cell('Second side answer'));
		if (a || b) {
			answer.sides = { ...(a ? { a: { level: a } } : {}), ...(b ? { b: { level: b } } : {}) };
		}
		const detail: Detail = {
			fantasy: stepFor('fantasy', cell('Into it as a fantasy')),
			doing: stepFor('doing', cell('Into actually doing it')),
			experience: stepFor('experience', cell('Experience'))
		};
		if (DETAIL_KEYS.some((key) => detail[key] !== undefined)) {
			answer.detail = detail;
		}
		if (cell('Note')) {
			answer.note = cell('Note');
		}
		const id = cell('Id');
		if (catalog.items.some((item) => item.id === id)) {
			result.answers[id] = answer;
		} else if (cell('Kink')) {
			result.unmatched.push({ name: cell('Kink'), category: cell('Category'), answer });
		}
	}
	return result;
}

/**
 * A spreadsheet from anywhere: the kink is the column headed like a name
 * (Kink, Activity, Item…) or else the first, the answer the column headed
 * like one (Answer, Response, Rating…) or else the second, and a note column
 * if there is one. Names match the catalogue's names and aliases.
 */
export function importCsv(text: string): ImportResult | null {
	const rows = parseCsv(text);
	const [headings] = rows;
	if (!headings || rows.length < 2) {
		return null;
	}
	if (headings[0] === 'Id' && headings.includes('Kink') && headings.includes('Answer')) {
		return readOwnCsv(rows);
	}
	const nameColumn = Math.max(column(headings, NAME_HEADING), 0);
	const found = column(headings, ANSWER_HEADING);
	// With no column headed like an answer, it is the first column that is not the kink.
	const firstOther = nameColumn === 0 ? 1 : 0;
	const answerColumn = found === -1 ? firstOther : found;
	const noteColumn = column(headings, NOTE_HEADING);
	const categoryColumn = column(headings, CATEGORY_HEADING);
	const result: ImportResult = { source: 'a spreadsheet', answers: {}, unmatched: [] };
	for (const cells of rows.slice(1)) {
		const name = cells[nameColumn]?.trim() ?? '';
		const level = answerFromWord(cells[answerColumn] ?? '');
		const note = noteColumn === -1 ? undefined : cells[noteColumn]?.trim() || undefined;
		if (!(name && (level || note))) {
			continue;
		}
		const answer: ImportedAnswer = { ...(level ? { level } : {}), ...(note ? { note } : {}) };
		const id = kinkIdForName(name);
		if (id) {
			result.answers[id] = answer;
		} else {
			result.unmatched.push({
				name,
				category: categoryColumn === -1 ? undefined : cells[categoryColumn],
				answer
			});
		}
	}
	return Object.keys(result.answers).length + result.unmatched.length > 0 ? result : null;
}

/** A Bound Up list (from its JSON or a share link) as an import. */
export function importList(list: ListPayload, source: string): ImportResult {
	const result: ImportResult = { source, answers: {}, unmatched: [] };
	for (const [key, answer] of Object.entries(list.answers)) {
		const { at: _at, ...rest } = answer;
		const custom = list.custom[key];
		if (custom) {
			if (!custom.removed) {
				result.unmatched.push({ name: custom.name, category: custom.categoryId, answer: rest });
			}
		} else {
			result.answers[key] = rest;
		}
	}
	return result;
}
