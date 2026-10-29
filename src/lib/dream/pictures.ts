/**
 * What a `<picture>` asks the image model for (docs/dreams.md, "Pictures"):
 * built only from the appearance the elements record, never from anything
 * the passage says about anyone's looks, so the description of a person is
 * one the user can read on their card and correct. The caption says what is
 * happening; the prompt says who and where.
 *
 * Pure and alias-free.
 */

import type { Heat } from './build';
import type { DreamElement } from './elements';

/** The longest description sent: the image route's own cap (`DAYDREAM_LIMITS.imagePrompt`). */
export const MAX_PICTURE_PROMPT = 1000;

const LOOKS = ['appearance', 'feel'];
const ID_SEPARATOR = /[\s,]+/;

/** The image model's heat dial, from the daydream's. */
const HEAT_DIAL: Readonly<Record<Heat, 1 | 2 | 3 | 4>> = {
	none: 1,
	suggestive: 2,
	steamy: 3,
	explicit: 4
};

export function picturePrompt(
	picture: { of: string; caption: string },
	elements: readonly DreamElement[],
	heat: Heat
): { prompt: string; heat: 1 | 2 | 3 | 4 } | null {
	const ids = picture.of
		.split(ID_SEPARATOR)
		.map((id) => id.trim())
		.filter(Boolean);
	const described = ids.flatMap((id) => {
		const element = elements.find((candidate) => candidate.id === id);
		const looks = element?.fields
			.filter((field) => LOOKS.includes(field.name))
			.map((field) => field.text);
		return element && looks && looks.length > 0 ? [`${element.name}: ${looks.join(' ')}`] : [];
	});
	const caption = picture.caption.trim();
	if (!(caption || described.length > 0)) {
		return null;
	}
	const prompt = [caption, ...described].filter(Boolean).join('\n');
	return { prompt: prompt.slice(0, MAX_PICTURE_PROMPT), heat: HEAT_DIAL[heat] };
}
