import { multiChoices } from './choices';
import type { Generator } from './types';

/**
 * Tick every set of letters that unscrambles into a word, against the
 * clock for a sub (see `timers.ts`): after openpsychometrics' Full Scale IQ
 * Test anagrams section, at a size that suits one question of many (theirs
 * is eighteen sets in a minute). Partly credited, so a guess costs what a find gains.
 *
 * The words are everyday ones, scrambled afresh each time and never left in
 * order. The sets that are not words were drawn at random and kept only if
 * no dictionary word uses exactly their letters; none has an S, which a
 * dictionary's missing plurals let through ("OSMP" is "mops"), or both an E
 * and a D, which its missing past tenses did ("ADMPE" is "amped").
 */
const WORDS: Record<3 | 4 | 5, readonly string[]> = {
	3: [
		'cat',
		'dog',
		'sun',
		'hat',
		'cup',
		'pen',
		'map',
		'bed',
		'ink',
		'jar',
		'key',
		'leg',
		'net',
		'owl',
		'pig',
		'rug',
		'toy',
		'van',
		'web',
		'fox',
		'bus',
		'cow'
	],
	4: [
		'bird',
		'fish',
		'lamp',
		'rain',
		'ship',
		'milk',
		'frog',
		'coat',
		'desk',
		'gold',
		'hand',
		'king',
		'leaf',
		'nest',
		'rope',
		'sand',
		'wolf',
		'cake',
		'drum'
	],
	5: [
		'house',
		'plant',
		'chair',
		'bread',
		'stone',
		'cloud',
		'dance',
		'grape',
		'horse',
		'light',
		'music',
		'ocean',
		'piano',
		'smile',
		'train',
		'water',
		'zebra',
		'tiger'
	]
};

const NOT_WORDS: Record<3 | 4 | 5, readonly string[]> = {
	3: [
		'BAK',
		'UNC',
		'CNE',
		'ILC',
		'GOK',
		'LWU',
		'IHW',
		'OFC',
		'ONV',
		'VEC',
		'AFV',
		'GFE',
		'WLU',
		'KVE',
		'BAF',
		'WEV',
		'CAF',
		'OVF',
		'TIV',
		'KDU',
		'IRH',
		'FWI',
		'MOF'
	],
	4: [
		'GREF',
		'ABVD',
		'PRWE',
		'BCPU',
		'PGAF',
		'GHEM',
		'BWEF',
		'GVCU',
		'BKEG',
		'CUMV',
		'UWMT',
		'AVLM',
		'VEFR',
		'RPLA',
		'UWPG',
		'PIFC',
		'GPUR',
		'GOCR',
		'LICW',
		'CWOB',
		'CVOL',
		'CDIM',
		'RHFO'
	],
	5: [
		'ANIHW',
		'HOGIR',
		'TAKDM',
		'TNFUE',
		'KGETU',
		'WFEAP',
		'KEWAV',
		'FUOBP',
		'WHEOB',
		'BOGRV',
		'KWPAN',
		'ELWRI',
		'ODIWM',
		'HLACB',
		'HKWIM',
		'HMAOF',
		'FTPAK',
		'IUTWB',
		'OTDFK',
		'IMHDK',
		'KLNWA'
	]
};

/** Letters per set and sets per question, by difficulty. */
const SHAPES = [
	{ length: 3, words: 3, others: 3 },
	{ length: 4, words: 3, others: 4 },
	{ length: 4, words: 4, others: 4 },
	{ length: 5, words: 4, others: 5 },
	{ length: 5, words: 5, others: 5 }
] as const;

export const anagrams: Generator = (rng, difficulty, _context, id) => {
	const shape = SHAPES[difficulty - 1] ?? SHAPES[0];
	const scramble = (word: string) => {
		for (;;) {
			const letters = rng.shuffle([...word]).join('');
			if (letters !== word) {
				return letters.toUpperCase();
			}
		}
	};
	return {
		id,
		kind: 'anagrams',
		difficulty,
		prompt: 'Tick every set of letters that can be rearranged into an English word.',
		display: { type: 'none' },
		format: 'multi',
		...multiChoices(
			rng,
			rng.sample(WORDS[shape.length], shape.words).map((word) => ({ label: scramble(word) })),
			rng.sample(NOT_WORDS[shape.length], shape.others).map((label) => ({ label }))
		)
	};
};

/** The lists, for the tests. */
export const ANAGRAM_WORDS = WORDS;
export const ANAGRAM_NOT_WORDS = NOT_WORDS;
