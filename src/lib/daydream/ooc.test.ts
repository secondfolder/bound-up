import { describe, expect, it } from 'vitest';
import { explicitOoc } from './ooc';

describe('explicitOoc', () => {
	it('recognises the usual conventions', () => {
		for (const text of [
			'(can we slow down?)',
			'((brb))',
			'[what is she wearing?]',
			'// quick question',
			'OOC: this is great',
			'ooc:also this',
			'  OOC : spaced'
		]) {
			expect(explicitOoc(text), text).toBe(true);
		}
	});

	it('leaves in-story turns alone', () => {
		for (const text of ['I kneel.', 'She said (quietly) no.', 'Look: the door.', 'oocasional']) {
			expect(explicitOoc(text), text).toBe(false);
		}
	});
});
