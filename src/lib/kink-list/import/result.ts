import {
	type Answer,
	isAnswered,
	type Level,
	type ListPayload,
	MAX_CUSTOM_ITEMS,
	MAX_CUSTOM_NAME_LENGTH,
	MAX_NOTE_LENGTH,
	newCustomKey
} from '../answers';
import { kinkById } from '../catalog';

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
	/** Answered items no catalogue kink matched. Each can become a kink of the person's own. */
	unmatched: { name: string; category?: string; answer: ImportedAnswer }[];
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
	/** A category to add unmatched items to as the person's own kinks, or none to leave them out. */
	unmatchedTo: string | null;
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
	const custom = { ...list.custom };
	if (options.unmatchedTo) {
		const existing = new Set(
			Object.values(custom)
				.filter((kink) => !kink.removed)
				.map((kink) => kink.name.toLowerCase())
		);
		let room = MAX_CUSTOM_ITEMS - existing.size;
		for (const item of result.unmatched) {
			const name = item.name.trim().slice(0, MAX_CUSTOM_NAME_LENGTH);
			if (room <= 0 || !name || existing.has(name.toLowerCase())) {
				continue;
			}
			const key = newCustomKey();
			// An item that names one of our categories (a Bound Up export's own
			// kinks do) keeps it; anything else goes where the person chose.
			const own = item.category ? kinkById(item.category) : undefined;
			const categoryId = own && own.parent === undefined ? own.id : options.unmatchedTo;
			custom[key] = { name, categoryId, at };
			answers[key] = { ...trimmed(item.answer), at };
			existing.add(name.toLowerCase());
			room -= 1;
		}
	}
	return { ...list, answers, custom };
}
