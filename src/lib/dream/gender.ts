/**
 * Which way a description of someone leans, for drawing their name
 * (docs/dreams.md, "Names") and matching them a voice ("Read aloud").
 *
 * Pure and alias-free.
 */

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
