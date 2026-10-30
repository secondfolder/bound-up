import {
	alignWords,
	type PlacedWord,
	type SpeechRun,
	type TimedWord,
	type Tone,
	type Utterance,
	utterances,
	wordAt
} from '$lib/dream/speech';
import type { VoiceName } from '$lib/dream/voices';
import { DreamRequestError, speak } from './api';

/**
 * Reading a daydream aloud, the browser half (docs/dreams.md, "Read
 * aloud").
 *
 * **What is read is what is drawn.** A passage is read from its element on
 * the page, walked in order: a spoiler is read only once it is open, an
 * expansion once it is expanded, a cycling word as it is set, and anything
 * marked `data-unspoken` (speaker labels, buttons, stat changes) or hidden
 * from assistive tech is left out. The markup marks who says what and how
 * (`data-who`, `data-how`, `data-tone`, `.sound`), which become the runs
 * `speech.ts` splits into utterances.
 *
 * **One clip per utterance**, each its own request, fetched one ahead of
 * the one playing so a change of speaker does not wait. Clips are kept for
 * the page, so replaying costs nothing; they are not stored anywhere.
 *
 * **Highlighting** goes through the CSS Custom Highlight API, which marks a
 * range of the page without changing it: word by word where the provider
 * gave timings, the whole utterance where it did not. Nothing is ever
 * guessed at.
 *
 * Nothing plays until asked: sound in a public place is a privacy risk, and
 * browsers block it anyway. The lock screen shows "Bound Up" and nothing
 * else.
 */

const HIGHLIGHT = 'dream-reading';

/** Elements whose words are never read. */
const UNSPOKEN =
	'[aria-hidden="true"], [data-unspoken], input, textarea, select, wa-input, wa-textarea, wa-button, wa-skeleton, wa-divider, img, svg, script, style';

/** Elements whose edges end a sentence. */
const BLOCKS = new Set([
	'P',
	'LI',
	'OL',
	'UL',
	'DIV',
	'SECTION',
	'HEADER',
	'FOOTER',
	'FIGURE',
	'FIGCAPTION',
	'DL',
	'DT',
	'DD',
	'BLOCKQUOTE',
	'H1',
	'H2',
	'H3',
	'H4',
	'H5',
	'H6'
]);
const TONES = new Set<string>(['whisper', 'loud', 'slow']);
const SCROLLS = /auto|scroll/;
const WHITESPACE = /\s+/;

type Context = { who: string | null; how: string; tone: Tone | null; sound: boolean };

/** A text node's place in the runs' joined text. */
type Placed = { node: Text; from: number; to: number };

export type Passage = { runs: SpeechRun[]; placed: Placed[]; text: string };

/** Reads a passage as it is drawn into runs, with where each text node sits in their text. */
export function passageRuns(root: HTMLElement): Passage {
	const runs: SpeechRun[] = [];
	const placed: Placed[] = [];
	let length = 0;
	const push = (text: string, context: Context, node: Text | null) => {
		runs.push({ text, ...context });
		if (node) {
			placed.push({ node, from: length, to: length + text.length });
		}
		length += text.length;
	};
	const walk = (element: Element, context: Context) => {
		for (const child of element.childNodes) {
			if (child instanceof Text) {
				if (child.data) {
					push(child.data, context, child);
				}
				continue;
			}
			if (!(child instanceof HTMLElement)) {
				continue;
			}
			// A beat or a paragraph's gap says nothing, but ends a sentence.
			if (child.classList.contains('beat')) {
				push('\n', context, null);
				continue;
			}
			if (child.matches(UNSPOKEN)) {
				continue;
			}
			const { who, how, tone } = child.dataset;
			const inner: Context = {
				who: who ?? context.who,
				how: how ?? (who ? '' : context.how),
				tone: tone && TONES.has(tone) ? (tone as Tone) : context.tone,
				sound: context.sound || child.classList.contains('sound')
			};
			const block = BLOCKS.has(child.tagName) || child.classList.contains('beat');
			if (block) {
				push('\n', context, null);
			}
			walk(child, inner);
			if (block) {
				push('\n', context, null);
			}
		}
	};
	walk(root, { who: null, how: '', tone: null, sound: false });
	return { runs, placed, text: runs.map((run) => run.text).join('') };
}

/** A range of the page for offsets into a passage's text, or null if none of it is drawn. */
export function rangeFor(passage: Passage, from: number, to: number): Range | null {
	const first = passage.placed.find((entry) => entry.to > from);
	const last = passage.placed.findLast((entry) => entry.from < to);
	if (!(first && last)) {
		return null;
	}
	const range = document.createRange();
	range.setStart(first.node, Math.max(0, from - first.from));
	range.setEnd(last.node, Math.min(last.node.length, to - last.from));
	return range;
}

/** The offset into a passage's text of a point on its page, or null when it is not on its text. */
function offsetAt(passage: Passage, x: number, y: number): number | null {
	const caret = document.caretPositionFromPoint?.(x, y);
	const node = caret?.offsetNode;
	const entry = passage.placed.find((candidate) => candidate.node === node);
	return entry && caret ? entry.from + caret.offset : null;
}

type Clip = { url: string; placed: PlacedWord[] };

/** A clip's request and what came back, for debug mode. */
export type SpokenReport = {
	text: string;
	request: unknown;
	latencyMs?: number;
	bytes: number;
	words: TimedWord[];
};

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

export class ReadAloud {
	/** The passage being read, by turn. */
	turnId = $state<string | null>(null);
	/** Who is speaking, for the player. */
	speaker = $state('');
	/** Their element's id, for their colour; null for the narrator. */
	speakerId = $state<string | null>(null);
	playing = $state(false);
	loading = $state(false);
	problem = $state<string | null>(null);
	rate = $state(1);
	/** Whether the words are highlighted as they are read. */
	highlight = $state(true);
	/**
	 * Whether reading that stopped at the end of a passage starts again when
	 * the next one comes. A next one already there is read either way.
	 */
	readNew = $state(false);
	/**
	 * Whether the story carries on by itself as reading nears the end of the
	 * newest passage: `onNearEnd` asks, and the page decides (Continue).
	 */
	keepGoing = $state(false);
	/**
	 * The passage last read to its very end, until another is played or
	 * reading stops: the page carries on into the passage after it when that
	 * comes later, if the user asked for that ("Read new passages").
	 */
	finishedTurn = $state<string | null>(null);
	index = $state(0);
	count = $state(0);
	/**
	 * Paused by the user, while playing or still loading: a clip that
	 * arrives then waits for play rather than starting by itself.
	 */
	paused = $state(false);

	readonly #voiceOf: (who: string | null) => VoiceName;
	readonly #nameOf: (who: string | null) => string;
	readonly #onNearEnd: ((turnId: string) => void) | undefined;
	readonly #onSpoken: ((turnId: string, spoken: SpokenReport) => void) | undefined;
	/**
	 * Whether `onNearEnd` has been called for this reading, so it is called
	 * once. Typed by hand, as `#scrolled` is: Biome cannot see a listener set
	 * it, and otherwise reads it as always false.
	 */
	readonly #nearEnd: { said: boolean } = { said: false };
	readonly #clips = new Map<string, Promise<Clip>>();
	readonly #controller = new AbortController();
	#audio: HTMLAudioElement | null = null;
	#root: HTMLElement | null = null;
	#passage: Passage | null = null;
	#utterances: Utterance[] = [];
	/** The clip playing, for the highlight. */
	#clip: Clip | null = null;
	/** Where in its utterance the first clip starts: the word tapped, in its visible text. */
	#startOffset: number | null = null;
	/**
	 * The word playing started from, lit until the audio reaches the next:
	 * the audio starts a moment before it so its start is not clipped, and
	 * the word before should not light up for that moment.
	 */
	#startWord: PlacedWord | null = null;
	/** Each utterance's clip's length in seconds, once it has come. */
	readonly #lengths = new Map<string, number>();
	/** Bumped by each start or stop, so a clip that arrives late does not play over another. */
	#generation = 0;
	/** The silence that holds the audio output open between clips (`#holdOutput`). */
	#keepAlive: AudioContext | null = null;
	#frame = 0;
	/**
	 * `away`: the user scrolled the line being read out of sight, so reading
	 * does not scroll back to it until it is in sight again (`#keepInView`).
	 * `at`: when they last scrolled themselves, so reading never scrolls
	 * while they do. Typed by hand: Biome cannot see a listener set it, and
	 * otherwise reads it as never changing.
	 */
	readonly #scrolled: { away: boolean; at: number } = { away: false, at: 0 };
	#scroller: HTMLElement | null = null;
	readonly #coveredFrom: (() => number | null) | undefined;
	readonly #onFinished: ((turnId: string) => void) | undefined;

	constructor(options: {
		voiceOf: (who: string | null) => VoiceName;
		nameOf: (who: string | null) => string;
		/** Reading has nearly reached the end of a passage: `NEAR_END_SECONDS` or less is left. */
		onNearEnd?: (turnId: string) => void;
		/** A clip came for a passage, with its request, for debug mode. */
		onSpoken?: (turnId: string, spoken: SpokenReport) => void;
		/**
		 * Where something stuck over the bottom of the page starts (the dock),
		 * as a viewport y, or null: the line read is kept in sight above it.
		 */
		coveredFrom?: () => number | null;
		/** A passage was read to its very end. */
		onFinished?: (turnId: string) => void;
	}) {
		this.#voiceOf = options.voiceOf;
		this.#nameOf = options.nameOf;
		this.#onNearEnd = options.onNearEnd;
		this.#onSpoken = options.onSpoken;
		this.#coveredFrom = options.coveredFrom;
		this.#onFinished = options.onFinished;
	}

	/** Reads a passage from its element, from the start or from a point tapped on it. */
	play(turnId: string, root: HTMLElement, at?: { x: number; y: number }): void {
		this.stop();
		const passage = passageRuns(root);
		const said = utterances(passage.runs);
		if (said.length === 0) {
			return;
		}
		const offset = at ? offsetAt(passage, at.x, at.y) : null;
		const start = Math.max(0, offset === null ? 0 : said.findIndex((entry) => entry.to > offset));
		// The whole utterance is asked for, cues before the word included, and
		// played from the word tapped.
		const tapped = said[start];
		this.#startOffset = offset !== null && tapped ? Math.max(0, offset - tapped.from) : null;
		this.paused = false;
		this.finishedTurn = null;
		this.#nearEnd.said = false;
		this.turnId = turnId;
		this.#root = root;
		this.#passage = passage;
		this.#utterances = said;
		this.count = said.length;
		this.#scrolled.away = false;
		this.#watchScrolling(root);
		// Before the first clip is fetched, so headphones are awake for its first word.
		this.#holdOutput();
		void this.#playAt(start);
	}

	pause(): void {
		this.paused = true;
		this.#audio?.pause();
		this.#releaseOutput();
		this.playing = false;
		if ('mediaSession' in navigator) {
			navigator.mediaSession.playbackState = 'paused';
		}
	}

	resume(): void {
		this.paused = false;
		// Still loading: it plays as soon as the clip comes.
		if (this.loading || !this.#audio?.src) {
			return;
		}
		this.#scrolled.away = false;
		this.#holdOutput();
		void this.#audio.play().then(() => {
			this.playing = true;
			this.#follow();
		}, this.#refused);
	}

	/** Back a sentence; within the first moments of one, to the one before. */
	back(): void {
		const restart = (this.#audio?.currentTime ?? 0) > 2;
		void this.#playAt(Math.max(0, restart ? this.index : this.index - 1));
	}

	next(): void {
		if (this.index + 1 < this.#utterances.length) {
			void this.#playAt(this.index + 1);
		}
	}

	setRate(rate: number): void {
		this.rate = rate;
		if (this.#audio) {
			this.#audio.playbackRate = rate;
		}
		// Faster, the clips in hand run out sooner.
		this.#lookAhead();
	}

	setHighlight(on: boolean): void {
		this.highlight = on;
		if (!on) {
			clearHighlight();
		}
	}

	stop(): void {
		this.#generation += 1;
		this.#audio?.pause();
		this.#releaseOutput();
		cancelAnimationFrame(this.#frame);
		clearHighlight();
		this.playing = false;
		this.loading = false;
		this.paused = false;
		this.finishedTurn = null;
		this.turnId = null;
		this.speaker = '';
		this.speakerId = null;
		this.problem = null;
		this.#scroller?.removeEventListener('wheel', this.#onUserScroll);
		this.#scroller?.removeEventListener('touchmove', this.#onUserScroll);
		this.#scroller?.removeEventListener('pointerdown', this.#onPress);
		document.removeEventListener('keydown', this.#onKey);
		if ('mediaSession' in navigator) {
			navigator.mediaSession.playbackState = 'none';
		}
	}

	/** Stops, and lets go of every clip. */
	dispose(): void {
		this.stop();
		this.#controller.abort();
		void this.#keepAlive?.close().catch(() => undefined);
		this.#keepAlive = null;
		for (const clip of this.#clips.values()) {
			clip.then((ready) => URL.revokeObjectURL(ready.url)).catch(() => undefined);
		}
		this.#clips.clear();
	}

	async #playAt(index: number): Promise<void> {
		const utterance = this.#utterances[index];
		if (!utterance) {
			this.#finish();
			return;
		}
		this.#generation += 1;
		const generation = this.#generation;
		this.#audio?.pause();
		this.index = index;
		this.speaker = this.#nameOf(utterance.who);
		this.speakerId = utterance.who;
		this.loading = true;
		this.problem = null;
		let clip: Clip;
		try {
			clip = await this.#clipFor(utterance);
		} catch (cause) {
			if (generation === this.#generation) {
				this.loading = false;
				this.playing = false;
				this.problem =
					cause instanceof DreamRequestError
						? cause.message
						: 'That could not be read aloud just now.';
			}
			return;
		}
		if (generation !== this.#generation) {
			return;
		}
		this.#clip = clip;
		const audio = this.#audioElement();
		audio.src = clip.url;
		audio.playbackRate = this.rate;
		const startAt = this.#startOffset;
		this.#startOffset = null;
		if (startAt === null) {
			this.#startWord = null;
		} else {
			// From the start of the word tapped; the words before it were asked
			// for too, so the cues before it shape how it is said.
			const word = clip.placed.find((placed) => placed.to > startAt);
			audio.currentTime = word ? Math.max(0, word.start - 0.05) : 0;
			this.#startWord = word ?? null;
		}
		this.loading = false;
		this.#lookAhead();
		if (this.paused) {
			// Paused while it loaded: ready, and waiting on play.
			this.playing = false;
			return;
		}
		try {
			await audio.play();
		} catch (cause) {
			this.#refused(cause);
			return;
		}
		this.playing = true;
		this.#mediaSession();
		this.#follow();
	}

	/** At normal speed, about how long speech takes a word, with a beat for cues and breaths. */
	static readonly SECONDS_PER_WORD = 0.4;
	/** Clips are fetched ahead until this much playback is in hand, at the speed it plays. */
	static readonly LEAD_SECONDS = 12;
	/** At most this many clips are fetched at once. */
	static readonly AHEAD = 4;

	/** How long an utterance plays at the current speed: measured once its clip came, else guessed. */
	#seconds(utterance: Utterance): number {
		const known = this.#lengths.get(this.#keyOf(utterance));
		const words =
			this.#passage?.text.slice(utterance.from, utterance.to).split(WHITESPACE).length ?? 1;
		return (known ?? words * ReadAloud.SECONDS_PER_WORD + 0.5) / this.rate;
	}

	/**
	 * Fetches clips ahead of the one playing until enough playback is in
	 * hand to hide the next fetch: what is left of this clip, then each
	 * following utterance by its length at this speed. A short line, a quote
	 * of a few words, plays out in a second at 2×, so one clip ahead was not
	 * always enough; a long passage needs no more than a few.
	 */
	#lookAhead(): void {
		const audio = this.#audio;
		let ahead =
			audio && Number.isFinite(audio.duration)
				? Math.max(0, audio.duration - audio.currentTime) / this.rate
				: 0;
		let fetched = 0;
		for (let index = this.index + 1; index < this.#utterances.length; index += 1) {
			const utterance = this.#utterances[index];
			if (!utterance || ahead >= ReadAloud.LEAD_SECONDS || fetched >= ReadAloud.AHEAD) {
				return;
			}
			this.#clipFor(utterance).catch(() => undefined);
			fetched += 1;
			ahead += this.#seconds(utterance);
		}
	}

	/**
	 * How long the current passage still has to play, at this speed: what is
	 * left of the clip playing, and every utterance after it.
	 */
	#secondsLeft(): number {
		const audio = this.#audio;
		let left =
			audio && Number.isFinite(audio.duration)
				? Math.max(0, audio.duration - audio.currentTime) / this.rate
				: 0;
		for (const utterance of this.#utterances.slice(this.index + 1)) {
			left += this.#seconds(utterance);
		}
		return left;
	}

	/** With this much or less of a passage left to play, `onNearEnd` is called. */
	static readonly NEAR_END_SECONDS = 20;

	/**
	 * Calls `onNearEnd` once a reading, when it is near the end. On the
	 * audio's `timeupdate`, which goes on firing in a background tab or with
	 * the screen locked, where an animation frame does not: listening with
	 * the phone in a pocket is the case this is for.
	 */
	#checkNearEnd(): void {
		if (
			this.#nearEnd.said ||
			!this.turnId ||
			!this.playing ||
			this.#secondsLeft() > ReadAloud.NEAR_END_SECONDS
		) {
			return;
		}
		this.#nearEnd.said = true;
		this.#onNearEnd?.(this.turnId);
	}

	#keyOf(utterance: Utterance): string {
		return `${this.#voiceOf(utterance.who)}\u0000${utterance.spoken}`;
	}

	readonly #refused = (cause: unknown) => {
		this.playing = false;
		// Stopped by another start: not a problem.
		if (cause instanceof DOMException && cause.name === 'AbortError') {
			return;
		}
		this.problem = 'This browser would not play it. Tap play to try again.';
	};

	#finish(): void {
		const finished = this.turnId;
		this.finishedTurn = finished;
		this.#generation += 1;
		this.#releaseOutput();
		cancelAnimationFrame(this.#frame);
		clearHighlight();
		this.playing = false;
		this.loading = false;
		this.turnId = null;
		this.speaker = '';
		this.speakerId = null;
		if (finished) {
			this.#onFinished?.(finished);
		}
	}

	/**
	 * Keeps the audio output open from play until pause, stop or the end, by
	 * playing silence through Web Audio beside the clips. Each utterance is a
	 * clip of its own, and between two the page would otherwise send no
	 * audio: Bluetooth headphones close their link when nothing plays and
	 * take about a second to open it again, which cut off the start of each
	 * clip. Silence keeps the link up, so the gaps are only the clips' own.
	 * Started from the tap that plays, which browsers require of audio.
	 */
	#holdOutput(): void {
		if (typeof AudioContext === 'undefined') {
			return;
		}
		if (!this.#keepAlive) {
			const context = new AudioContext();
			const silence = new ConstantSourceNode(context, { offset: 0 });
			silence.connect(context.destination);
			silence.start();
			this.#keepAlive = context;
		}
		void this.#keepAlive.resume().catch(() => undefined);
	}

	/** Lets the output close again, so headphones and battery are not held for nothing. */
	#releaseOutput(): void {
		void this.#keepAlive?.suspend().catch(() => undefined);
	}

	#clipFor(utterance: Utterance): Promise<Clip> {
		const voice = this.#voiceOf(utterance.who);
		const key = this.#keyOf(utterance);
		let clip = this.#clips.get(key);
		if (!clip) {
			const visible = this.#passage?.text.slice(utterance.from, utterance.to) ?? '';
			const forTurn = this.turnId;
			clip = speak({ text: utterance.spoken, voice }, this.#controller.signal).then((spoken) => {
				if (spoken.debug && forTurn) {
					this.#onSpoken?.(forTurn, {
						text: utterance.spoken,
						request: spoken.debug.request,
						...(spoken.debug.latencyMs === undefined ? {} : { latencyMs: spoken.debug.latencyMs }),
						bytes: spoken.audio.size,
						words: spoken.words
					});
				}
				const last = spoken.words.at(-1);
				if (last) {
					this.#lengths.set(key, last.end + 0.3);
				}
				return {
					url: URL.createObjectURL(spoken.audio),
					placed: alignWords(visible, spoken.words)
				};
			});
			// A failed clip is asked for again next time, not remembered as failed.
			clip.catch(() => this.#clips.delete(key));
			this.#clips.set(key, clip);
		}
		return clip;
	}

	#audioElement(): HTMLAudioElement {
		if (!this.#audio) {
			const audio = new Audio();
			audio.preservesPitch = true;
			audio.addEventListener('ended', () => {
				void this.#playAt(this.index + 1);
			});
			audio.addEventListener('timeupdate', () => this.#checkNearEnd());
			this.#audio = audio;
		}
		return this.#audio;
	}

	/** Moves the highlight with the audio, a frame at a time, while it plays. */
	#follow(): void {
		cancelAnimationFrame(this.#frame);
		const generation = this.#generation;
		let ticks = 0;
		const tick = () => {
			if (generation !== this.#generation || !this.playing) {
				return;
			}
			const utterance = this.#utterances[this.index];
			const clip = this.#clip;
			if (utterance && clip && this.#passage && this.highlight) {
				// Before its first word is said, that word: never the whole
				// utterance, which flashed up at the start of each one. Only a
				// clip with no timings at all is lit whole.
				const time = this.#audio?.currentTime ?? 0;
				const from = this.#startWord;
				const word =
					from && time < from.start ? from : (wordAt(clip.placed, time) ?? clip.placed[0]);
				const range = word
					? rangeFor(this.#passage, utterance.from + word.from, utterance.from + word.to)
					: rangeFor(this.#passage, utterance.from, utterance.to);
				if (range) {
					showHighlight(range);
					this.#keepInView(range);
				}
			}
			// How much is in hand changes as it plays, and with the speed.
			ticks += 1;
			if (ticks % 30 === 0) {
				this.#lookAhead();
			}
			this.#frame = requestAnimationFrame(tick);
		};
		tick();
	}

	/** A gesture of the user's own counts as scrolling for this long after its last event. */
	static readonly USER_SCROLL_MS = 800;

	/**
	 * Keeps the line being read in sight while it is, and leaves the page
	 * alone once the user has scrolled it out of sight: never scrolling
	 * while they scroll, and following again once they scroll back to it.
	 * Following used to stop for good at the first touch of the page, so a
	 * small nudge lost it until play was pressed again.
	 */
	#keepInView(range: Range): void {
		const scroller = this.#scroller;
		if (!scroller) {
			return;
		}
		const rect = range.getBoundingClientRect();
		const view = scroller.getBoundingClientRect();
		const covered = this.#coveredFrom?.() ?? null;
		const bottom = covered === null ? view.bottom : Math.min(view.bottom, covered);
		const inSight = rect.bottom > view.top && rect.top < bottom;
		if (performance.now() - this.#scrolled.at < ReadAloud.USER_SCROLL_MS) {
			this.#scrolled.away = !inSight;
			return;
		}
		if (this.#scrolled.away) {
			if (!inSight) {
				return;
			}
			this.#scrolled.away = false;
		}
		if (rect.top < view.top + 40 || rect.bottom > bottom - 60) {
			scroller.scrollBy({
				top: rect.top - view.top - (bottom - view.top) / 3,
				behavior: 'smooth'
			});
		}
	}

	readonly #onUserScroll = () => {
		this.#scrolled.at = performance.now();
	};

	/** The keys that scroll a page, which count as the user scrolling. */
	readonly #onKey = (event: KeyboardEvent) => {
		if (SCROLL_KEYS.has(event.key) && !isTyping(event.target)) {
			this.#onUserScroll();
		}
	};

	/** A press on the scroller itself, not its content, is its scrollbar. */
	readonly #onPress = (event: PointerEvent) => {
		if (event.target === this.#scroller) {
			this.#onUserScroll();
		}
	};

	#watchScrolling(root: HTMLElement): void {
		let scroller: HTMLElement | null = root.parentElement;
		while (scroller && !SCROLLS.test(getComputedStyle(scroller).overflowY)) {
			scroller = scroller.parentElement;
		}
		this.#scroller = scroller ?? (document.scrollingElement as HTMLElement | null);
		this.#scroller?.addEventListener('wheel', this.#onUserScroll, { passive: true });
		this.#scroller?.addEventListener('touchmove', this.#onUserScroll, { passive: true });
		this.#scroller?.addEventListener('pointerdown', this.#onPress, { passive: true });
		document.addEventListener('keydown', this.#onKey);
	}

	/** The lock screen's controls, with nothing on it but the app's name. */
	#mediaSession(): void {
		if (!('mediaSession' in navigator)) {
			return;
		}
		navigator.mediaSession.metadata = new MediaMetadata({ title: 'Bound Up' });
		navigator.mediaSession.playbackState = 'playing';
		navigator.mediaSession.setActionHandler('play', () => this.resume());
		navigator.mediaSession.setActionHandler('pause', () => this.pause());
		navigator.mediaSession.setActionHandler('previoustrack', () => this.back());
		navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
	}

	/** The root of the passage being read, for the page to know which is lit. */
	get root(): HTMLElement | null {
		return this.#root;
	}
}

const SCROLL_KEYS: ReadonlySet<string> = new Set([
	'ArrowUp',
	'ArrowDown',
	'PageUp',
	'PageDown',
	'Home',
	'End',
	' '
]);

/** Whether a key goes to a field being typed in, where it scrolls nothing. */
function isTyping(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable || Boolean(target.closest('input, textarea, wa-input, wa-textarea')))
	);
}

function showHighlight(range: Range): void {
	if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
		CSS.highlights.set(HIGHLIGHT, new Highlight(range));
	}
}

function clearHighlight(): void {
	if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
		CSS.highlights.delete(HIGHLIGHT);
	}
}
