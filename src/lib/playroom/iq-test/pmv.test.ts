import { describe, expect, it } from 'vitest';
import {
	PMV_QUERIES,
	parseSearchPage,
	parseVideoPage,
	pickPmv,
	pmvSearchUrl,
	VOICE_OVER_WEIGHT
} from './pmv';
import { VIBES } from './settings';

const BUCKET = 'https://pmvhavencloud.s3.eu-west-par.io.cloud.ovh.net';
const id = (n: number) => n.toString(16).padStart(24, '0');

/**
 * A page as PMVHaven renders it: one flat Nuxt payload, where an object's
 * fields hold the indexes of their values.
 */
function page(videos: Record<string, unknown>[]): string {
	const payload: unknown[] = [['root']];
	const ref = (value: unknown) => {
		payload.push(value);
		return payload.length - 1;
	};
	for (const video of videos) {
		const entry: Record<string, number> = {};
		for (const [key, value] of Object.entries(video)) {
			entry[key] = Array.isArray(value) ? ref(value.map((item) => ref(item))) : ref(value);
		}
		payload.push(entry);
	}
	return `<html><body><script type="application/json" id="__NUXT_DATA__" data-ssr="true">${JSON.stringify(payload)}</script></body></html>`;
}

const video = (n: number, overrides: Record<string, unknown> = {}) => ({
	_id: id(n),
	title: `Video ${n}`,
	uploaderUsername: 'someone',
	durationSeconds: 120,
	tags: ['goon', 'hypno'],
	hasVoiceOver: false,
	seizureWarning: false,
	views: 10,
	hlsMasterPlaylistUrl: `${BUCKET}/videos/someone_-_Video_${n}.mp4/master.m3u8`,
	...overrides
});

describe('parseSearchPage', () => {
	// Even beside a playlist named `<x>.mp4/`, the file is left to be looked up:
	// the folder keeps the upload's original name, which is not always the
	// file's (see the header of pmv.ts).
	it('reads each result, leaving its file to be looked up', () => {
		const [file] = parseSearchPage(page([video(1, { hasVoiceOver: true, seizureWarning: true })]));
		expect(file).toEqual({
			source: 'pmvhaven',
			pageUrl: `https://pmvhaven.com/video/${id(1)}`,
			uuid: id(1),
			name: 'Video 1',
			author: 'someone',
			durationMs: 120_000,
			fileType: 'voice-over',
			triggers: ['goon', 'hypno'],
			description: '',
			warnings: ['Flashing images'],
			mediaUrl: '',
			plays: 10
		});
	});

	it('keeps an older video with its file left to be looked up', () => {
		const [file] = parseSearchPage(
			page([video(2, { hlsMasterPlaylistUrl: `${BUCKET}/${id(99)}/master.m3u8` })])
		);
		expect(file?.uuid).toBe(id(2));
		expect(file?.mediaUrl).toBe('');
	});

	it('drops anything off the bucket, without a real id, or seen already', () => {
		const files = parseSearchPage(
			page([
				video(3, { hlsMasterPlaylistUrl: 'https://evil.example/videos/x.mp4/master.m3u8' }),
				video(4, { _id: '../../etc' }),
				video(5),
				video(5)
			])
		);
		expect(files.map((file) => file.uuid)).toEqual([id(5)]);
	});

	it('finds nothing in a page with no payload, or a broken one', () => {
		expect(parseSearchPage('<html></html>')).toEqual([]);
		expect(parseSearchPage('<script id="__NUXT_DATA__">{nope</script>')).toEqual([]);
	});
});

describe('parseVideoPage', () => {
	const old = `${BUCKET}/${id(99)}/someone_-_Old_one.mp4`;

	it("reads the video's own file from its page", () => {
		expect(parseVideoPage(page([{ _id: id(7), videoUrl: old }]), id(7))).toBe(old);
	});

	it('gives nothing for another video, or a file anywhere but the bucket', () => {
		expect(parseVideoPage(page([{ _id: id(7), videoUrl: old }]), id(8))).toBeNull();
		expect(
			parseVideoPage(page([{ _id: id(7), videoUrl: 'https://evil.example/x.mp4' }]), id(7))
		).toBeNull();
	});
});

describe('pickPmv', () => {
	const files = parseSearchPage(
		page([video(1, { hasVoiceOver: true }), video(2), video(3), video(4)])
	);

	it('favours a voice-over, without ruling the rest out', () => {
		const counts = new Map<string, number>();
		let seed = 1;
		const random = () => {
			seed = (seed * 16_807) % 2_147_483_647;
			return seed / 2_147_483_647;
		};
		for (let i = 0; i < 6000; i += 1) {
			const pick = pickPmv(files, random)?.uuid ?? '';
			counts.set(pick, (counts.get(pick) ?? 0) + 1);
		}
		const voiceOver = counts.get(id(1)) ?? 0;
		const plain = counts.get(id(2)) ?? 0;
		expect(voiceOver / plain).toBeGreaterThan(VOICE_OVER_WEIGHT - 0.5);
		expect(plain).toBeGreaterThan(0);
	});

	it('avoids the one playing when there is anything else', () => {
		for (let i = 0; i < 50; i += 1) {
			expect(pickPmv(files, Math.random, id(1))?.uuid).not.toBe(id(1));
		}
		expect(pickPmv([], Math.random)).toBeNull();
	});
});

describe('PMV_QUERIES', () => {
	it('searches for every vibe, on PMVHaven itself', () => {
		for (const vibe of VIBES) {
			expect(PMV_QUERIES[vibe].length).toBeGreaterThan(0);
		}
		expect(pmvSearchUrl('sissy hypno')).toBe('https://pmvhaven.com/search?q=sissy+hypno');
	});
});
