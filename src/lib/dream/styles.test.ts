import { describe, expect, it } from 'vitest';
import {
	DEFAULT_STYLE,
	keptStyle,
	OWN_STYLE,
	presetList,
	readStyle,
	STYLE_PRESETS,
	styleInstructions,
	writingStyleSchema
} from './styles';

describe('readStyle', () => {
	it('reads a preset, ignoring case, with its notes', () => {
		expect(readStyle(' Filthy ', ' Lots of dirty talk. ')).toEqual({
			preset: 'filthy',
			notes: 'Lots of dirty talk.',
			by: 'model'
		});
	});

	it('takes an unknown preset with notes as a style of its own', () => {
		expect(readStyle('noir-diary', 'First person, past tense.').preset).toBe(OWN_STYLE);
		expect(readStyle(OWN_STYLE, 'Second person, present.').preset).toBe(OWN_STYLE);
	});

	it('falls back to the default with nothing to go on', () => {
		expect(readStyle(undefined, '')).toEqual({ preset: DEFAULT_STYLE, notes: '', by: 'model' });
		expect(readStyle(OWN_STYLE, '  ').preset).toBe(DEFAULT_STYLE);
	});

	it('writes only what the sealed record accepts', () => {
		for (const style of [readStyle('lush', 'x'), readStyle('own', 'y'), readStyle('', '')]) {
			expect(writingStyleSchema.safeParse(style).success).toBe(true);
		}
	});
});

describe('keptStyle', () => {
	const chosen = { preset: 'clipped' as const, notes: 'Lists.', by: 'user' as const };

	it('keeps the user’s choice through a rebuild that kept its preset', () => {
		expect(keptStyle(chosen, { preset: 'clipped', notes: 'Reworded.', by: 'model' })).toBe(chosen);
	});

	it('takes a different preset as the rebuild following a change', () => {
		const built = { preset: 'filthy' as const, notes: '', by: 'model' as const };
		expect(keptStyle(chosen, built)).toBe(built);
		expect(keptStyle({ ...chosen, by: 'model' }, { ...built, preset: 'clipped' })).toEqual({
			...built,
			preset: 'clipped'
		});
	});
});

describe('the presets', () => {
	it('has unique ids, none of them the own style', () => {
		const ids = STYLE_PRESETS.map((preset) => preset.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).not.toContain(OWN_STYLE);
	});

	it('words every one concretely, and lists them for the model', () => {
		for (const preset of STYLE_PRESETS) {
			expect(preset.prompt.length).toBeGreaterThan(200);
			expect(presetList()).toContain(`- ${preset.id} (${preset.name})`);
			expect(presetList({ full: true })).toContain(preset.prompt.split('\n')[0]);
		}
	});

	it('keeps the raw style’s crude-words rule', () => {
		const filthy = STYLE_PRESETS.find((preset) => preset.id === 'filthy');
		expect(filthy?.prompt).toMatch(/Crude words, never clinical ones/);
	});
});

describe('styleInstructions', () => {
	it('is the preset’s instructions with this daydream’s notes after', () => {
		const text = styleInstructions({ preset: 'pulp', notes: 'Heist beats.', by: 'model' });
		expect(text).toMatch(/^Write like a good page-turner/);
		expect(text).toContain('For this daydream: Heist beats.');
		expect(text).not.toContain('The user chose');
	});

	it('is the notes alone for a style of its own, and says when the user chose it', () => {
		expect(styleInstructions({ preset: OWN_STYLE, notes: 'Diary entries.', by: 'user' })).toBe(
			'Diary entries.\nThe user chose this style.'
		);
	});
});
