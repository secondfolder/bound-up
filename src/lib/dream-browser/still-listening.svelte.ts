/**
 * "Still listening?" (docs/dreams.md, "Keep going"): Keep going writes and
 * reads passage after passage by itself, so a phone left playing in an empty
 * room would run up the model's bill and the voice's all night. Once nobody
 * has touched the page for a while, it asks; unanswered, it pauses.
 *
 * Each "keep playing" means the user is listening without touching
 * anything, so the next ask waits longer: two minutes, then five, then
 * every ten; so does pausing from it and playing again. The wait only
 * counts time with nobody there: any activity starts it again.
 *
 * The clock is passed in, so the steps are tested without waiting for them.
 */

/** How long with no activity before each ask: the first, after one yes, then after every other. */
export const QUIET_STEPS_MS = [2 * 60_000, 5 * 60_000, 10 * 60_000] as const;
/** Unanswered for this long, it pauses. */
export const ANSWER_MS = 30_000;
/** Unanswered for this long, a sound says it is about to pause, for a phone in a pocket. */
export const WARN_MS = 15_000;

/** What the page does after a tick: ask, warn that it is about to pause, or pause. */
export type StillListeningStep = 'ask' | 'warn' | 'pause' | null;

export class StillListening {
	/** The question is up, waiting on an answer. */
	asking = $state(false);
	/** While asking: whole seconds until it pauses, for the countdown. */
	secondsLeft = $state(0);
	readonly #now: () => number;
	#lastActive: number;
	#yeses = 0;
	#askedAt = 0;
	#warned = false;
	/**
	 * Paused by an answer: playing again after it counts as a "keep playing",
	 * since someone who paused and came back was there all along. A pause
	 * because nobody answered does not. Typed by hand, as the reader's
	 * `#scrolled` is: Biome cannot see `answer` set it, and otherwise reads
	 * it as always false.
	 */
	readonly #paused: { byAnswer: boolean } = { byAnswer: false };

	constructor(now: () => number = Date.now) {
		this.#now = now;
		this.#lastActive = now();
	}

	/**
	 * The user did something on the page. Not while the question is up: it
	 * is answered by its buttons, not by a scroll that happened to be there.
	 */
	active(): void {
		if (!this.asking) {
			this.#lastActive = this.#now();
		}
	}

	/** How long nobody has to be there before the next ask. */
	get quietFor(): number {
		return QUIET_STEPS_MS[Math.min(this.#yeses, QUIET_STEPS_MS.length - 1)] ?? 0;
	}

	/**
	 * Called every second or so. `running` is whether Keep going is on and
	 * reading is playing: the only time there is anything to stop. Paused
	 * by anything else, the question goes, since there is nothing left to ask.
	 */
	tick(running: boolean): StillListeningStep {
		const now = this.#now();
		if (!running) {
			this.asking = false;
			return null;
		}
		if (this.#paused.byAnswer) {
			this.#paused.byAnswer = false;
			this.#yeses += 1;
		}
		if (this.asking) {
			const waited = now - this.#askedAt;
			this.secondsLeft = Math.max(0, Math.ceil((ANSWER_MS - waited) / 1000));
			if (waited >= ANSWER_MS) {
				this.asking = false;
				this.#lastActive = now;
				return 'pause';
			}
			if (waited >= WARN_MS && !this.#warned) {
				this.#warned = true;
				return 'warn';
			}
			return null;
		}
		if (now - this.#lastActive >= this.quietFor) {
			this.asking = true;
			this.#askedAt = now;
			this.#warned = false;
			this.secondsLeft = ANSWER_MS / 1000;
			return 'ask';
		}
		return null;
	}

	/** Answered: keep playing, or not (the page pauses). Either way, someone is there. */
	answer(keepPlaying: boolean): void {
		this.asking = false;
		this.#lastActive = this.#now();
		if (keepPlaying) {
			this.#yeses += 1;
		} else {
			this.#paused.byAnswer = true;
		}
	}
}

/**
 * A soft two-note chime, made rather than loaded: nothing to fetch with the
 * phone locked. Quiet, so it sits under the voice rather than over it.
 */
export function chime(): void {
	if (typeof AudioContext === 'undefined') {
		return;
	}
	const context = new AudioContext();
	const start = context.currentTime + 0.05;
	for (const [at, pitch] of [
		[0, 659.25],
		[0.22, 880]
	] as const) {
		const tone = new OscillatorNode(context, { type: 'sine', frequency: pitch });
		const level = new GainNode(context, { gain: 0 });
		level.gain.setValueAtTime(0, start + at);
		level.gain.linearRampToValueAtTime(0.12, start + at + 0.02);
		level.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.9);
		tone.connect(level).connect(context.destination);
		tone.start(start + at);
		tone.stop(start + at + 1);
	}
	setTimeout(() => void context.close().catch(() => undefined), 1600);
}
