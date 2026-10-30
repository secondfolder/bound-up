/**
 * The requests the page sends, assembled from the opened setup and story
 * (docs/dreams.md, "What the server sees"): only what each step's prompt
 * needs, so nothing else of the story leaves the device.
 *
 * Pure and alias-free, so the page and the simulated player build them the
 * same way.
 */

import type { DreamPreference, DreamSetup, DreamSetupBuild } from '../sealed-kinds/dreams';
import { passageCapabilities } from './capabilities';
import type { DreamElement } from './elements';
import type { Nudge } from './nudges';
import {
	type BuildRequest,
	MAX_RECENT_NAMES,
	type PassageRequest,
	type ReadRequest
} from './requests';
import { chosenDirection, serializeBuild } from './setup-flow';
import { type HistoryEntry, similarity } from './story';
import { readStyle } from './styles';

export type Worded = { limits: string[]; preferences: string[] };

const FIRMNESS_WORDS: Readonly<Record<Exclude<DreamPreference['firmness'], 'hard'>, string>> = {
	default: 'By default',
	leaning: 'Usually'
};

/** How often a "usually" preference is left out of a daydream (docs/dreams.md, "Preferences"). */
export const LEANING_DROP = 0.25;

/**
 * The user's preferences as the prompts take them: hard ones as limits,
 * the rest as lines saying how firm they are, this story's last so they win.
 * Each "usually" one is left out now and then (`random`), so remembered
 * tastes shape the stories without making every one the same. Hard limits
 * are never left out.
 */
export function wordPreferences(
	general: readonly DreamPreference[],
	story: readonly DreamPreference[],
	random: () => number = () => 1
): Worded {
	const all = [...general, ...story];
	return {
		limits: all.filter((entry) => entry.firmness === 'hard').map((entry) => entry.text),
		preferences: all
			.filter((entry) => entry.firmness !== 'hard')
			.filter((entry) => entry.firmness !== 'leaning' || random() >= LEANING_DROP)
			.map((entry) => {
				const firmness = entry.firmness === 'hard' ? 'Never' : FIRMNESS_WORDS[entry.firmness];
				const scope = entry.appliesTo ? ` (for ${entry.appliesTo})` : '';
				return `${firmness}${scope}: ${entry.text}`;
			})
	};
}

/** What this user's recent daydreams went with, so the next one does not repeat it. */
export type Recent = { directions: string[]; names: string[] };

export const NO_RECENT: Recent = { directions: [], names: [] };

/** Briefs at least this alike count as "briefs like this one" for recent directions. */
const SIMILAR_BRIEF = 0.2;

/**
 * Recent directions and names from the user's other daydreams, newest first
 * (docs/dreams.md, "Variety"): the directions taken for briefs like this
 * one, which step 1 is told not to repeat, and every name given, which the
 * build avoids.
 */
export function recentFrom(others: readonly DreamSetup[], brief: string): Recent {
	const directions = others
		.filter((other) => similarity(other.brief, brief) >= SIMILAR_BRIEF)
		.map((other) => chosenDirection(other))
		.filter((direction): direction is string => direction !== null)
		.slice(0, 8);
	// People only: places and things ("The kitchen counter", and each word of
	// it) used to fill the list, pushing out the names it was for after a few
	// daydreams, so the same few came round again.
	const names = [
		...new Set(
			others.flatMap((other) =>
				(other.build?.elements ?? []).flatMap((element) =>
					element.type === 'character' ? [element.name, ...element.name.split(' ')] : []
				)
			)
		)
	]
		.filter((name) => name.length > 1)
		.slice(0, MAX_RECENT_NAMES);
	return { directions, names };
}

export function readRequestFor(
	setup: DreamSetup,
	worded: Worded,
	nudges: Nudge[],
	recent: Recent = NO_RECENT
): ReadRequest {
	const { reading } = setup;
	return {
		brief: setup.brief,
		amendments: setup.amendments,
		answer:
			reading?.ask && reading.answer !== null
				? { question: reading.ask.text, answer: reading.answer }
				: null,
		...worded,
		recentDirections: recent.directions,
		nudges
	};
}

/** `previous` is the build a change is to, while the page still has it. */
export function buildRequestFor(
	setup: DreamSetup,
	worded: Worded,
	previous: DreamSetupBuild | null,
	recent: Recent = NO_RECENT
): BuildRequest {
	return {
		brief: setup.brief,
		amendments: setup.amendments,
		musts: setup.reading?.musts ?? [],
		research: setup.reading?.research.text ?? '',
		direction: chosenDirection(setup),
		nudges: setup.chosen?.nudges ?? [],
		...worded,
		recentNames: recent.names,
		previous: previous ? serializeBuild(previous) : null
	};
}

export function passageRequestFor(
	setup: DreamSetup & { build: DreamSetupBuild },
	worded: Worded,
	story: {
		elements: DreamElement[];
		summaries: string[];
		history: HistoryEntry[];
		take: string | null;
		repeated: string[];
		/**
		 * Whether the user is listening: `voice` is on only then, so delivery
		 * cues and sounds are written for a passage that will be heard
		 * (docs/dreams.md, "Read aloud").
		 */
		listening?: boolean;
	}
): PassageRequest {
	const { build } = setup;
	return {
		setup: {
			heat: build.heat,
			telling: build.telling,
			// A build from before there were styles is written plainly, as its menu says.
			style: build.style ?? readStyle(undefined, ''),
			capabilities: passageCapabilities(Boolean(story.listening)),
			elements: story.elements,
			presentation: build.presentation,
			musts: setup.reading?.musts ?? [],
			research: setup.reading?.research.text ?? '',
			designs: (setup.designs ?? []).map(({ kind, description, slots }) => ({
				kind,
				description,
				slots: slots.map((slot) => slot.name)
			}))
		},
		...worded,
		history: story.history,
		summaries: story.summaries,
		take: story.take,
		repeated: story.repeated
	};
}
