import { type KinkItem, kinkById, liveItems, normaliseSearch } from '../kink-list/catalog';
import type { Mentioned } from './considerations';

/**
 * Which kinks a scene's page mentions, worked out in the browser from its
 * text, so that a prompt about a non-verbal signal can appear once someone
 * writes "gag". It runs on the plain text and nothing leaves the device:
 * the page is sealed, and so is what it is about. See docs/scenes.md,
 * "Noticing what the page mentions".
 *
 * A kink is mentioned when its name or one of its aliases appears as whole
 * words, or with an "s" on the end ("ropes", "blindfolds"). It is a nudge,
 * not a classifier: a miss means a prompt waits, and a false match shows a
 * prompt someone can wave away.
 */

type Phrase = { text: string; item: KinkItem };

// Categories are what the list is browsed by, not things people write
// ("Pain", "Mind"); only kinks and specifics are matched.
const phrases: Phrase[] = liveItems
	.filter((item) => item.parent !== undefined)
	.flatMap((item) =>
		[item.name, ...(item.aliases ?? [])]
			.map(normaliseSearch)
			.filter((text) => text.length > 0)
			.map((text) => ({ text, item }))
	);

/** Every item above `item` in the catalogue, and itself. */
function withAncestors(item: KinkItem): KinkItem[] {
	const chain: KinkItem[] = [];
	let current: KinkItem | undefined = item;
	while (current && chain.length < 4) {
		chain.push(current);
		current = current.parent ? kinkById(current.parent) : undefined;
	}
	return chain;
}

export function recognise(text: string): Mentioned {
	const haystack = ` ${normaliseSearch(text)} `;
	const kinkIds = new Set<string>();
	const tags = new Set<string>();
	let maxIntensity = -1;
	if (haystack.trim() === '') {
		return { kinkIds, tags, maxIntensity };
	}
	for (const phrase of phrases) {
		if (!(haystack.includes(` ${phrase.text} `) || haystack.includes(` ${phrase.text}s `))) {
			continue;
		}
		maxIntensity = Math.max(maxIntensity, phrase.item.intensity);
		for (const item of withAncestors(phrase.item)) {
			kinkIds.add(item.id);
			for (const tag of item.tags ?? []) {
				tags.add(tag);
			}
		}
	}
	return { kinkIds, tags, maxIntensity };
}

/** Whether two results name the same kinks, so a page can skip a needless update. */
export function sameMentions(a: Mentioned, b: Mentioned): boolean {
	if (a.kinkIds.size !== b.kinkIds.size || a.maxIntensity !== b.maxIntensity) {
		return false;
	}
	for (const kink of a.kinkIds) {
		if (!b.kinkIds.has(kink)) {
			return false;
		}
	}
	return true;
}
