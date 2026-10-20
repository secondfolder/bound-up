import { type Answer, isAnswered, type Level, type ListPayload, MAX_NOTE_LENGTH } from '../answers';

/**
 * What every importer produces, and how it joins a list. See docs/kink-list.md,
 * "Import and export".
 */

/** An answer as an import has it: no time yet, which is stamped when it is applied. */
export type ImportedAnswer = Omit<Answer, 'at'>;

export type ImportResult = {
	/** Where it came from, in words: "KinkList (Goctionni)". */
	source: string;
	/** Answers for catalogue kinks, by id. */
	answers: Record<string, ImportedAnswer>;
	/** Answered items no catalogue kink matched, listed in the preview and left out. */
	unmatched: { name: string; answer: ImportedAnswer }[];
};

/** The order answers are preferred in when two imported items land on one kink. */
const PREFERENCE: readonly Level[] = [
	'love',
	'like',
	'curious',
	'conditional',
	'dont-mind',
	'not-for-me',
	'limit'
];

export function mostPositive(levels: readonly Level[]): Level | undefined {
	return PREFERENCE.find((level) => levels.includes(level));
}

export type ApplyOptions = {
	/** `gaps` leaves every kink already answered alone; `replace` overwrites with the import. */
	mode: 'gaps' | 'replace';
	now?: number;
};

function trimmed(answer: ImportedAnswer): ImportedAnswer {
	return answer.note ? { ...answer, note: answer.note.slice(0, MAX_NOTE_LENGTH) } : answer;
}

/** The list with an import in it. Pure: the store saves what this returns. */
export function applyImport(
	list: ListPayload,
	result: ImportResult,
	options: ApplyOptions
): ListPayload {
	const at = options.now ?? Date.now();
	const answers = { ...list.answers };
	for (const [id, answer] of Object.entries(result.answers)) {
		if (options.mode === 'gaps' && isAnswered(answers[id])) {
			continue;
		}
		answers[id] = { ...trimmed(answer), at };
	}
	return { ...list, answers };
}
