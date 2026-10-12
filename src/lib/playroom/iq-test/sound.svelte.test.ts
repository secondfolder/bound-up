import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	muteSound,
	registerAudible,
	registerVideo,
	setSoundVolume,
	soundLevel,
	soundMuted,
	soundReachesClips,
	soundVolume,
	toggleMuted,
	unmuteFromGesture
} from './sound.svelte';

/**
 * In the browser project because the point is Web Audio: a real AudioContext,
 * a real media element routed into it.
 */

afterEach(() => {
	muteSound();
	localStorage.removeItem('playroom.iq-test.volume');
	localStorage.removeItem('playroom.iq-test.hypno-volume');
	vi.restoreAllMocks();
});

describe('sound', () => {
	it('starts muted, whatever level was remembered', () => {
		expect(soundMuted()).toBe(true);
		expect(soundVolume()).toBe(0);
		const video = document.createElement('video');
		const unregister = registerAudible(video);
		expect(video.muted).toBe(true);
		unregister();
	});

	it('unmutes the audible clip from the slider, and remembers the level on the device', () => {
		const video = document.createElement('video');
		const unregister = registerAudible(video);
		setSoundVolume('clips', 0.4);
		expect(soundMuted()).toBe(false);
		expect(soundVolume()).toBe(0.4);
		expect(video.muted).toBe(false);
		expect(localStorage.getItem('playroom.iq-test.volume')).toBe('0.4');
		unregister();
	});

	it('mutes when the slider reaches zero, keeping the level for the toggle', () => {
		setSoundVolume('clips', 0.7);
		setSoundVolume('clips', 0);
		expect(soundMuted()).toBe(true);
		expect(soundVolume()).toBe(0);
		expect(soundLevel()).toBe(0.7);

		toggleMuted();
		expect(soundMuted()).toBe(false);
		expect(soundVolume()).toBe(0.7);
	});

	it('toggles between muted and the last level', () => {
		const video = document.createElement('video');
		const unregister = registerAudible(video);
		setSoundVolume('clips', 0.3);
		toggleMuted();
		expect(soundVolume()).toBe(0);
		expect(video.muted).toBe(true);
		toggleMuted();
		expect(soundVolume()).toBe(0.3);
		expect(video.muted).toBe(false);
		unregister();
	});

	it('mutes a clip again when it stops being the audible one', () => {
		const video = document.createElement('video');
		const unregister = registerAudible(video);
		setSoundVolume('clips', 1);
		expect(video.muted).toBe(false);
		unregister();
		expect(video.muted).toBe(true);
	});

	it('clamps the level to 0–1', () => {
		setSoundVolume('clips', 3);
		expect(soundVolume()).toBe(1);
		setSoundVolume('clips', -1);
		expect(soundMuted()).toBe(true);
	});

	it('keeps the clips and the hypno apart: each has its own level and mute', () => {
		const clip = document.createElement('video');
		const hypno = document.createElement('audio');
		const undoClip = registerAudible(clip, 'clips');
		const undoHypno = registerAudible(hypno, 'hypno');

		setSoundVolume('hypno', 0.6);
		expect(soundVolume('hypno')).toBe(0.6);
		expect(soundVolume('clips')).toBe(0);
		expect(hypno.muted).toBe(false);
		expect(clip.muted).toBe(true);

		toggleMuted('clips');
		toggleMuted('hypno');
		expect(soundMuted('hypno')).toBe(true);
		expect(soundMuted('clips')).toBe(false);
		expect(localStorage.getItem('playroom.iq-test.hypno-volume')).toBe('0.6');
		undoClip();
		undoHypno();
	});

	it('unmutes a channel from a gesture that was not about sound, for the hypno at the start', () => {
		unmuteFromGesture('hypno');
		expect(soundMuted('hypno')).toBe(false);
		expect(soundMuted('clips')).toBe(true);
	});

	it('pauses an element that asks to be, at zero volume, and plays it again when turned up', () => {
		const hypno = document.createElement('audio');
		hypno.dataset.pauseWhenSilent = '';
		hypno.dataset.wantsPlay = 'true';
		const pause = vi.spyOn(hypno, 'pause');
		const play = vi.spyOn(hypno, 'play').mockResolvedValue(undefined);
		const undo = registerAudible(hypno, 'hypno');

		setSoundVolume('hypno', 0.5);
		expect(play).toHaveBeenCalled();
		setSoundVolume('hypno', 0);
		expect(pause).toHaveBeenCalled();

		play.mockClear();
		toggleMuted('hypno');
		expect(play).toHaveBeenCalled();
		undo();
	});

	it('does not start an element that was never meant to be playing', () => {
		const hypno = document.createElement('audio');
		hypno.dataset.pauseWhenSilent = '';
		const play = vi.spyOn(hypno, 'play').mockResolvedValue(undefined);
		const undo = registerAudible(hypno, 'hypno');
		setSoundVolume('hypno', 0.5);
		expect(play).not.toHaveBeenCalled();
		undo();
	});

	it('says whether any clip is playing as the page’s own video', () => {
		expect(soundReachesClips()).toBe(false);
		const first = registerVideo();
		const second = registerVideo();
		expect(soundReachesClips()).toBe(true);
		first();
		expect(soundReachesClips()).toBe(true);
		second();
		expect(soundReachesClips()).toBe(false);
	});
});
