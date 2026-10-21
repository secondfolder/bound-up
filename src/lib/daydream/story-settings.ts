/**
 * The settings a story changes itself (docs/daydreams.md, "Settings the
 * story changes"): longer or shorter passages, slower or faster, more or
 * less intense, the idea's heat and kink when the user pushes for it, and a
 * character's own libido and kink as the story changes them. The model says
 * the new values in a reply's metadata; the browser, which alone can open
 * the setup, works out what actually changed, applies it, and keeps what it
 * was for Undo.
 *
 * Pure and alias-free.
 */

import type { DaydreamSetup } from '../daydream';
import type { StorySettings, StorySettingsBefore } from '../sealed-kinds/daydreams';
import { CHARACTER_SLIDERS, IDEA_SLIDERS, PASSAGE_LENGTHS, STORY_SLIDERS } from './dial-words';

/** A change worth keeping: only the settings whose value moved, and what they were. */
export type SettingsChange = { settings: StorySettings; settingsBefore: StorySettingsBefore };

/** The daydream's own settings, as opposed to a character's. */
const KEYS = ['length', 'pace', 'intensity', 'heat', 'kink'] as const;
type Key = (typeof KEYS)[number];

/** A character's dials the story may change. */
const CHARACTER_KEYS = ['libido', 'kink'] as const;
type CharacterKey = (typeof CHARACTER_KEYS)[number];

/** A setting's value in a setup, the idea's heat and kink included. */
function current(setup: DaydreamSetup, key: Key) {
	switch (key) {
		case 'length':
		case 'pace':
		case 'intensity':
			return setup.dials[key];
		case 'heat':
		case 'kink':
			return setup.idea.dials[key];
		default:
			return key satisfies never;
	}
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function characterIn(setup: DaydreamSetup, name: string) {
	return setup.characters.find((character) => sameName(character.name, name));
}

/** The daydream's own settings only: what a reply to anything but the user's own words may not touch. */
export function withoutDaydreamSettings(
	settings: StorySettings | undefined
): StorySettings | undefined {
	return settings?.characters?.length ? { characters: settings.characters } : undefined;
}

/**
 * What a reply's settings change in this setup, or null when nothing does:
 * a value already set is no change, and a character not in the story is
 * nobody's to change.
 */
export function settingsChange(
	setup: DaydreamSetup,
	settings: StorySettings | undefined
): SettingsChange | null {
	if (!settings) {
		return null;
	}
	const moved = KEYS.filter(
		(key) => settings[key] !== undefined && settings[key] !== current(setup, key)
	);
	const characters = (settings.characters ?? []).flatMap((entry) => {
		const character = characterIn(setup, entry.name);
		if (!character) {
			return [];
		}
		const keys = CHARACTER_KEYS.filter(
			(key) => entry[key] !== undefined && entry[key] !== character.dials[key]
		);
		return keys.length > 0 ? [{ character, keys, entry }] : [];
	});
	if (moved.length === 0 && characters.length === 0) {
		return null;
	}
	const changed: Record<string, unknown> = Object.fromEntries(
		moved.map((key) => [key, settings[key]])
	);
	const before: Record<string, unknown> = Object.fromEntries(
		moved.map((key) => [key, current(setup, key)])
	);
	if (characters.length > 0) {
		changed.characters = characters.map(({ character, keys, entry }) => ({
			name: character.name,
			...Object.fromEntries(keys.map((key) => [key, entry[key]]))
		}));
		before.characters = characters.map(({ character, keys }) => ({
			name: character.name,
			...Object.fromEntries(keys.map((key) => [key, character.dials[key]]))
		}));
	}
	return {
		settings: changed as StorySettings,
		settingsBefore: before as StorySettingsBefore
	};
}

/** A setup with these settings applied: the story dials, the idea's heat and kink, and characters' dials. */
export function withSettings(
	setup: DaydreamSetup,
	values: StorySettings | StorySettingsBefore
): DaydreamSetup {
	return {
		...setup,
		dials: {
			...setup.dials,
			...(values.length === undefined ? {} : { length: values.length }),
			...(values.pace === undefined ? {} : { pace: values.pace }),
			...(values.intensity === undefined ? {} : { intensity: values.intensity })
		},
		idea: {
			...setup.idea,
			dials: {
				...setup.idea.dials,
				...(values.heat === undefined ? {} : { heat: values.heat }),
				...(values.kink === undefined ? {} : { kink: values.kink })
			}
		},
		characters: setup.characters.map((character) => {
			const entry = values.characters?.find((each) => sameName(each.name, character.name));
			if (!entry) {
				return character;
			}
			return {
				...character,
				dials: {
					...character.dials,
					...(entry.libido === undefined ? {} : { libido: entry.libido }),
					...(entry.kink === undefined ? {} : { kink: entry.kink })
				}
			};
		})
	};
}

/**
 * Whether every setting a passage changed is still as it left it: only then
 * is Undo offered, so it never puts back something the user has since set
 * by hand.
 */
export function stillInEffect(setup: DaydreamSetup, settings: StorySettings): boolean {
	const own = KEYS.every(
		(key) => settings[key] === undefined || settings[key] === current(setup, key)
	);
	const characters = (settings.characters ?? []).every((entry) => {
		const character = characterIn(setup, entry.name);
		return (
			character !== undefined &&
			CHARACTER_KEYS.every(
				(key: CharacterKey) => entry[key] === undefined || entry[key] === character.dials[key]
			)
		);
	});
	return own && characters;
}

function phrase(key: Key, settings: StorySettings): string | null {
	switch (key) {
		case 'length': {
			return PASSAGE_LENGTHS.find((entry) => entry.value === settings.length)?.note ?? null;
		}
		case 'pace':
		case 'intensity': {
			const value = settings[key];
			const slider = STORY_SLIDERS.find((entry) => entry.key === key);
			return value && slider
				? `${slider.label.toLowerCase()} ${slider.scale[value].label.toLowerCase()}`
				: null;
		}
		case 'heat':
		case 'kink': {
			const value = settings[key];
			const slider = IDEA_SLIDERS.find((entry) => entry.key === key);
			return value && slider
				? `the idea's ${slider.label.toLowerCase()} ${slider.scale[value].label}`
				: null;
		}
		default:
			return key satisfies never;
	}
}

function characterPhrases(entry: NonNullable<StorySettings['characters']>[number]): string[] {
	return CHARACTER_KEYS.flatMap((key) => {
		const value = entry[key];
		const slider = CHARACTER_SLIDERS.find((each) => each.key === key);
		return value && slider
			? [`${entry.name}'s ${slider.label.toLowerCase()} ${slider.scale[value].label}`]
			: [];
	});
}

/** "Now longer passages and Mara's libido Slutty.": the note under the passage that changed them. */
export function describeSettings(settings: StorySettings): string {
	const parts = [
		...KEYS.flatMap((key) => {
			const said = phrase(key, settings);
			return said ? [said] : [];
		}),
		...(settings.characters ?? []).flatMap(characterPhrases)
	];
	const listed =
		parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? '');
	return `Now ${listed}.`;
}
