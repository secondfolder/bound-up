/**
 * Drawing names (docs/dreams.md, "Names"). The model describes a character;
 * code draws real names that fit; the model, or the user with "Another
 * name", chooses among them. Never a name models overuse, one from this
 * user's recent daydreams, or one already in the story.
 *
 * Alias-free, for the bench.
 */

import { drawDistinct, type Random } from '../../../dream/random';
import { OVERUSED_NAMES } from '../../../dream/repetition';
import { NAME_LISTS, type NameList } from './lists';

export type Gender = 'feminine' | 'masculine';

const FEMININE =
	/\b(?:woman|women|female|she|her|girl|lady|feminine|mother|wife|sister|daughter|queen|mistress|madam|nun|actress)\b/i;
const MASCULINE =
	/\b(?:man|men|male|he|his|him|boy|gentleman|masculine|father|husband|brother|son|king|master|sir|priest|actor)\b/i;

/** Which way a description leans, or null for neither or both. */
export function genderOf(description: string): Gender | null {
	const feminine = FEMININE.test(description);
	const masculine = MASCULINE.test(description);
	if (feminine === masculine) {
		return null;
	}
	return feminine ? 'feminine' : 'masculine';
}

/** The list a description points to, or null when none does (a broad mix is drawn). */
export function listFor(description: string): NameList | null {
	const text = ` ${description.toLowerCase()} `;
	return (
		NAME_LISTS.find((list) =>
			list.keywords.some((keyword) => new RegExp(`[^\\p{L}]${keyword}[^\\p{L}]`, 'u').test(text))
		) ?? null
	);
}

function allowed(exclude: readonly string[]): (name: string) => boolean {
	const out = new Set([...OVERUSED_NAMES, ...exclude].map((name) => name.toLowerCase()));
	return (name) => !out.has(name.toLowerCase());
}

/**
 * About ten first names and ten family names for a description, drawn from
 * the list it points to, first names of its gender where it says one. With
 * no list, a broad mix: each first name and the family name at the same
 * place come from one background, so a pair always belongs together.
 */
export function drawNames(
	request: { description: string; exclude?: readonly string[] },
	random: Random,
	count = 10
): { background: string | null; given: string[]; family: string[] } {
	const list = listFor(request.description);
	const gender = genderOf(request.description);
	const ok = allowed(request.exclude ?? []);
	const givenOf = (entry: NameList) =>
		(gender ? entry[gender] : [...entry.feminine, ...entry.masculine]).filter(ok);
	if (list) {
		return {
			background: list.label,
			given: drawDistinct(givenOf(list), count, random),
			family: drawDistinct(list.family.filter(ok), count, random)
		};
	}
	const given: string[] = [];
	const family: string[] = [];
	for (let tries = 0; given.length < count && tries < count * 10; tries += 1) {
		const entry = NAME_LISTS[Math.floor(random() * NAME_LISTS.length)];
		const [first] = entry ? drawDistinct(givenOf(entry), 1, random) : [];
		const [last] = entry ? drawDistinct(entry.family.filter(ok), 1, random) : [];
		if (first && last && !given.includes(first) && !family.includes(last)) {
			given.push(first);
			family.push(last);
		}
	}
	return { background: null, given, family };
}

/**
 * The pool the build prompt offers (docs/dreams.md, "Names"): a few names
 * of each gender and a few family names from every background, for models
 * that cannot ask for names themselves. About 150 names.
 */
export function drawPool(random: Random, exclude: readonly string[] = []): string {
	const ok = allowed(exclude);
	return NAME_LISTS.map((list) => {
		const feminine = drawDistinct(list.feminine.filter(ok), 5, random);
		const masculine = drawDistinct(list.masculine.filter(ok), 5, random);
		const family = drawDistinct(list.family.filter(ok), 4, random);
		return `- ${list.label}: ${feminine.join(', ')} (feminine); ${masculine.join(', ')} (masculine); ${family.join(', ')} (family)`;
	}).join('\n');
}
