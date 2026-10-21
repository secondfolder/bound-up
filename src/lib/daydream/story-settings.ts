/**
 * The settings a story changes itself, because the user asked outright
 * (docs/daydreams.md, "Settings the story changes"): longer or shorter
 * passages, slower or faster, more or less intense, more or less sexual or
 * kinky. The model says the new values in a reply's metadata; the browser,
 * which alone can open the setup, works out what actually changed, applies
 * it, and keeps what it was for Undo.
 *
 * Pure and alias-free.
 */

import type { DaydreamSetup } from '../daydream';
import type { StorySettings, StorySettingsBefore } from '../sealed-kinds/daydreams';
import { IDEA_SLIDERS, PASSAGE_LENGTHS, STORY_SLIDERS } from './dial-words';

/** A change worth keeping: only the settings whose value moved, and what they were. */
export type SettingsChange = { settings: StorySettings; settingsBefore: StorySettingsBefore };

/** A setting's value in a setup, the idea's heat and kink included. */
function current(setup: DaydreamSetup, key: keyof StorySettings) {
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

const KEYS = ['length', 'pace', 'intensity', 'heat', 'kink'] as const;

/**
 * What a reply's settings change in this setup, or null when nothing does:
 * a value already set is no change, and saying it again is not one either.
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
	if (moved.length === 0) {
		return null;
	}
	return {
		settings: Object.fromEntries(moved.map((key) => [key, settings[key]])) as StorySettings,
		settingsBefore: Object.fromEntries(
			moved.map((key) => [key, current(setup, key)])
		) as StorySettingsBefore
	};
}

/** A setup with these settings applied: the story dials, and the idea's heat and kink. */
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
		}
	};
}

/**
 * Whether every setting a passage changed is still as it left it: only then
 * is Undo offered, so it never puts back something the user has since set
 * by hand.
 */
export function stillInEffect(setup: DaydreamSetup, settings: StorySettings): boolean {
	return KEYS.every((key) => settings[key] === undefined || settings[key] === current(setup, key));
}

function phrase(key: keyof StorySettings, settings: StorySettings): string | null {
	switch (key) {
		case 'length': {
			const label = PASSAGE_LENGTHS.find((entry) => entry.value === settings.length)?.label;
			return label ? `${label.toLowerCase()} passages` : null;
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
			return value && slider ? `${slider.label.toLowerCase()} ${slider.scale[value].label}` : null;
		}
		default:
			return key satisfies never;
	}
}

/** "Now long passages and pace slow, as you asked.": the note under the passage that changed them. */
export function describeSettings(settings: StorySettings): string {
	const parts = KEYS.flatMap((key) => {
		const said = phrase(key, settings);
		return said ? [said] : [];
	});
	const listed =
		parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? '');
	return `Now ${listed}, as you asked.`;
}
