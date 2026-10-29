/**
 * Reading a passage aloud, the pure half (docs/dreams.md, "Read aloud").
 *
 * What is read is what is visible: the browser walks the passage as drawn
 * and hands over its text as runs, each with who says it and how. This
 * splits them into utterances, a sentence or a few, never two speakers in
 * one, each sent to the voice provider on its own so the next can be fetched
 * while one plays. The model's delivery cues (`how`, the tone tags, a
 * `<sound>`) become the provider's own: free words in square brackets, which
 * Fish's S2 models read as directions and do not speak.
 *
 * `alignWords` matches the provider's word timings back to the visible
 * text, for highlighting; a word it cannot place is skipped rather than
 * guessed at.
 *
 * Pure and alias-free.
 */

export type Tone = 'whisper' | 'loud' | 'slow';

/** Visible text, in reading order, with who says it and how. */
export type SpeechRun = {
	text: string;
	/** Who says it: an element's id, `you`, or null for the narration. */
	who: string | null;
	/** The model's delivery cue for it (`how="low, amused"`), or ''. */
	how: string;
	tone: Tone | null;
	/** A sound the speaker makes ("sighs"), voiced as a cue rather than read. */
	sound: boolean;
};

/** One request's worth of speech, and where its text is among the runs. */
export type Utterance = {
	who: string | null;
	/** What is sent: the words, with cues in square brackets. */
	spoken: string;
	/** Offsets into the runs' text joined, for highlighting the whole utterance. */
	from: number;
	to: number;
};

/** An utterance grows to about this, at a sentence's end. */
const ENOUGH = 160;
/** And never past this: the provider's own chunks are 300 at most. */
const MAX = 280;
const MAX_CUE = 60;

const PIECE = /[^.!?…\n]+(?:[.!?…]+["'”’)\]]*|\n|$)|\n/g;
const SENTENCE_END = /(?:[.!?…]["'”’)\]]*|\n)\s*$/;
const SPACE = /\s+/g;
const BRACKETS = /[[\]]/g;

const TONE_CUES: Record<Tone, string> = {
	whisper: 'whispering',
	loud: 'shouting',
	slow: 'slowly'
};

function cueFor(run: SpeechRun): string {
	const parts = [run.how.trim(), run.tone ? TONE_CUES[run.tone] : ''].filter(Boolean);
	return parts.join(', ').replace(BRACKETS, '').slice(0, MAX_CUE);
}

type Building = Utterance & { cue: string; ended: boolean };

/** Splits the runs into utterances. Runs with nothing to say produce none. */
export function utterances(runs: readonly SpeechRun[]): Utterance[] {
	const done: Utterance[] = [];
	let current: Building | null = null;
	const flush = () => {
		if (current?.spoken.replace(BRACKETS, '').trim()) {
			const { cue: _cue, ended: _ended, ...utterance } = current;
			done.push({ ...utterance, spoken: utterance.spoken.replace(SPACE, ' ').trim() });
		}
		current = null;
	};
	let offset = 0;
	for (const run of runs) {
		const start = offset;
		offset += run.text.length;
		// Space between two people's words belongs to neither: it does not
		// hand the voice back to the narrator.
		if (current && current.who !== run.who && run.text.trim()) {
			flush();
		}
		if (run.sound) {
			const sound = run.text.replace(BRACKETS, '').trim().slice(0, MAX_CUE);
			if (sound) {
				current ??= { who: run.who, spoken: '', from: start, to: offset, cue: '', ended: false };
				current.spoken += ` [${sound}] `;
				current.to = offset;
			}
			continue;
		}
		const cue = cueFor(run);
		for (const match of run.text.matchAll(PIECE)) {
			const [piece] = match;
			const from = start + (match.index ?? 0);
			const to = from + piece.length;
			const ends = SENTENCE_END.test(piece);
			if (!piece.trim()) {
				// A block's edge ends a sentence: a heading or a list item with no
				// full stop is still read as one, with a pause after it.
				const open: Building | null = current;
				if (open) {
					open.spoken = ends && !open.ended ? `${open.spoken.trimEnd()}. ` : `${open.spoken} `;
					open.ended ||= ends;
				}
				continue;
			}
			const building: Building | null = current;
			if (
				building?.ended &&
				(building.spoken.length >= ENOUGH || building.spoken.length + piece.length > MAX)
			) {
				flush();
			}
			current ??= { who: run.who, spoken: '', from, to, cue: '', ended: false };
			if (cue && cue !== current.cue) {
				current.spoken += ` [${cue}] `;
				current.cue = cue;
			}
			current.spoken += piece.replace('\n', ' ').replace(BRACKETS, '');
			if (run.tone === 'slow' && ends) {
				current.spoken += ' [break] ';
			}
			current.to = to;
			current.ended = ends;
		}
	}
	flush();
	return done;
}

/** A word's timing, as the provider sends it, in seconds. */
export type TimedWord = { text: string; start: number; end: number };

/** A timed word placed in the visible text: offsets into it, and when it is said. */
export type PlacedWord = { from: number; to: number; start: number; end: number };

const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const NOT_WORD = /[^\p{L}\p{N}]/gu;

function normal(word: string): string {
	return word.toLowerCase().replace(NOT_WORD, '');
}

/** How far ahead a word is looked for before it is given up on. */
const LOOK_AHEAD = 4;

/**
 * The provider's timed words placed in `visible`, the text of one
 * utterance as shown. Each is looked for a few words on from the last one
 * placed; one that is not found (a number it spelled out, say) is skipped,
 * and the highlight waits on the last word placed.
 */
export function alignWords(visible: string, words: readonly TimedWord[]): PlacedWord[] {
	const tokens = [...visible.matchAll(TOKEN)].map((match) => ({
		from: match.index ?? 0,
		to: (match.index ?? 0) + match[0].length,
		word: normal(match[0])
	}));
	const placed: PlacedWord[] = [];
	let cursor = 0;
	for (const word of words) {
		const wanted = normal(word.text);
		if (!wanted) {
			continue;
		}
		const limit = Math.min(tokens.length, cursor + LOOK_AHEAD);
		for (let index = cursor; index < limit; index += 1) {
			const token = tokens[index];
			if (token?.word === wanted) {
				placed.push({ from: token.from, to: token.to, start: word.start, end: word.end });
				cursor = index + 1;
				break;
			}
		}
	}
	return placed;
}

/** The word being said at `time`, if any has started: the last one placed before it. */
export function wordAt(placed: readonly PlacedWord[], time: number): PlacedWord | null {
	let found: PlacedWord | null = null;
	for (const word of placed) {
		if (word.start > time) {
			break;
		}
		found = word;
	}
	return found;
}

/** What a request for speech is billed by: UTF-8 bytes of the text sent. */
export function speechBytes(text: string): number {
	return new TextEncoder().encode(text).length;
}

/** The longest utterance a request may send, cues and all. */
export const MAX_SPOKEN_CHARS = 600;
