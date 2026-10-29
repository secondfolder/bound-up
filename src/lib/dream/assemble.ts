/**
 * The requests the page sends, assembled from the opened setup and story
 * (docs/dreams.md, "What the server sees"): only what each step's prompt
 * needs, so nothing else of the story leaves the device.
 *
 * Pure and alias-free, so the page and the simulated player build them the
 * same way.
 */

import type { DreamPreference, DreamSetup, DreamSetupBuild } from '../sealed-kinds/dreams';
import type { DreamElement } from './elements';
import type { Nudge } from './nudges';
import type { BuildRequest, PassageRequest, ReadRequest } from './requests';
import { chosenDirection, serializeBuild } from './setup-flow';
import type { HistoryEntry } from './story';

export type Worded = { limits: string[]; preferences: string[] };

const FIRMNESS_WORDS: Readonly<Record<Exclude<DreamPreference['firmness'], 'hard'>, string>> = {
	default: 'By default',
	leaning: 'Usually'
};

/**
 * The user's preferences as the prompts take them: hard ones as limits,
 * the rest as lines saying how firm they are, this story's last so they win.
 */
export function wordPreferences(
	general: readonly DreamPreference[],
	story: readonly DreamPreference[]
): Worded {
	const all = [...general, ...story];
	return {
		limits: all.filter((entry) => entry.firmness === 'hard').map((entry) => entry.text),
		preferences: all
			.filter((entry) => entry.firmness !== 'hard')
			.map((entry) => {
				const firmness = entry.firmness === 'hard' ? 'Never' : FIRMNESS_WORDS[entry.firmness];
				const scope = entry.appliesTo ? ` (for ${entry.appliesTo})` : '';
				return `${firmness}${scope}: ${entry.text}`;
			})
	};
}

export function readRequestFor(setup: DreamSetup, worded: Worded, nudges: Nudge[]): ReadRequest {
	const { reading } = setup;
	return {
		brief: setup.brief,
		amendments: setup.amendments,
		answer:
			reading?.ask && reading.answer !== null
				? { question: reading.ask.text, answer: reading.answer }
				: null,
		...worded,
		recentDirections: [],
		nudges
	};
}

/** `previous` is the build a change is to, while the page still has it. */
export function buildRequestFor(
	setup: DreamSetup,
	worded: Worded,
	previous: DreamSetupBuild | null
): BuildRequest {
	return {
		brief: setup.brief,
		amendments: setup.amendments,
		musts: setup.reading?.musts ?? [],
		research: setup.reading?.research.text ?? '',
		direction: chosenDirection(setup),
		nudges: setup.chosen?.nudges ?? [],
		...worded,
		recentNames: [],
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
	}
): PassageRequest {
	const { build } = setup;
	return {
		setup: {
			heat: build.heat,
			telling: build.telling,
			capabilities: build.capabilities,
			elements: story.elements,
			presentation: build.presentation,
			musts: setup.reading?.musts ?? [],
			research: setup.reading?.research.text ?? ''
		},
		...worded,
		history: story.history,
		summaries: story.summaries,
		take: story.take,
		repeated: story.repeated
	};
}
