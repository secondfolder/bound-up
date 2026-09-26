import { describe, expect, it } from 'vitest';
import {
	describeUnseenMedia,
	MEDIA_TTL_DEFAULT_MS,
	MEDIA_TTL_MAX_MS,
	MEDIA_TTL_MIN_MS,
	MEDIA_TTL_PRESETS,
	parseMediaTtl
} from './messaging';

/** The pure half of self-destructing media: lifetimes and the board's wording. */

describe('the media lifetime presets', () => {
	it('all lie inside the range the server accepts, and include the default', () => {
		for (const preset of MEDIA_TTL_PRESETS) {
			expect(preset.ms).toBeGreaterThanOrEqual(MEDIA_TTL_MIN_MS);
			expect(preset.ms).toBeLessThanOrEqual(MEDIA_TTL_MAX_MS);
		}
		expect(MEDIA_TTL_PRESETS.map((preset) => preset.ms)).toContain(MEDIA_TTL_DEFAULT_MS);
		expect(MEDIA_TTL_DEFAULT_MS).toBe(14 * 24 * 60 * 60 * 1000);
	});
});

describe('parseMediaTtl', () => {
	it('is the default when nothing is posted', () => {
		expect(parseMediaTtl(null)).toBe(MEDIA_TTL_DEFAULT_MS);
		expect(parseMediaTtl('')).toBe(MEDIA_TTL_DEFAULT_MS);
	});

	it('takes `never` and whole milliseconds in range', () => {
		expect(parseMediaTtl('never')).toBe('never');
		expect(parseMediaTtl(String(MEDIA_TTL_MIN_MS))).toBe(MEDIA_TTL_MIN_MS);
		expect(parseMediaTtl(String(MEDIA_TTL_MAX_MS))).toBe(MEDIA_TTL_MAX_MS);
	});

	it('is null for anything else', () => {
		for (const value of [
			String(MEDIA_TTL_MIN_MS - 1),
			String(MEDIA_TTL_MAX_MS + 1),
			'-5',
			'3.5',
			'1e7',
			'Never'
		]) {
			expect(parseMediaTtl(value)).toBeNull();
		}
	});
});

describe('describeUnseenMedia', () => {
	it('names one file by its kind', () => {
		expect(describeUnseenMedia(['image'], '3 days')).toBe('Image self-destructs in 3 days');
		expect(describeUnseenMedia(['video'], '1 hour')).toBe('Video self-destructs in 1 hour');
	});

	it('counts several files of one kind', () => {
		expect(describeUnseenMedia(['image', 'image'], '3 days')).toBe(
			'2 images self-destruct in 3 days'
		);
	});

	it('says media for a mix, or when the kinds are not all known', () => {
		expect(describeUnseenMedia(['image', 'video'], '3 days')).toBe(
			'Media self-destructs in 3 days'
		);
		expect(describeUnseenMedia(null, '3 days')).toBe('Media self-destructs in 3 days');
		expect(describeUnseenMedia([], '3 days')).toBe('Media self-destructs in 3 days');
	});
});
