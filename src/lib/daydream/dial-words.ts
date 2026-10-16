/**
 * What each dial's value means, in words.
 *
 * One table for the screen and the model alike: the slider shows the label,
 * and the prompt (`server/daydream/prompt.ts`) sends the phrase, so what the
 * user set and what the model is told cannot drift apart.
 *
 * Pure and alias-free.
 */

import type {
	CharacterDials,
	CharacterTone,
	DialValue,
	PassageLength,
	StoryDials
} from '../daydream';

type Scale = Readonly<Record<DialValue, { label: string; phrase: string }>>;

export const CHARACTER_TONES: readonly { value: CharacterTone; label: string; phrase: string }[] = [
	{ value: 'warm', label: 'Warm', phrase: 'warm and affectionate' },
	{ value: 'teasing', label: 'Teasing', phrase: 'playful and teasing' },
	{ value: 'cold', label: 'Cold', phrase: 'cool and distant' },
	{ value: 'clinical', label: 'Clinical', phrase: 'detached and clinical' }
];

type SliderDial = Exclude<keyof CharacterDials, 'tone'>;

export const CHARACTER_SLIDERS: readonly {
	key: SliderDial;
	label: string;
	low: string;
	high: string;
	scale: Scale;
}[] = [
	{
		key: 'control',
		label: 'Control',
		low: 'Follows',
		high: 'Takes charge',
		scale: {
			1: { label: 'Follows your lead', phrase: 'follows the user’s lead' },
			2: { label: 'Leans on you', phrase: 'mostly lets the user decide' },
			3: { label: 'Even', phrase: 'shares control evenly' },
			4: { label: 'Takes the lead', phrase: 'usually takes the lead' },
			5: { label: 'In complete control', phrase: 'is in complete control' }
		}
	},
	{
		key: 'strictness',
		label: 'Strictness',
		low: 'Lenient',
		high: 'Strict',
		scale: {
			1: { label: 'Very lenient', phrase: 'lets almost anything slide' },
			2: { label: 'Lenient', phrase: 'is lenient' },
			3: { label: 'Fair', phrase: 'is firm but fair' },
			4: { label: 'Strict', phrase: 'is strict about rules' },
			5: { label: 'Unbending', phrase: 'is unbending: every rule, every time' }
		}
	},
	{
		key: 'edge',
		label: 'Edge',
		low: 'Gentle',
		high: 'Cruel',
		scale: {
			1: { label: 'Tender', phrase: 'is tender and gentle' },
			2: { label: 'Kind', phrase: 'is mostly kind' },
			3: { label: 'Mixed', phrase: 'mixes kindness with a bite' },
			4: { label: 'Harsh', phrase: 'is harsh' },
			5: { label: 'Cruel', phrase: 'is cruel, and enjoys it' }
		}
	},
	{
		key: 'talk',
		label: 'Talk',
		low: 'Terse',
		high: 'Chatty',
		scale: {
			1: { label: 'Few words', phrase: 'says as little as possible' },
			2: { label: 'Terse', phrase: 'speaks briefly' },
			3: { label: 'Conversational', phrase: 'talks naturally' },
			4: { label: 'Talkative', phrase: 'talks a lot' },
			5: { label: 'Never stops', phrase: 'keeps up a constant stream of talk' }
		}
	}
];

/** A character's dials as one sentence for the model, or null when none is set. */
export function describeCharacterDials(dials: CharacterDials): string | null {
	const parts: string[] = [];
	const tone = CHARACTER_TONES.find((entry) => entry.value === dials.tone);
	if (tone) {
		parts.push(`comes across as ${tone.phrase}`);
	}
	for (const slider of CHARACTER_SLIDERS) {
		const value = dials[slider.key];
		if (value !== null) {
			parts.push(slider.scale[value].phrase);
		}
	}
	return parts.length > 0 ? `${parts.join('; ')}.` : null;
}

export const STORY_SLIDERS: readonly {
	key: 'intensity' | 'pace';
	label: string;
	low: string;
	high: string;
	scale: Scale;
}[] = [
	{
		key: 'intensity',
		label: 'Intensity',
		low: 'Gentle',
		high: 'Intense',
		scale: {
			1: { label: 'Very gentle', phrase: 'very gentle: soft, slow, reassuring' },
			2: { label: 'Gentle', phrase: 'gentle' },
			3: { label: 'Moderate', phrase: 'moderate' },
			4: { label: 'Intense', phrase: 'intense' },
			5: { label: 'Very intense', phrase: 'very intense: as far as the user’s limits allow' }
		}
	},
	{
		key: 'pace',
		label: 'Pace',
		low: 'Lingering',
		high: 'Fast',
		scale: {
			1: { label: 'Lingering', phrase: 'lingering: dwell on every moment' },
			2: { label: 'Slow', phrase: 'slow' },
			3: { label: 'Steady', phrase: 'steady' },
			4: { label: 'Brisk', phrase: 'brisk' },
			5: { label: 'Fast', phrase: 'fast: move the story along quickly' }
		}
	}
];

export const PASSAGE_LENGTHS: readonly { value: PassageLength; label: string; phrase: string }[] = [
	{ value: 'short', label: 'Short', phrase: 'one short paragraph' },
	{ value: 'medium', label: 'Medium', phrase: 'two or three short paragraphs' },
	{ value: 'long', label: 'Long', phrase: 'four or five paragraphs' }
];

/** The story dials as lines for the model. */
export function describeStoryDials(dials: StoryDials): string[] {
	const lines = STORY_SLIDERS.map(
		(slider) => `${slider.label}: ${slider.scale[dials[slider.key]].phrase}.`
	);
	const length = PASSAGE_LENGTHS.find((entry) => entry.value === dials.length);
	lines.push(`Length of each passage: ${length?.phrase ?? 'two or three short paragraphs'}.`);
	return lines;
}
