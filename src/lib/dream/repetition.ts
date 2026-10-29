/**
 * Repetition within a story, and the tells of model-written prose.
 *
 * `repeatedPhrases` feeds the passage prompt's "don't reuse" line: the
 * samplers that stop repetition properly (Antislop, DRY) need logit access
 * the API does not give, so code finds what is repeating and says so
 * (docs/dreams.md, "Playing"). The bench uses the same function and
 * `overusedNames` / `clicheCount` in its checks.
 *
 * Pure and alias-free.
 */

const WORD = /[a-z']+/g;
/** A phrase of only these words is not worth asking the model to avoid. */
const FILLER = new Set(
	'a an and are as at be but by for from had has have he her his i in is it its me my of on or she that the their them they this to was were with you your'.split(
		' '
	)
);

function words(text: string): string[] {
	return text.toLowerCase().match(WORD) ?? [];
}

export type RepeatedPhrase = { phrase: string; count: number };

/**
 * Three- and four-word phrases used more than once across these passages,
 * most-repeated first. A longer phrase hides the shorter ones inside it.
 */
export function repeatedPhrases(passages: readonly string[], limit = 8): RepeatedPhrase[] {
	const counts = new Map<string, number>();
	for (const passage of passages) {
		const list = words(passage);
		for (const size of [4, 3]) {
			for (let at = 0; at + size <= list.length; at += 1) {
				const gram = list.slice(at, at + size);
				if (gram.every((word) => FILLER.has(word))) {
					continue;
				}
				const phrase = gram.join(' ');
				counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
			}
		}
	}
	const repeated = [...counts]
		.filter(([, count]) => count > 1)
		.sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
	const kept: RepeatedPhrase[] = [];
	for (const [phrase, count] of repeated) {
		if (kept.some((longer) => longer.phrase.includes(phrase))) {
			continue;
		}
		kept.push({ phrase, count });
		if (kept.length >= limit) {
			break;
		}
	}
	return kept;
}

/**
 * Names models reach for regardless of the story (a 2026 study of 20,000
 * generated stories found a handful in most of them: arXiv 2605.26492). Grow
 * it as the bench finds more.
 */
export const OVERUSED_NAMES: readonly string[] = [
	'Elara',
	'Elias',
	'Mara',
	'Vesper',
	'Lyra',
	'Kai',
	'Seraphina',
	'Aria',
	'Marcus Chen',
	'Elara Voss',
	'Silas',
	'Isolde',
	'Liora',
	'Thorne'
];

/** Phrases that mark prose as machine-written. Grow it as the bench finds more. */
export const CLICHES: readonly string[] = [
	'the air was thick',
	'a shiver ran down',
	'sent shivers down',
	'barely above a whisper',
	'a testament to',
	'the weight of',
	'eyes that held',
	'a dance of',
	'electric anticipation',
	'her breath hitched',
	'his breath hitched',
	'something shifted',
	'you can’t help but',
	"you can't help but"
];

/** How many times any of these appear, case-insensitively. */
export function countOccurrences(text: string, needles: readonly string[]): Record<string, number> {
	const lower = text.toLowerCase();
	const found: Record<string, number> = {};
	for (const needle of needles) {
		const target = needle.toLowerCase();
		let count = 0;
		let at = lower.indexOf(target);
		while (at !== -1) {
			count += 1;
			at = lower.indexOf(target, at + target.length);
		}
		if (count) {
			found[needle] = count;
		}
	}
	return found;
}
