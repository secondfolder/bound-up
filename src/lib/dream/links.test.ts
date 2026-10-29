import { describe, expect, it } from 'vitest';
import { asksForResearch, briefLinks, isAllowedPage, pagesToRead, readableHosts } from './links';

describe('links in a brief', () => {
	const brief =
		'Like https://www.reddit.com/r/x/comments/1, and (https://example.org/story). Again https://example.org/story.';

	it('finds each link once, without the sentence around it', () => {
		expect(briefLinks(brief)).toEqual([
			'https://www.reddit.com/r/x/comments/1',
			'https://example.org/story'
		]);
		expect(pagesToRead(brief)).toBe(6);
		expect(pagesToRead('no links')).toBe(4);
	});

	it('allows only the sites the brief links to', () => {
		const hosts = readableHosts(brief);
		expect(hosts).toEqual(['www.reddit.com', 'example.org']);
		expect(isAllowedPage('https://example.org/other', hosts)).toBe(true);
		expect(isAllowedPage('https://evil.test/?q=brief', hosts)).toBe(false);
		expect(isAllowedPage('not a url', hosts)).toBe(false);
	});

	it('offers a search only to a brief that links pages or asks for something looked up', () => {
		expect(asksForResearch('research common phrases in obedience trance captions')).toBe(true);
		expect(asksForResearch('use real phrases from hypnosis scripts')).toBe(true);
		expect(asksForResearch('Look up how a night watch is run, then write it')).toBe(true);
		expect(asksForResearch(brief)).toBe(true);
		expect(asksForResearch('a training dynamic')).toBe(false);
		expect(asksForResearch('make it feel real')).toBe(false);
	});
});
