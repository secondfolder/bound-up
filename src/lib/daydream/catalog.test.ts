import { describe, expect, it } from 'vitest';
import { EMPTY_IDEA } from '../daydream';
import { daydreamCharacterKind, daydreamIdeaKind } from '../sealed-kinds/daydreams';
import { isClientId } from '../vault';
import {
	CASTING_CHIPS,
	CHARACTER_CHIPS,
	CHARACTER_TEMPLATES,
	IDEA_CHIPS,
	IDEA_TEMPLATES,
	ownFieldId
} from './catalog';
import { MAX_CHIP_LENGTH } from './suggestions';

const isSorted = (values: number[]) =>
	values.every((value, at) => at === 0 || value >= (values[at - 1] ?? 0));

describe('ownFieldId', () => {
	it('is a client id, the same for the same seed and different for another', () => {
		const one = ownFieldId('idea:kept:The secret');
		expect(isClientId(one)).toBe(true);
		expect(ownFieldId('idea:kept:The secret')).toBe(one);
		expect(ownFieldId('idea:kept:The rule')).not.toBe(one);
	});
});

describe('the catalog', () => {
	it('has starting points a character or idea can be saved as', () => {
		for (const { character } of CHARACTER_TEMPLATES) {
			expect(daydreamCharacterKind.latest.safeParse(character).success, character.name).toBe(true);
		}
		for (const { idea } of IDEA_TEMPLATES) {
			// As the idea dialog saves one: over an empty idea, so with no brief or research.
			const withIds = {
				...EMPTY_IDEA,
				...idea,
				parts: idea.parts.map((part) => ({ ...part, id: crypto.randomUUID() })),
				openings: idea.openings.map((opening) => ({ ...opening, id: crypto.randomUUID() })),
				trackers: idea.trackers.map((tracker) => ({ ...tracker, id: crypto.randomUUID() }))
			};
			expect(daydreamIdeaKind.latest.safeParse(withIds).success, idea.title).toBe(true);
		}
	});

	it('runs every starting point from SFW to the far end, in order', () => {
		const heat = IDEA_TEMPLATES.map(({ idea }) => idea.dials.heat ?? 0);
		expect(isSorted(heat)).toBe(true);
		expect(new Set(heat)).toEqual(new Set([1, 2, 3, 4, 5]));
		expect(IDEA_TEMPLATES.some(({ idea }) => idea.dials.kink === 5)).toBe(true);

		const libido = CHARACTER_TEMPLATES.map(({ character }) => character.dials.libido ?? 0);
		expect(isSorted(libido)).toBe(true);
		expect(libido[0]).toBe(1);
		expect(libido.at(-1)).toBe(5);
		expect(CHARACTER_TEMPLATES.some(({ character }) => character.dials.kink === 5)).toBe(true);
	});

	it('keeps every chip one phrase, short, and in its list once', () => {
		// `toggleChip` finds a chip between commas, so one with a comma in it could never be taken out.
		for (const chips of [CHARACTER_CHIPS, IDEA_CHIPS, CASTING_CHIPS].flatMap(Object.values)) {
			for (const chip of chips) {
				expect(chip, chip).not.toMatch(/[,\n]/);
				expect(chip.length, chip).toBeLessThanOrEqual(MAX_CHIP_LENGTH);
			}
			expect(new Set(chips).size).toBe(chips.length);
		}
	});
});
