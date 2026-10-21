/**
 * A daydream's setup as a short summary with blanks in it — "[A stranger on
 * the night train]. [Vesper] takes the seat across from you, and the journey
 * turns [slow-burning]. It's told [in the characters' own words, with no
 * narrator]." — which is how the setup form shows a daydream that is already
 * put together (`DaydreamSetupForm.svelte`, its summary layout). Each blank
 * is a piece the form makes into a control: the heat, the voice, each
 * character and the idea.
 *
 * The summary comes in two halves. The first is written with its blanks
 * marked as `[[key|words]]` (`parseMarkedSummary`): by the model, for a
 * draft it put together, or by hand, for a ready-made daydream. It opens with a
 * sentence on the daydream as a whole, nearly all of it the idea's blank, and
 * ends by saying how it is told. The model may leave a piece out rather than
 * force it in. The second half is written here, and holds every piece the
 * first left out, so every control is always on screen somewhere; without a
 * first half (a summary that could not be read), the premise stands in.
 *
 * The first half is only true of the setup it was written for. It is shown
 * for as long as the idea and how it is told are that setup's, and everyone
 * it names is still in it by that name; otherwise the premise takes its
 * place. A changed heat is only a word, so its blank just says the new one.
 *
 * Pure and alias-free.
 */

import {
	type DaydreamSetup,
	type DaydreamVoicePresetId,
	type DialValue,
	voicePreset
} from '../daydream';
import { IDEA_SLIDERS } from './dial-words';

/**
 * What debug mode shows of the marked summary a piece came from
 * (docs/debug-mode.md): a blank's `key` as it was written, to show it as
 * `[[key|words]]`, and a marker that was read as plain words in full. Absent
 * on anything the second paragraph wrote, which came from no marker.
 */
type FromMarker = { key?: string };

export type SummaryPiece =
	| { kind: 'text'; text: string; marker?: string }
	/** The idea's heat; `null` heat says "any kind of". */
	| ({ kind: 'heat'; label: string; heat: DialValue | null } & FromMarker)
	/** How it is told. */
	| ({ kind: 'voice'; label: string } & FromMarker)
	/** A character, by their index in the setup's list. */
	| ({ kind: 'character'; index: number; label: string } & FromMarker)
	| ({ kind: 'idea'; label: string } & FromMarker)
	/** Where the story starts, for an idea with openings to choose from (docs/daydreams.md, "Openings"). */
	| ({ kind: 'opening'; label: string } & FromMarker);

/** What a marked blank in the model's summary stands for. A character is named, as the model named them. */
export type SummarySlot =
	| { kind: 'heat' }
	| { kind: 'voice' }
	| { kind: 'idea' }
	| { kind: 'character'; name: string };

/**
 * The model's summary, read: its words, and the blanks it marked with the
 * words it used for each and the key as it wrote it. A marker read as plain
 * words keeps itself in full as `marker`, for debug mode.
 */
type MarkedPiece =
	| { kind: 'text'; text: string; marker?: string }
	| { kind: 'slot'; slot: SummarySlot; words: string; key: string };
export type MarkedSummary = readonly MarkedPiece[];

/** The model's summary and the setup it was written for. */
export type WrittenSummary = {
	marked: MarkedSummary;
	draft: Pick<DaydreamSetup, 'voice' | 'idea'>;
};

/** The longest summary kept, in visible characters: a paragraph, not a story. */
export const MAX_SUMMARY = 800;
/** The longest one read at all, markers included. */
const MAX_MARKED_SUMMARY = 2000;

/** `[[key|words]]`. Neither half may hold a bracket, so a marker never swallows the next. */
const MARKER = /\[\[(?<key>[^[\]|]*)\|(?<words>[^[\]]*)\]\]/g;

/** What is left of a marker the model got wrong. */
const STRAY_MARKER = /\[\[|\]\]/;

/** Whether a word takes "an". */
const VOWEL = /^[aeiou]/i;

/** Whether a paragraph already ends a sentence, closing quotes and brackets aside. */
const ENDS_SENTENCE = /[.!?…]["'”’)]*$/;

const text = (value: string): SummaryPiece => ({ kind: 'text', text: value });

const same = (a: string, b: string) =>
	a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

const tidy = (value: string) => value.replace(/\s+/g, ' ');

function slotFor(key: string, names: readonly string[]): SummarySlot | null {
	const word = key.trim().toLocaleLowerCase();
	if (word === 'heat' || word === 'voice' || word === 'idea') {
		return { kind: word };
	}
	const name = names.find((candidate) => same(candidate, key));
	return name ? { kind: 'character', name } : null;
}

const slotKey = (slot: SummarySlot) =>
	slot.kind === 'character' ? `character:${slot.name.toLocaleLowerCase()}` : slot.kind;

/**
 * The model's summary, from the `summary` of a `daydream` answer, with each
 * marker it wrapped round a first mention made a blank. `names` are the
 * characters' names, which is how the model marks each of them.
 *
 * Lenient where it can be: a marker for nothing in the story, or a second one
 * for the same thing, keeps its words as plain text. Null where it cannot —
 * not a string, too long, nothing in it, or a bracket left over from a marker
 * the model got wrong — since a summary showing its own markup is worse than
 * the premise in its place.
 */
export function parseMarkedSummary(raw: unknown, names: readonly string[]): MarkedSummary | null {
	if (typeof raw !== 'string' || raw.length > MAX_MARKED_SUMMARY) {
		return null;
	}
	const pieces: MarkedPiece[] = [];
	const addText = (value: string) => {
		const last = pieces.at(-1);
		if (last?.kind === 'text' && last.marker === undefined) {
			last.text += value;
		} else if (value) {
			pieces.push({ kind: 'text', text: value });
		}
	};
	const used = new Set<string>();
	let at = 0;
	for (const match of raw.matchAll(MARKER)) {
		addText(raw.slice(at, match.index));
		at = match.index + match[0].length;
		const { key = '', words = '' } = match.groups ?? {};
		const slot = slotFor(key, names);
		const shown = tidy(words).trim();
		if (slot && shown && !used.has(slotKey(slot))) {
			used.add(slotKey(slot));
			pieces.push({ kind: 'slot', slot, words: shown, key: key.trim() });
		} else {
			pieces.push({ kind: 'text', text: words, marker: match[0] });
		}
	}
	addText(raw.slice(at));

	const tidied = pieces.map((piece, index) => {
		if (piece.kind !== 'text') {
			return piece;
		}
		let value = tidy(piece.text);
		value = index === 0 ? value.trimStart() : value;
		value = index === pieces.length - 1 ? value.trimEnd() : value;
		return { ...piece, text: value };
	});
	const kept = tidied.filter(
		(piece) => piece.kind !== 'text' || piece.text !== '' || piece.marker !== undefined
	);
	const visible = kept.map((piece) => (piece.kind === 'text' ? piece.text : piece.words)).join('');
	if (visible.trim() === '' || visible.length > MAX_SUMMARY || STRAY_MARKER.test(visible)) {
		return null;
	}
	return kept;
}

/** The heat as a word: "steamy", but "SFW" kept as it is. */
function heatWord(heat: DialValue): string {
	const label = IDEA_SLIDERS.find((slider) => slider.key === 'heat')?.scale[heat].label ?? '';
	return label === 'SFW' ? label : label.toLocaleLowerCase();
}

const heatLabel = (heat: DialValue | null) => (heat === null ? 'any kind of' : heatWord(heat));

type Setup = Pick<DaydreamSetup, 'voice' | 'characters' | 'idea'> &
	Partial<Pick<DaydreamSetup, 'opening'>>;

/** What the opening blank says when the story starts from the idea's premise. */
export const FROM_THE_PREMISE = 'from the beginning';

/**
 * Where it starts, for an idea with openings to choose from: the blank is
 * the control for choosing one (`DaydreamSetupForm`). Nothing for an idea
 * with none, since there is nothing to choose.
 */
function startsSentence(setup: Setup): SummaryPiece[] {
	if (setup.idea.openings.length === 0) {
		return [];
	}
	const chosen = setup.idea.openings.find((opening) => opening.id === setup.opening);
	return [
		text('It starts '),
		{ kind: 'opening', label: chosen ? chosen.label.toLocaleLowerCase() : FROM_THE_PREMISE },
		text('.')
	];
}

/** Which pieces of the setup already have their blank. */
type Mentioned = { heat: boolean; voice: boolean; idea: boolean; characters: Set<number> };

const characterIndex = (setup: Setup, name: string) =>
	setup.characters.findIndex((character) => same(character.name, name));

/** Whether the model's summary is still about this setup (see the module comment). */
function stillDescribes({ marked, draft }: WrittenSummary, setup: Setup): boolean {
	const { voice, idea } = setup;
	return (
		idea.title === draft.idea.title &&
		idea.premise === draft.idea.premise &&
		voice.narrator === draft.voice.narrator &&
		voice.stance === draft.voice.stance &&
		voice.protagonistName === draft.voice.protagonistName &&
		marked.every(
			(piece) =>
				piece.kind !== 'slot' ||
				piece.slot.kind !== 'character' ||
				characterIndex(setup, piece.slot.name) !== -1
		)
	);
}

function fromMarked(
	{ marked, draft }: WrittenSummary,
	setup: Setup,
	mentioned: Mentioned
): SummaryPiece[] {
	const { heat } = setup.idea.dials;
	const pieces = marked.map((piece): SummaryPiece => {
		if (piece.kind === 'text') {
			return piece;
		}
		const { slot, words, key } = piece;
		switch (slot.kind) {
			case 'heat':
				mentioned.heat = true;
				// Its own word while the heat is the one it was written for.
				return {
					kind: 'heat',
					heat,
					label: heat === draft.idea.dials.heat ? words : heatLabel(heat),
					key
				};
			case 'voice':
				mentioned.voice = true;
				return { kind: 'voice', label: words, key };
			case 'idea':
				mentioned.idea = true;
				return { kind: 'idea', label: words, key };
			default: {
				const index = characterIndex(setup, slot.name);
				mentioned.characters.add(index);
				return { kind: 'character', index, label: words, key };
			}
		}
	});
	return withArticles(pieces);
}

/** An "a" or "an" just before a blank, as it was written. */
const ARTICLE = /(?<before>^|\s)(?<article>an?) $/i;

/**
 * "A [steamy] test" becomes "An [explicit] test", not "A explicit", when the
 * heat changes: the article before a blank agrees with the word in it now.
 * Only the heat's word ever changes under the words around it.
 */
function withArticles(pieces: SummaryPiece[]): SummaryPiece[] {
	return pieces.map((piece, at) => {
		const next = pieces[at + 1];
		const found = piece.kind === 'text' ? ARTICLE.exec(piece.text) : null;
		if (piece.kind !== 'text' || next?.kind !== 'heat' || !found?.groups) {
			return piece;
		}
		const { before = '', article = '' } = found.groups;
		const wanted = VOWEL.test(next.label) ? 'an' : 'a';
		const cased =
			article.charAt(0) === 'A' ? wanted.charAt(0).toUpperCase() + wanted.slice(1) : wanted;
		return { ...piece, text: `${piece.text.slice(0, found.index)}${before}${cased} ` };
	});
}

/** The premise as a paragraph: capitalised and finished, since a starting point's is a phrase. */
function fromPremise(setup: Setup): SummaryPiece[] {
	const premise = tidy(setup.idea.premise).trim();
	if (!premise) {
		return [];
	}
	const capital = premise.charAt(0).toLocaleUpperCase() + premise.slice(1);
	return [text(ENDS_SENTENCE.test(capital) ? capital : `${capital}.`)];
}

/**
 * Who a character is in this story, as "the interviewer, your boss"; empty
 * when neither is written. A relationship that already names the part says
 * it alone, rather than "the trainee, the trainee you are assessing".
 */
function castNote(setup: Setup, index: number): string {
	const character = setup.characters[index];
	if (!character) {
		return '';
	}
	const part = setup.idea.parts.find((candidate) => candidate.id === character.casting.partId);
	const relationship = character.casting.relationship.trim();
	const said =
		part && relationship.toLocaleLowerCase().includes(part.name.trim().toLocaleLowerCase());
	return [said ? '' : part?.name, relationship].filter(Boolean).join(', ');
}

/** "Ash", "Ash and Bel", "Ash, Bel and Cy", from pieces for each. */
function listOf(people: SummaryPiece[][]): SummaryPiece[] {
	return people.flatMap((person, at) => {
		if (at === 0) {
			return person;
		}
		return [text(at === people.length - 1 ? ' and ' : ', '), ...person];
	});
}

/**
 * How it is told, as the words after "It’s told": said outright, in a
 * sentence of its own, rather than as a verb in the story. "Where you talk
 * with Vesper" made talking sound like what the story was about, when it is
 * only how the story reaches the user. Exported for the prompt, so the
 * model's closing sentence and this one say it alike.
 */
export const TOLD_AS: Readonly<Record<DaydreamVoicePresetId, string>> = {
	talk: 'in the characters’ own words, with no narrator',
	told: 'to you by a narrator',
	watch: 'by a narrator, as you watch from outside',
	rules: 'as a system’s orders to you',
	command: 'as a system’s orders to the one it governs, answering to you',
	monologue: 'as a monologue, one voice speaking its mind'
};

/** The sentence saying how it is told. */
function toldSentence(setup: Setup): SummaryPiece[] {
	const preset = voicePreset(setup.voice)?.id;
	const name = setup.voice.protagonistName.trim();
	const persona = setup.voice.stance === 'persona' && name ? [text(`, as ${name}`)] : [];
	return [
		text('It’s told '),
		// A voice no preset gives (a persona, a narrator about them with the
		// user in it) is named rather than phrased, since there is no one
		// natural way to say every combination.
		{ kind: 'voice', label: preset ? TOLD_AS[preset] : 'your own way' },
		...persona,
		text('.')
	];
}

/**
 * The second paragraph, holding every piece the first left out, each as its
 * blank: one sentence for the heat, the idea and whoever is not mentioned
 * yet, and one for how it is told. A character not yet mentioned comes with
 * who they are in parentheses, which the first paragraph would otherwise have
 * said. Empty when nothing is left out.
 */
function remainder(setup: Setup, mentioned: Mentioned): SummaryPiece[] {
	const missing = setup.characters.flatMap((character, index) => {
		if (mentioned.characters.has(index)) {
			return [];
		}
		const note = castNote(setup, index);
		const piece: SummaryPiece = { kind: 'character', index, label: character.name };
		return [[piece, ...(note ? [text(` (${note})`)] : [])]];
	});
	const withMissing = missing.length > 0 ? [text(', with '), ...listOf(missing)] : [];
	const idea: SummaryPiece = { kind: 'idea', label: setup.idea.title };
	const { heat } = setup.idea.dials;

	let about: SummaryPiece[] = [];
	if (!mentioned.heat) {
		about = [
			text(heat === null ? 'It’s ' : `It’s ${VOWEL.test(heatWord(heat)) ? 'an' : 'a'} `),
			{ kind: 'heat', label: heatLabel(heat), heat },
			text(' daydream'),
			...(mentioned.idea ? [] : [text(': '), idea]),
			...withMissing,
			text('.')
		];
	} else if (!mentioned.idea) {
		about = [text('The idea is '), idea, ...withMissing, text('.')];
	} else if (missing.length > 0) {
		about = [...listOf(missing), text(missing.length === 1 ? ' is in it too.' : ' are in it too.')];
	}
	const told = mentioned.voice ? [] : toldSentence(setup);
	return [about, startsSentence(setup), told]
		.filter((sentence) => sentence.length > 0)
		.flatMap((sentence, at) => (at === 0 ? sentence : [text(' '), ...sentence]));
}

/**
 * The setup as paragraphs of summary: the model's, while it still describes
 * the setup, or else the premise; then one that holds whatever that left out.
 * Empty paragraphs are left out.
 */
export function setupSummary(setup: Setup, written: WrittenSummary | null): SummaryPiece[][] {
	const mentioned: Mentioned = { heat: false, voice: false, idea: false, characters: new Set() };
	const first =
		written && stillDescribes(written, setup)
			? fromMarked(written, setup, mentioned)
			: fromPremise(setup);
	return [first, remainder(setup, mentioned)].filter((paragraph) => paragraph.length > 0);
}
