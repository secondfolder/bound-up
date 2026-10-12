/**
 * The IQ test's sound: one volume per **channel**, for the media the page
 * plays itself.
 *
 * - `clips`: the porn clips (`ClipPlayer`).
 * - `hypno`: the Bambi hypno (`HypnoPlayer`).
 *
 * Each has its own slider, its own mute toggle and its own `GainNode`, so the
 * two can be balanced or silenced independently, over one shared
 * `AudioContext`.
 *
 * Through Web Audio rather than `element.volume`: iOS Safari ignores
 * `volume` (it is read-only there and always 1), so a slider driving it would
 * do nothing on an iPhone.
 *
 * Two pieces of state per channel, deliberately separate:
 * - the **level**, 0–1, remembered on the device, so unmuting goes back to
 *   where it was;
 * - **muted**, which every page load starts as, and which is never
 *   remembered. Restoring a remembered level on load looked wrong as well as
 *   being surprising: the slider showed the old volume while every clip
 *   stayed silent, because a browser will not start sound before a gesture.
 *
 * Nothing makes a sound until a gesture unmutes a channel: a click on its
 * toggle, a drag of its slider, or — for the hypno, which plays by default —
 * the click that starts the test (`unmuteFromGesture`). Safe to import during
 * SSR: storage is only read where it exists, and `AudioContext` is only
 * created from a gesture.
 */

import { untrack } from 'svelte';

export type SoundChannel = 'clips' | 'hypno';

const LEVEL_KEYS: Record<SoundChannel, string> = {
	clips: 'playroom.iq-test.volume',
	hypno: 'playroom.iq-test.hypno-volume'
};

/** Where unmuting goes when no level has ever been set, or the last was zero. */
export const DEFAULT_LEVEL = 0.5;

/**
 * Read once, as the module loads in the browser. Not lazily on first read:
 * the first read is inside a `$derived`, where writing state throws.
 */
function storedLevel(channel: SoundChannel): number {
	if (typeof localStorage === 'undefined') {
		return DEFAULT_LEVEL;
	}
	try {
		const stored = Number(localStorage.getItem(LEVEL_KEYS[channel]));
		return Number.isFinite(stored) && stored > 0 ? Math.min(1, stored) : DEFAULT_LEVEL;
	} catch {
		return DEFAULT_LEVEL;
	}
}

type ChannelState = {
	level: number;
	muted: boolean;
	gain: GainNode | null;
	/** Elements whose sound is wanted on this channel. */
	audible: Set<HTMLMediaElement>;
	/**
	 * Elements on this channel that cannot go through Web Audio, because their
	 * files come without CORS (PMVHaven's): their own `volume` is set instead.
	 * That does nothing on iOS, where only muting reaches them.
	 */
	direct: Set<HTMLMediaElement>;
};

const channels: Record<SoundChannel, ChannelState> = $state({
	clips: {
		level: storedLevel('clips'),
		muted: true,
		gain: null,
		audible: new Set(),
		direct: new Set()
	},
	hypno: {
		level: storedLevel('hypno'),
		muted: true,
		gain: null,
		audible: new Set(),
		direct: new Set()
	}
});

let context: AudioContext | null = null;
/** The source node each element is routed through. Once per element, ever. */
const routed = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

/**
 * How many clips are playing as the page's own video right now, rather than
 * in Redgifs' player. The clips volume only reaches those, so with none —
 * every clip fell back — there is nothing for its slider to do.
 */
let directVideos = $state(0);

/** Whether the clips volume can reach anything on the page. */
export function soundReachesClips(): boolean {
	return directVideos > 0;
}

/**
 * Count a clip playing as the page's own video. Returns the undo.
 *
 * Untracked, like `registerAudible`: both are called from attachments, which
 * run as effects, and reading the state they write would make the attachment
 * depend on it — re-running, and so re-registering, forever.
 */
export function registerVideo(): () => void {
	untrack(() => {
		directVideos += 1;
	});
	return () => {
		untrack(() => {
			directVideos -= 1;
		});
	};
}

/** What is actually heard on a channel, 0–1: zero while muted, whatever the level. */
export function soundVolume(channel: SoundChannel = 'clips'): number {
	return channels[channel].muted ? 0 : channels[channel].level;
}

export function soundMuted(channel: SoundChannel = 'clips'): boolean {
	return channels[channel].muted;
}

/** The level unmuting goes back to. */
export function soundLevel(channel: SoundChannel = 'clips'): number {
	return channels[channel].level;
}

/**
 * Set a channel's volume from its slider. Above zero unmutes; zero mutes, and
 * keeps the old level, so unmuting from the toggle afterwards does not land on
 * silence. A drag is a user gesture, so this may start Web Audio.
 */
export function setSoundVolume(channel: SoundChannel, next: number): void {
	const state = channels[channel];
	const clamped = Math.min(1, Math.max(0, next));
	if (clamped === 0) {
		state.muted = true;
	} else {
		state.level = clamped;
		state.muted = false;
		try {
			localStorage.setItem(LEVEL_KEYS[channel], String(state.level));
		} catch {
			// A convenience lost, nothing more.
		}
		unlock();
	}
	apply(channel);
}

/** A channel's mute toggle. A click is a user gesture, so unmuting may start Web Audio. */
export function toggleMuted(channel: SoundChannel = 'clips'): void {
	channels[channel].muted = !channels[channel].muted;
	if (!channels[channel].muted) {
		unlock();
	}
	apply(channel);
}

/**
 * Unmute a channel at its remembered level, from inside a gesture that was not
 * about sound — the click that starts the test, which is when the hypno, on by
 * default, is meant to start being heard.
 */
export function unmuteFromGesture(channel: SoundChannel): void {
	channels[channel].muted = false;
	unlock();
	apply(channel);
}

/** Back to muted, as on a fresh load: for tests, which share this module's state between them. */
export function muteSound(channel?: SoundChannel): void {
	for (const name of channel ? [channel] : (['clips', 'hypno'] as const)) {
		channels[name].muted = true;
		apply(name);
	}
}

/**
 * Start Web Audio. Must run inside a user gesture — the toggles, the sliders,
 * and the start of the test — because that is the only time a browser lets a
 * page start making sound.
 */
function unlock(): void {
	if (typeof AudioContext === 'undefined') {
		return;
	}
	if (context === null) {
		context = new AudioContext();
	}
	void context.resume();
	for (const name of ['clips', 'hypno'] as const) {
		const state = channels[name];
		if (state.gain === null) {
			state.gain = context.createGain();
			state.gain.connect(context.destination);
		}
		for (const element of state.audible) {
			route(element, name);
		}
	}
}

/**
 * Mark an element as one whose sound should be heard on a channel. Returns
 * the undo.
 *
 * Its sound only reaches the speakers once Web Audio is running; until then
 * it stays muted, because unmuted outside the graph it would play at full
 * volume, whatever the slider says.
 */
export function registerAudible(
	element: HTMLMediaElement,
	channel: SoundChannel = 'clips'
): () => void {
	// Untracked: `apply` reads the channel's state, and the attachment calling
	// this must not re-run (unregistering, muting, re-registering) on every
	// slider move.
	untrack(() => {
		channels[channel].audible.add(element);
		route(element, channel);
		apply(channel);
	});
	return () => {
		untrack(() => {
			channels[channel].audible.delete(element);
		});
		element.muted = true;
	};
}

/**
 * Put an element on a channel without Web Audio: for media whose files come
 * without CORS, which Web Audio would play as silence. The channel's level
 * and mute are applied to the element itself. Returns the undo.
 */
export function registerDirect(
	element: HTMLMediaElement,
	channel: SoundChannel = 'hypno'
): () => void {
	untrack(() => {
		channels[channel].direct.add(element);
		apply(channel);
	});
	return () => {
		untrack(() => {
			channels[channel].direct.delete(element);
		});
		element.muted = true;
	};
}

function route(element: HTMLMediaElement, channel: SoundChannel) {
	const { gain } = channels[channel];
	if (context === null || gain === null || routed.has(element)) {
		return;
	}
	// Once per element, ever: a second call throws. The node lives as long as
	// the element does, which is why it is kept in a WeakMap.
	const source = context.createMediaElementSource(element);
	source.connect(gain);
	routed.set(element, source);
}

function apply(channel: SoundChannel) {
	const state = channels[channel];
	const volume = soundVolume(channel);
	if (state.gain !== null) {
		state.gain.gain.value = volume;
	}
	for (const element of state.direct) {
		element.volume = state.level;
		element.muted = volume === 0;
		pauseWhenSilent(element, volume);
	}
	for (const element of state.audible) {
		const hearable = volume > 0 && routed.has(element);
		element.muted = !hearable;
		// An element marked `data-pause-when-silent` (the hypno) stops at zero
		// volume rather than playing on unheard, and picks up where it left off
		// when turned up again — if it was meant to be playing at all
		// (`data-wants-play`). Done here, synchronously, because this runs
		// inside the toggle click or slider drag, which is the only moment a
		// browser lets audio start again.
		if (element.dataset.pauseWhenSilent !== undefined) {
			pauseWhenSilent(element, volume);
		} else if (hearable && element.paused && element.autoplay) {
			// Unmuting can stop a playing element on browsers that only allowed
			// it to autoplay muted; inside a gesture, play() starts it again.
			void playOrMute(element);
		}
	}
}

function pauseWhenSilent(element: HTMLMediaElement, volume: number) {
	if (element.dataset.pauseWhenSilent === undefined) {
		return;
	}
	if (volume === 0) {
		element.pause();
	} else if (element.paused && element.dataset.wantsPlay === 'true') {
		void playOrMute(element);
	}
}

/**
 * Play with sound, or, if the browser refuses that outside a gesture, play
 * muted rather than not at all: a silent clip still does its job.
 */
async function playOrMute(element: HTMLMediaElement) {
	try {
		await element.play();
	} catch {
		element.muted = true;
		await element.play().catch(() => undefined);
	}
}
