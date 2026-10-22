/**
 * The smallest single replacement that turns `before` into `after`: where it
 * starts, how much of `before` it removes, and what it inserts.
 *
 * What a plain text field needs to edit a shared `Y.Text` without replacing
 * the whole string on every keystroke: replacing it all would make two people
 * typing in the title at once overwrite each other, where a minimal edit lets
 * Yjs merge them like any other text.
 */
export function textChange(
	before: string,
	after: string
): { index: number; remove: number; insert: string } | null {
	if (before === after) {
		return null;
	}
	let start = 0;
	const shortest = Math.min(before.length, after.length);
	while (start < shortest && before[start] === after[start]) {
		start += 1;
	}
	let end = 0;
	while (end < shortest - start && before.at(-1 - end) === after.at(-1 - end)) {
		end += 1;
	}
	return {
		index: start,
		remove: before.length - start - end,
		insert: after.slice(start, after.length - end)
	};
}
