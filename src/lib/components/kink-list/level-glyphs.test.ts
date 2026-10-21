import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEVELS } from '$lib/kink-list/answers';

const css = readFileSync(new URL('./level-glyphs.css', import.meta.url), 'utf8');

/** Each level's `--kink-glyph`, as the stylesheet declares it. */
function glyphOf(level: string): string | undefined {
	const rule: RegExpExecArray | null = new RegExp(
		`\\[data-kink-level='${level}'\\]\\s*\\{\\s*--kink-glyph:\\s*(url\\(['"][^'"]+['"]\\))`
	).exec(css);
	return rule?.[1];
}

describe('answer level marks', () => {
	it('gives every level a mark, so a new level cannot arrive drawn as a blank dot', () => {
		for (const level of LEVELS) {
			expect(glyphOf(level), level).toBeDefined();
		}
	});

	it('gives no two levels the same mark, so none rests on colour alone', () => {
		const marks = LEVELS.map(glyphOf);
		expect(new Set(marks).size).toBe(LEVELS.length);
	});
});
