import { multiChoices } from './choices';
import type { Generator } from './types';

/**
 * Tick every word that means the same: after openpsychometrics' Full Scale
 * IQ Test vocabulary section. A word, then its synonyms mixed with words that
 * do not mean it — an opposite, something unrelated — and made-up words that
 * sound as if they might. Partly credited (see `credit`), so ticking a word
 * that is not known costs what a right one gains: it pays to leave it.
 *
 * Each entry's synonyms run from the everyday to the obscure, and harder
 * questions reach further down the list. Every made-up word was checked
 * against a dictionary when written, so none is secretly real.
 */
type Entry = {
	word: string;
	/** Commonest first. */
	synonyms: readonly string[];
	/** Opposites and unrelated real words. */
	unrelated: readonly string[];
	/** Not words at all. */
	madeUp: readonly string[];
};

const ENTRIES: readonly Entry[] = [
	{
		word: 'big',
		synonyms: ['large', 'huge', 'enormous', 'vast', 'immense'],
		unrelated: ['small', 'tiny', 'bracket'],
		madeUp: ['flombous', 'grastic']
	},
	{
		word: 'fast',
		synonyms: ['quick', 'rapid', 'speedy', 'swift', 'fleet'],
		unrelated: ['slow', 'sluggish', 'tender'],
		madeUp: ['brindous', 'trambous']
	},
	{
		word: 'angry',
		synonyms: ['furious', 'cross', 'irate', 'livid', 'wrathful'],
		unrelated: ['calm', 'serene', 'sudden'],
		madeUp: ['vexilous', 'mardent']
	},
	{
		word: 'tired',
		synonyms: ['weary', 'exhausted', 'drained', 'fatigued', 'jaded'],
		unrelated: ['alert', 'lively', 'wooden'],
		madeUp: ['drenulous', 'sopplish']
	},
	{
		word: 'brave',
		synonyms: ['bold', 'fearless', 'plucky', 'valiant', 'intrepid'],
		unrelated: ['timid', 'cowardly', 'narrow'],
		madeUp: ['gallistic', 'fervish']
	},
	{
		word: 'clever',
		synonyms: ['smart', 'bright', 'shrewd', 'astute', 'sapient'],
		unrelated: ['dim', 'obtuse', 'heavy'],
		madeUp: ['brillish', 'vorbic']
	},
	{
		word: 'rich',
		synonyms: ['wealthy', 'affluent', 'prosperous', 'moneyed', 'opulent'],
		unrelated: ['poor', 'needy', 'rugged'],
		madeUp: ['flussant', 'aurine']
	},
	{
		word: 'talkative',
		synonyms: ['chatty', 'gabby', 'garrulous', 'loquacious', 'voluble'],
		unrelated: ['quiet', 'taciturn', 'brittle'],
		madeUp: ['verbulous', 'tellious']
	},
	{
		word: 'hungry',
		synonyms: ['starving', 'famished', 'ravenous', 'peckish', 'esurient'],
		unrelated: ['full', 'sated', 'bitter'],
		madeUp: ['gonderous', 'yearnant']
	},
	{
		word: 'secret',
		synonyms: ['hidden', 'covert', 'furtive', 'clandestine', 'surreptitious'],
		unrelated: ['open', 'overt', 'lukewarm'],
		madeUp: ['hushant', 'privulous']
	},
	{
		word: 'stubborn',
		synonyms: ['obstinate', 'headstrong', 'pigheaded', 'mulish', 'intransigent'],
		unrelated: ['pliant', 'docile', 'glassy'],
		madeUp: ['stoddish', 'rigulent']
	},
	{
		word: 'praise',
		synonyms: ['compliment', 'commend', 'acclaim', 'laud', 'extol'],
		unrelated: ['criticise', 'condemn', 'gather'],
		madeUp: ['plaudiate', 'clamary']
	},
	{
		word: 'foolish',
		synonyms: ['silly', 'daft', 'absurd', 'inane', 'fatuous'],
		unrelated: ['wise', 'sensible', 'pointed'],
		madeUp: ['dimsical', 'bumbrous']
	},
	{
		word: 'calm',
		synonyms: ['peaceful', 'tranquil', 'serene', 'placid', 'composed'],
		unrelated: ['agitated', 'frantic', 'woollen'],
		madeUp: ['placent', 'quorrant']
	},
	{
		word: 'shy',
		synonyms: ['timid', 'bashful', 'coy', 'retiring', 'diffident'],
		unrelated: ['bold', 'brash', 'velvet'],
		madeUp: ['fendrous', 'skelvish']
	}
];

/** How many synonyms each difficulty asks for: more, and so rarer ones, as it climbs. */
const SYNONYM_COUNTS = [3, 3, 4, 5, 5] as const;

export const synonyms: Generator = (rng, difficulty, _context, id) => {
	const entry = rng.pick(ENTRIES);
	const count = SYNONYM_COUNTS[difficulty - 1] ?? 3;
	return {
		id,
		kind: 'synonyms',
		difficulty,
		prompt: `Tick every word that means the same as “${entry.word}”. Leave any you do not know.`,
		display: { type: 'none' },
		format: 'multi',
		...multiChoices(
			rng,
			entry.synonyms.slice(0, count).map((label) => ({ label })),
			[...entry.unrelated, ...entry.madeUp].map((label) => ({ label }))
		)
	};
};

/** Every entry, for the tests. */
export const SYNONYM_ENTRIES = ENTRIES;
