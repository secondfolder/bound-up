import type { Vibe } from '../settings';

/**
 * Word banks the generators draw from: a neutral one for unthemed
 * questions and one per vibe.
 *
 * Explicit adult content by design, like the rest of the app's kink prose.
 * Treat it as data.
 */

/** Words to memorise. Concrete nouns, because they are what span tests use. */
export const MEMORY_WORDS: Record<Vibe | 'neutral', readonly string[]> = {
	neutral: [
		'apple',
		'river',
		'candle',
		'mirror',
		'garden',
		'pencil',
		'window',
		'violin',
		'harbour',
		'ladder',
		'marble',
		'saddle',
		'blanket',
		'compass',
		'feather',
		'lantern'
	],
	gooner: [
		'stroke',
		'edge',
		'loop',
		'screen',
		'tabs',
		'pump',
		'drip',
		'trance',
		'hours',
		'mindless',
		'leak',
		'throb',
		'melt',
		'scroll',
		'pulse',
		'goon'
	],
	bambi: [
		'pink',
		'giggle',
		'lipgloss',
		'bubbles',
		'heels',
		'ponytail',
		'sparkle',
		'dolly',
		'lashes',
		'sleepy',
		'blank',
		'obey',
		'bimbo',
		'glitter',
		'deeper',
		'trance'
	],
	misogyny: [
		'kitchen',
		'apron',
		'sandwich',
		'skirt',
		'smile',
		'curtsy',
		'chores',
		'quiet',
		'pretty',
		'serve',
		'dishes',
		'laundry',
		'heels',
		'kneel',
		'tray',
		'obey'
	],
	denial: [
		'cage',
		'key',
		'edge',
		'ache',
		'throb',
		'beg',
		'leak',
		'tease',
		'wait',
		'needy',
		'ruined',
		'lock',
		'stroke',
		'whimper',
		'tremble',
		'denied'
	],
	feminisation: [
		'panties',
		'lace',
		'sissy',
		'blush',
		'stockings',
		'mascara',
		'curtsy',
		'frills',
		'satin',
		'skirt',
		'lipstick',
		'garter',
		'ribbon',
		'heels',
		'corset',
		'giggle'
	],
	degradation: [
		'toy',
		'drool',
		'slut',
		'kneel',
		'leash',
		'collar',
		'beg',
		'filth',
		'crawl',
		'gag',
		'whore',
		'hole',
		'mess',
		'spit',
		'bowl',
		'cage'
	]
};

/** Pairs that share one relation, for analogies. Each group is one relation. */
export type RelationGroup = { relation: string; pairs: readonly (readonly [string, string])[] };

export const NEUTRAL_RELATIONS: readonly RelationGroup[] = [
	{
		relation: 'opposite',
		pairs: [
			['hot', 'cold'],
			['early', 'late'],
			['full', 'empty'],
			['loud', 'quiet'],
			['open', 'closed'],
			['fast', 'slow'],
			['hard', 'soft'],
			['wet', 'dry']
		]
	},
	{
		relation: 'part of',
		pairs: [
			['petal', 'flower'],
			['page', 'book'],
			['wheel', 'car'],
			['branch', 'tree'],
			['finger', 'hand'],
			['brick', 'wall'],
			['key', 'piano'],
			['string', 'guitar']
		]
	},
	{
		relation: 'young of',
		pairs: [
			['puppy', 'dog'],
			['kitten', 'cat'],
			['calf', 'cow'],
			['foal', 'horse'],
			['cub', 'bear'],
			['lamb', 'sheep'],
			['tadpole', 'frog'],
			['gosling', 'goose']
		]
	},
	{
		relation: 'degree of',
		pairs: [
			['warm', 'scorching'],
			['damp', 'soaked'],
			['tired', 'exhausted'],
			['pleased', 'ecstatic'],
			['chilly', 'freezing'],
			['hungry', 'starving'],
			['dim', 'pitch-black'],
			['annoyed', 'furious']
		]
	},
	{
		relation: 'tool of',
		pairs: [
			['brush', 'painter'],
			['scalpel', 'surgeon'],
			['baton', 'conductor'],
			['chisel', 'sculptor'],
			['gavel', 'judge'],
			['trowel', 'mason'],
			['needle', 'tailor'],
			['whisk', 'baker']
		]
	}
];

/** One themed relation per vibe, mixed in with the neutral ones. */
export const VIBE_RELATIONS: Record<Vibe, RelationGroup> = {
	gooner: {
		relation: 'holds',
		pairs: [
			['folder', 'videos'],
			['playlist', 'clips'],
			['album', 'photos'],
			['inbox', 'messages'],
			['browser', 'tabs'],
			['drive', 'files'],
			['queue', 'loops'],
			['bookmark bar', 'links']
		]
	},
	bambi: {
		relation: 'applied to',
		pairs: [
			['lipgloss', 'lips'],
			['mascara', 'lashes'],
			['polish', 'nails'],
			['blush', 'cheeks'],
			['bleach', 'hair'],
			['glitter', 'eyelids'],
			['lotion', 'legs'],
			['perfume', 'neck']
		]
	},
	misogyny: {
		relation: 'chore for',
		pairs: [
			['sponge', 'dishes'],
			['iron', 'shirts'],
			['broom', 'floor'],
			['duster', 'shelves'],
			['oven', 'dinner'],
			['basket', 'laundry'],
			['tray', 'drinks'],
			['mop', 'kitchen']
		]
	},
	denial: {
		relation: 'opens',
		pairs: [
			['key', 'cage'],
			['code', 'safe'],
			['password', 'account'],
			['combination', 'padlock'],
			['ticket', 'gate'],
			['token', 'turnstile'],
			['keycard', 'door'],
			['permission', 'release']
		]
	},
	feminisation: {
		relation: 'worn on',
		pairs: [
			['stockings', 'legs'],
			['panties', 'hips'],
			['lipstick', 'lips'],
			['bra', 'chest'],
			['heels', 'feet'],
			['choker', 'neck'],
			['bow', 'hair'],
			['garter', 'thigh']
		]
	},
	degradation: {
		relation: 'used for',
		pairs: [
			['leash', 'leading'],
			['gag', 'silencing'],
			['collar', 'owning'],
			['bowl', 'feeding'],
			['crate', 'keeping'],
			['paddle', 'punishing'],
			['cuffs', 'restraining'],
			['blindfold', 'blinding']
		]
	}
};

/** A word, its synonym, and three near-miss distractors. */
export type VocabularyEntry = readonly [word: string, synonym: string, ...distractors: string[]];

/** Neutral vocabulary, from easiest (index 0) to hardest. */
export const NEUTRAL_VOCABULARY: readonly (readonly VocabularyEntry[])[] = [
	[
		['big', 'large', 'tall', 'heavy', 'wide'],
		['happy', 'glad', 'calm', 'proud', 'lucky'],
		['quick', 'fast', 'short', 'sharp', 'loud'],
		['begin', 'start', 'build', 'try', 'open']
	],
	[
		['ancient', 'old', 'famous', 'broken', 'rare'],
		['brave', 'bold', 'strong', 'angry', 'loyal'],
		['vacant', 'empty', 'quiet', 'dark', 'lost'],
		['fragile', 'delicate', 'small', 'cheap', 'clear']
	],
	[
		['candid', 'frank', 'sweet', 'shy', 'hidden'],
		['diligent', 'hardworking', 'clever', 'polite', 'quiet'],
		['frugal', 'thrifty', 'poor', 'mean', 'simple'],
		['lethargic', 'sluggish', 'sad', 'sick', 'bored']
	],
	[
		['loquacious', 'talkative', 'clever', 'cheerful', 'liquid'],
		['obstinate', 'stubborn', 'obvious', 'rude', 'loyal'],
		['ephemeral', 'fleeting', 'ethereal', 'spooky', 'endless'],
		['pernicious', 'harmful', 'fussy', 'prickly', 'secret']
	],
	[
		['obsequious', 'fawning', 'obvious', 'obscure', 'stubborn'],
		['recalcitrant', 'defiant', 'repeated', 'sorry', 'cold'],
		['sagacious', 'wise', 'spicy', 'saggy', 'brave'],
		['perfunctory', 'cursory', 'perfect', 'fragrant', 'official']
	]
];

/**
 * Clever words about not being clever. Mixed in at every difficulty, so the
 * hard ones are the ones that sting.
 */
export const VIBE_VOCABULARY: Record<Vibe, readonly VocabularyEntry[]> = {
	gooner: [
		['compulsive', 'uncontrollable', 'compassionate', 'composed', 'complete'],
		['mesmerised', 'entranced', 'memorised', 'measured', 'mercerised'],
		['enthralled', 'captivated', 'enrolled', 'enraged', 'entitled'],
		['dissolute', 'debauched', 'dissolved', 'resolute', 'distant']
	],
	bambi: [
		['vapid', 'empty-headed', 'vivid', 'vain', 'valid'],
		['docile', 'obedient', 'drowsy', 'delicate', 'dull'],
		['vacuous', 'blank', 'vacation', 'vicious', 'vast'],
		['malleable', 'easily shaped', 'male', 'mellow', 'bendy-legged']
	],
	misogyny: [
		['subservient', 'obedient', 'submerged', 'secret', 'surviving'],
		['frivolous', 'silly', 'frightened', 'friendly', 'frilly'],
		['decorative', 'ornamental', 'decent', 'delicious', 'dedicated'],
		['demure', 'modest', 'mature', 'demanding', 'murky']
	],
	denial: [
		['abstinent', 'restrained', 'absent', 'abrupt', 'abstract'],
		['frustrated', 'thwarted', 'frosted', 'fragrant', 'fruitful'],
		['insatiable', 'unquenchable', 'insane', 'unstable', 'inside'],
		['chaste', 'pure', 'chased', 'cheap', 'chastised']
	],
	feminisation: [
		['coquettish', 'flirtatious', 'cocky', 'crooked', 'coated'],
		['effeminate', 'girlish', 'effective', 'eminent', 'effortless'],
		['dainty', 'delicate', 'daily', 'dizzy', 'dirty'],
		['comely', 'pretty', 'comedic', 'comfy', 'coming']
	],
	degradation: [
		['abject', 'wretched', 'object', 'abrupt', 'absent'],
		['servile', 'slavish', 'sterile', 'senile', 'service'],
		['contemptible', 'despicable', 'contented', 'comfortable', 'contained'],
		['debased', 'degraded', 'debated', 'based', 'debited']
	]
};

/** Groups of four, for odd-one-out: three from one category and one from a near one. */
export const CATEGORIES: readonly { name: string; items: readonly string[] }[] = [
	{ name: 'fruit', items: ['apple', 'pear', 'plum', 'cherry', 'mango', 'peach'] },
	{ name: 'vegetable', items: ['carrot', 'leek', 'potato', 'onion', 'cabbage', 'turnip'] },
	{ name: 'mammal', items: ['whale', 'bat', 'otter', 'horse', 'mouse', 'goat'] },
	{ name: 'bird', items: ['robin', 'eagle', 'penguin', 'owl', 'swan', 'parrot'] },
	{ name: 'metal', items: ['iron', 'copper', 'silver', 'tin', 'zinc', 'nickel'] },
	{ name: 'gemstone', items: ['ruby', 'emerald', 'sapphire', 'opal', 'topaz', 'garnet'] },
	{ name: 'string instrument', items: ['violin', 'cello', 'harp', 'guitar', 'banjo', 'viola'] },
	{ name: 'wind instrument', items: ['flute', 'oboe', 'trumpet', 'clarinet', 'tuba', 'bassoon'] }
];

/** Which category is close enough to make a hard odd-one-out. */
export const NEAR_CATEGORY: Record<string, string> = {
	fruit: 'vegetable',
	vegetable: 'fruit',
	mammal: 'bird',
	bird: 'mammal',
	metal: 'gemstone',
	gemstone: 'metal',
	'string instrument': 'wind instrument',
	'wind instrument': 'string instrument'
};

/** Terms for syllogisms: nonsense when neutral, so knowledge cannot help. */
export const SYLLOGISM_TERMS: Record<Vibe | 'neutral', readonly string[]> = {
	neutral: ['blickets', 'wugs', 'daxes', 'zorbs', 'plimps', 'feps', 'toves', 'grups'],
	gooner: ['gooners', 'strokers', 'edgers', 'addicts', 'screen zombies', 'pumpers', 'loopers'],
	bambi: [
		'good girls',
		'bimbo dolls',
		'airheads',
		'sleepy girls',
		'dolls',
		'giggly girls',
		'empty heads'
	],
	misogyny: [
		'women',
		'housewives',
		'pretty things',
		'good wives',
		'girls',
		'kitchen helpers',
		'airheads'
	],
	denial: [
		'locked boys',
		'needy things',
		'beggars',
		'edgers',
		'good boys',
		'leakers',
		'keyholders'
	],
	feminisation: [
		'sissies',
		'girls',
		'pretty things',
		'maids',
		'dolls',
		'panty-wearers',
		'blushers'
	],
	degradation: ['toys', 'sluts', 'pets', 'holes', 'drooling things', 'whores', 'useless things']
};

/**
 * Something a word problem counts, as the phrases a template fits together.
 * Each is a plain thing from the vibe's world with verbs that suit it, so a
 * sentence reads as an ordinary story rather than a pile of props: "Jay has
 * 18 tabs open, opens 9 more, then closes 5" rather than "the sissy has 18
 * lipsticks". Suggestive at most, never silly.
 */
export type Countable = {
	/** "has 18 tabs open" */
	have: (n: number) => string;
	/** "opens 9 more" */
	add: (n: number) => string;
	/** "closes 5", or "closes 30% of them" when given a share. */
	remove: (n: number | string) => string;
	/** "opens 6 tabs a day" */
	perDay: (n: number) => string;
	/** A plural noun for a template that groups them: "tabs". */
	noun: string;
};

/** Who a word problem is about, and what they are counting. */
export const WORD_PROBLEM_CAST: Record<
	Vibe | 'neutral',
	{ subject: string; possessive: string; items: readonly Countable[] }
> = {
	neutral: {
		subject: 'Alex',
		possessive: 'their',
		items: [
			{
				have: (n) => `has ${n} apples`,
				add: (n) => `buys ${n} more`,
				remove: (n) => `gives away ${n}`,
				perDay: (n) => `picks ${n} apples a day`,
				noun: 'apples'
			},
			{
				have: (n) => `has ${n} books`,
				add: (n) => `is given ${n} more`,
				remove: (n) => `lends out ${n}`,
				perDay: (n) => `shelves ${n} books a day`,
				noun: 'books'
			},
			{
				have: (n) => `has ${n} stamps`,
				add: (n) => `collects ${n} more`,
				remove: (n) => `swaps away ${n}`,
				perDay: (n) => `sorts ${n} stamps a day`,
				noun: 'stamps'
			}
		]
	},
	gooner: {
		subject: 'Jay',
		possessive: 'his',
		items: [
			{
				have: (n) => `has ${n} tabs open`,
				add: (n) => `opens ${n} more`,
				remove: (n) => `closes ${n}`,
				perDay: (n) => `opens ${n} new tabs a day`,
				noun: 'tabs'
			},
			{
				have: (n) => `has ${n} saved videos`,
				add: (n) => `saves ${n} more`,
				remove: (n) => `deletes ${n}`,
				perDay: (n) => `saves ${n} videos a day`,
				noun: 'videos'
			}
		]
	},
	bambi: {
		subject: 'Bambi',
		possessive: 'her',
		items: [
			{
				have: (n) => `has ${n} selfies on her phone`,
				add: (n) => `takes ${n} more`,
				remove: (n) => `deletes ${n}`,
				perDay: (n) => `takes ${n} selfies a day`,
				noun: 'selfies'
			},
			{
				have: (n) => `has ${n} dresses`,
				add: (n) => `buys ${n} more`,
				remove: (n) => `gives away ${n}`,
				perDay: (n) => `tries on ${n} dresses a day`,
				noun: 'dresses'
			}
		]
	},
	misogyny: {
		subject: 'Emma',
		possessive: 'her',
		items: [
			{
				have: (n) => `has ${n} shirts to iron`,
				add: (n) => `is handed ${n} more`,
				remove: (n) => `irons ${n}`,
				perDay: (n) => `irons ${n} shirts a day`,
				noun: 'shirts'
			},
			{
				have: (n) => `has ${n} guests to serve`,
				add: (n) => `is told ${n} more are coming`,
				remove: (n) => `serves ${n}`,
				perDay: (n) => `serves ${n} guests a day`,
				noun: 'guests'
			}
		]
	},
	denial: {
		subject: 'Mark',
		possessive: 'his',
		items: [
			{
				have: (n) => `has ${n} unread messages from his keyholder`,
				add: (n) => `gets ${n} more`,
				remove: (n) => `reads ${n}`,
				perDay: (n) => `gets ${n} messages from his keyholder a day`,
				noun: 'messages'
			},
			{
				have: (n) => `has ${n} tasks from his keyholder`,
				add: (n) => `is set ${n} more`,
				remove: (n) => `finishes ${n}`,
				perDay: (n) => `is set ${n} tasks a day`,
				noun: 'tasks'
			}
		]
	},
	feminisation: {
		subject: 'Chloe',
		possessive: 'her',
		items: [
			{
				have: (n) => `has ${n} pairs of stockings`,
				add: (n) => `buys ${n} more`,
				remove: (n) => `ladders ${n}`,
				perDay: (n) => `orders ${n} pairs of stockings a day`,
				noun: 'pairs of stockings'
			},
			{
				have: (n) => `has ${n} dresses in her wardrobe`,
				add: (n) => `orders ${n} more`,
				remove: (n) => `sends back ${n}`,
				perDay: (n) => `tries on ${n} dresses a day`,
				noun: 'dresses'
			}
		]
	},
	degradation: {
		subject: 'Kit',
		possessive: 'their',
		items: [
			{
				have: (n) => `has ${n} chores to do`,
				add: (n) => `is given ${n} more`,
				remove: (n) => `finishes ${n}`,
				perDay: (n) => `is given ${n} chores a day`,
				noun: 'chores'
			},
			{
				have: (n) => `has ${n} lines to write`,
				add: (n) => `is given ${n} more`,
				remove: (n) => `writes ${n}`,
				perDay: (n) => `is set ${n} lines a day`,
				noun: 'lines'
			}
		]
	}
};
