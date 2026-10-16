import { describe, expect, it } from 'vitest';
import { daydreamCharacterKind, daydreamSceneKind } from '../sealed-kinds/daydreams';
import {
	CASTING_CHIPS,
	CHARACTER_CHIPS,
	CHARACTER_TEMPLATES,
	SCENE_CHIPS,
	SCENE_TEMPLATES
} from './catalog';
import { MAX_CHIP_LENGTH } from './suggestions';

const isSorted = (values: number[]) =>
	values.every((value, at) => at === 0 || value >= (values[at - 1] ?? 0));

describe('the catalog', () => {
	it('has starting points a character or scene can be saved as', () => {
		for (const { character } of CHARACTER_TEMPLATES) {
			expect(daydreamCharacterKind.latest.safeParse(character).success, character.name).toBe(true);
		}
		for (const { scene } of SCENE_TEMPLATES) {
			const withIds = {
				...scene,
				parts: scene.parts.map((part) => ({ ...part, id: crypto.randomUUID() }))
			};
			expect(daydreamSceneKind.latest.safeParse(withIds).success, scene.title).toBe(true);
		}
	});

	it('runs every starting point from SFW to the far end, in order', () => {
		const heat = SCENE_TEMPLATES.map(({ scene }) => scene.dials.heat ?? 0);
		expect(isSorted(heat)).toBe(true);
		expect(new Set(heat)).toEqual(new Set([1, 2, 3, 4, 5]));
		expect(SCENE_TEMPLATES.some(({ scene }) => scene.dials.kink === 5)).toBe(true);

		const libido = CHARACTER_TEMPLATES.map(({ character }) => character.dials.libido ?? 0);
		expect(isSorted(libido)).toBe(true);
		expect(libido[0]).toBe(1);
		expect(libido.at(-1)).toBe(5);
		expect(CHARACTER_TEMPLATES.some(({ character }) => character.dials.kink === 5)).toBe(true);
	});

	it('keeps every chip one phrase, short, and in its list once', () => {
		// `toggleChip` finds a chip between commas, so one with a comma in it could never be taken out.
		for (const chips of [CHARACTER_CHIPS, SCENE_CHIPS, CASTING_CHIPS].flatMap(Object.values)) {
			for (const chip of chips) {
				expect(chip, chip).not.toMatch(/[,\n]/);
				expect(chip.length, chip).toBeLessThanOrEqual(MAX_CHIP_LENGTH);
			}
			expect(new Set(chips).size).toBe(chips.length);
		}
	});
});
