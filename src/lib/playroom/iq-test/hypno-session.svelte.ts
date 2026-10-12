import { tryFetch } from '$lib/request-failure.svelte';
import type { HypnoCategory, HypnoFile, HypnoSource } from './hypno';
import { mediaInfo, mediaWarn } from './media-log';
import type { Vibe } from './settings';
import { soundVolume, unmuteFromGesture } from './sound.svelte';

/** Consecutive files that would not play before the player gives up. */
export const MAX_FAILURES = 3;

export type HypnoFilterState = {
	categories: HypnoCategory[];
	query: string;
	trigger: string | null;
	maxMinutes: number | null;
};

export type HypnoStatus = 'finding' | 'ready' | 'playing' | 'unavailable';

/**
 * The hypno playing alongside the test: which file, what it is filtered by,
 * and the one element it plays in — an `<audio>` for bambicloud, a `<video>`
 * shown among the porn for PMVHaven (`source`).
 *
 * Shared by the player (the element), the bar (what is playing, Next) and the
 * drawer (search, categories, choose), so it is one object rather than state
 * passed between three components.
 *
 * Browsers only start sound inside a gesture, so the first pick is fetched as
 * soon as the page has a hypno to play — before the test starts — and
 * `startFromGesture()`, called from the click that starts the test, can then
 * play it at once, inside that click. Every later file plays on the same
 * element, which a browser lets carry on once it has played from a gesture.
 */
export class HypnoSession {
	current = $state<HypnoFile | null>(null);
	status = $state<HypnoStatus>('finding');
	/** Milliseconds left of the current file, for the dock. */
	remainingMs = $state(0);
	/** How far into the current file, and how long it is, in milliseconds. */
	positionMs = $state(0);
	durationMs = $state(0);
	filter = $state<HypnoFilterState>({ categories: [], query: '', trigger: null, maxMinutes: null });
	/** Whether it has been started at all: from then on its bar stays, so it can always be stopped. */
	started = $state(false);

	/** Where its files come from, fixed for the session: a new source is a new session. */
	readonly source: HypnoSource;
	/** The vibe PMVHaven's files are searched for. */
	readonly vibe: Vibe | null;

	#audio: HTMLMediaElement | null = null;
	#failures = 0;
	/**
	 * Whether it should be playing: set once started, so a file arriving later
	 * (the first pick, or the next) plays at once.
	 */
	readonly #intent: { play: boolean } = { play: false };
	#request: AbortController | null = null;

	constructor(
		categories: HypnoCategory[],
		source: HypnoSource = 'bambicloud',
		vibe: Vibe | null = null
	) {
		this.filter.categories = categories;
		this.source = source;
		this.vibe = vibe;
	}

	/** The element to play in. Called by `HypnoPlayer` once it exists. */
	attach(audio: HTMLMediaElement): () => void {
		this.#audio = audio;
		const onEnded = () => void this.next();
		const onError = () => this.#failed();
		const onTime = () => {
			const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
			this.positionMs = audio.currentTime * 1000;
			this.durationMs = duration * 1000;
			this.remainingMs = Math.max(0, (duration - audio.currentTime) * 1000);
		};
		const onPlaying = () => {
			this.#failures = 0;
			this.status = 'playing';
		};
		audio.addEventListener('ended', onEnded);
		audio.addEventListener('error', onError);
		audio.addEventListener('timeupdate', onTime);
		audio.addEventListener('playing', onPlaying);
		if (this.current) {
			this.#load(this.current);
		}
		return () => {
			audio.removeEventListener('ended', onEnded);
			audio.removeEventListener('error', onError);
			audio.removeEventListener('timeupdate', onTime);
			audio.removeEventListener('playing', onPlaying);
			audio.pause();
			this.#audio = null;
			this.#request?.abort();
		};
	}

	/**
	 * The query the filter makes, shared with the drawer's search: bambicloud's
	 * index by category, or PMVHaven's for this session's vibe.
	 */
	query(extra: Record<string, string> = {}): string {
		const { filter } = this;
		const params = new URLSearchParams({
			...(this.source === 'pmvhaven'
				? { vibe: this.vibe ?? '' }
				: { categories: filter.categories.join(',') }),
			q: filter.query,
			...(filter.trigger ? { trigger: filter.trigger } : {}),
			...(filter.maxMinutes ? { maxMinutes: String(filter.maxMinutes) } : {}),
			...extra
		});
		const endpoint = this.source === 'pmvhaven' ? 'pmvs' : 'hypnos';
		return `/api/playroom/iq-test/${endpoint}?${params}`;
	}

	/** Pick a random file matching the filter, other than the current one, and play it. */
	async next(): Promise<void> {
		this.#request?.abort();
		const controller = new AbortController();
		this.#request = controller;
		const exclude = this.current?.uuid ?? '';
		let response: Response | null;
		let body: { files?: HypnoFile[]; total?: number } | null;
		// The body read is inside the guard too: an abort part-way through it
		// throws from `json()`, not from the fetch, and was once uncaught.
		try {
			response = await tryFetch(this.query({ random: '1', exclude }), {
				signal: controller.signal
			});
			body = response?.ok ? ((await response.json()) as typeof body) : null;
		} catch {
			return; // Aborted: a newer pick is under way.
		}
		const pick = body?.files?.[0] ?? null;
		if (!pick) {
			mediaWarn(
				body
					? `No hypno matches the filter (${this.filter.categories.join(', ') || 'any category'}); nothing to play.`
					: `Could not get a hypno: ${response ? `HTTP ${response.status}` : 'no connection'}.`
			);
			this.status = 'unavailable';
			return;
		}
		mediaInfo(
			`Hypno: "${pick.name}" by ${pick.author} (${pick.fileType}), one of ${body?.total ?? '?'} matching.`,
			pick.mediaUrl
		);
		this.play(pick);
	}

	/**
	 * Play a particular file: the drawer's choice, or the next random one. A
	 * PMVHaven video found by search may not know its file yet; the server
	 * reads it from the video's own page first (see `withMedia` there).
	 */
	play(file: HypnoFile): void {
		this.current = file;
		if (file.mediaUrl) {
			this.#load(file);
			return;
		}
		void this.#resolve(file);
	}

	async #resolve(file: HypnoFile) {
		this.status = 'finding';
		const url = `/api/playroom/iq-test/pmvs/${encodeURIComponent(file.uuid)}?vibe=${this.vibe ?? ''}`;
		let resolved: HypnoFile | null = null;
		try {
			const response = await tryFetch(url);
			resolved = response?.ok ? ((await response.json()) as HypnoFile) : null;
		} catch {
			resolved = null;
		}
		// Something else was chosen meanwhile: that one wins.
		if (this.current?.uuid !== file.uuid) {
			return;
		}
		if (!resolved?.mediaUrl) {
			mediaWarn(`Could not find the file for "${file.name}" on PMVHaven. Trying another.`);
			void this.next();
			return;
		}
		this.current = resolved;
		this.#load(resolved);
	}

	/**
	 * Start being heard, from inside the click that starts the test: unmute the
	 * hypno's channel and play, both of which only a gesture allows.
	 */
	startFromGesture(): void {
		unmuteFromGesture('hypno');
		this.resume();
	}

	/** Play without a gesture (a reload mid-test): muted until the toggle is used. */
	resume(): void {
		this.#intent.play = true;
		this.started = true;
		if (this.#audio) {
			// Read by the sound module, which resumes it when the hypno's volume
			// comes up from zero.
			this.#audio.dataset.wantsPlay = 'true';
		}
		this.#playIfHeard();
	}

	/**
	 * Play, unless the hypno's volume is zero: then it waits, paused, and the
	 * sound module starts it when the volume comes up (see `apply` there).
	 * Playing on at zero would only run the file down unheard.
	 */
	#playIfHeard() {
		if (this.#audio && this.#intent.play && soundVolume('hypno') > 0) {
			void this.#audio.play().catch(() => undefined);
		}
	}

	#load(file: HypnoFile) {
		const audio = this.#audio;
		if (!audio) {
			return;
		}
		this.status = 'ready';
		if (audio.src !== file.mediaUrl) {
			audio.src = file.mediaUrl;
		}
		if (this.#intent.play) {
			audio.dataset.wantsPlay = 'true';
		}
		this.#playIfHeard();
	}

	#failed() {
		const audio = this.#audio;
		const error = audio?.error;
		this.#failures += 1;
		mediaWarn(
			`Hypno "${this.current?.name ?? '?'}" would not play (${error ? `MediaError ${error.code}${error.message ? `: ${error.message}` : ''}` : 'unknown error'}).` +
				(this.#failures >= MAX_FAILURES
					? ` ${MAX_FAILURES} in a row have failed, so the hypno has stopped. Something may be blocking ${this.source === 'pmvhaven' ? 'pmvhavencloud.s3.eu-west-par.io.cloud.ovh.net' : 'cdn.bambicloud.com'}.`
					: ' Trying another.'),
			this.current?.mediaUrl
		);
		if (this.#failures >= MAX_FAILURES) {
			this.status = 'unavailable';
			return;
		}
		void this.next();
	}
}
