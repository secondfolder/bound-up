import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { BLOCKED_AFTER, byHost, recordImage, resetMediaLog } from './media-log';

let warn: MockInstance<Console['warn']>;

beforeEach(() => {
	resetMediaLog();
	warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

const messages = () => warn.mock.calls.map((call) => String(call[0]));
const summaries = () => messages().filter((message) => message.includes('has failed'));

describe('recordImage', () => {
	it('names the host once every image from it has failed, and only once', () => {
		for (let i = 0; i < BLOCKED_AFTER + 3; i += 1) {
			recordImage(`https://media.redgifs.com/Clip${i}-poster.jpg`, 'failed');
		}
		expect(summaries()).toHaveLength(1);
		expect(summaries()[0]).toContain('Every image from media.redgifs.com has failed');
		expect(summaries()[0]).toContain('blocking');
	});

	it('logs each failure with its URL, so it can be opened directly', () => {
		recordImage('https://media.redgifs.com/One-poster.jpg', 'failed');
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('Image failed to load from media.redgifs.com'),
			'https://media.redgifs.com/One-poster.jpg'
		);
	});

	it('does not call a host blocked when some of its images load', () => {
		recordImage('https://media.redgifs.com/Good-poster.jpg', 'loaded');
		for (let i = 0; i < BLOCKED_AFTER + 1; i += 1) {
			recordImage(`https://media.redgifs.com/Bad${i}-poster.jpg`, 'failed');
		}
		expect(summaries()).toHaveLength(0);
	});

	it('keeps hosts apart', () => {
		for (let i = 0; i < BLOCKED_AFTER; i += 1) {
			recordImage(`https://media.redgifs.com/Bad${i}-poster.jpg`, 'failed');
			recordImage(`https://i.redd.it/good${i}.jpg`, 'loaded');
		}
		expect(summaries()).toHaveLength(1);
		expect(summaries()[0]).not.toContain('i.redd.it');
	});
});

describe('byHost', () => {
	it('counts URLs per host', () => {
		expect(
			byHost([
				'https://media.redgifs.com/a.jpg',
				'https://media.redgifs.com/b.jpg',
				'https://i.redd.it/c.jpg'
			])
		).toBe('2 from media.redgifs.com, 1 from i.redd.it');
		expect(byHost([])).toBe('none');
	});
});
