import { describe, expect, it } from 'vitest';
import { recognise, sameMentions } from './recognise';

describe('recognise', () => {
	it('finds nothing in an empty page', () => {
		expect(recognise('   ').kinkIds.size).toBe(0);
	});

	it('finds a kink by its name or an alias, as whole words, with or without an s', () => {
		const found = recognise('Blindfolded, then the ropes come out');
		expect(found.kinkIds.has('blindfolds')).toBe(true);
		expect(found.kinkIds.has('rope')).toBe(true);
	});

	it('does not match inside another word', () => {
		// "gag" inside "gaggle" is not a gag.
		expect(recognise('A gaggle of geese').kinkIds.has('gags')).toBe(false);
	});

	it('includes the kinks above a match, and their tags', () => {
		const found = recognise('a little choking');
		expect(found.kinkIds.has('choking')).toBe(true);
		expect(found.kinkIds.has('breath-play')).toBe(true);
		expect(found.tags.has('risky')).toBe(true);
		expect(found.maxIntensity).toBe(5);
	});

	it('reads CNC as consent play', () => {
		expect(recognise('Some CNC tonight').tags.has('consent-play')).toBe(true);
	});
});

describe('sameMentions', () => {
	it('compares what was found', () => {
		expect(sameMentions(recognise('a gag'), recognise('gagged'))).toBe(true);
		expect(sameMentions(recognise('a gag'), recognise('a blindfold'))).toBe(false);
	});
});
