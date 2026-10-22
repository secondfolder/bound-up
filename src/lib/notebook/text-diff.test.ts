import { describe, expect, it } from 'vitest';
import { textChange } from './text-diff';

/** Applies a change the way a `Y.Text` would. */
function apply(before: string, change: ReturnType<typeof textChange>): string {
	if (!change) {
		return before;
	}
	return before.slice(0, change.index) + change.insert + before.slice(change.index + change.remove);
}

describe('textChange', () => {
	it.each([
		['', 'Hello'],
		['Hello', ''],
		['Hello', 'Hello there'],
		['Hello there', 'Hello'],
		['Hello', 'Jello'],
		['aaa', 'aaaa'],
		['abcabc', 'abc'],
		['Sunday', 'Saturday']
	])('turns %j into %j', (before, after) => {
		expect(apply(before, textChange(before, after))).toBe(after);
	});

	it('is nothing for no change', () => {
		expect(textChange('same', 'same')).toBeNull();
	});

	it('touches only what changed, so concurrent edits elsewhere survive', () => {
		expect(textChange('Our weekend', 'Our long weekend')).toEqual({
			index: 4,
			remove: 0,
			insert: 'long '
		});
	});
});
