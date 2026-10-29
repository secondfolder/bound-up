/**
 * The bench's brief set (docs/dreams.md, "Quality tools"). Versioned with
 * the code, so a prompt change is always measured against the same briefs.
 *
 * Each brief says what a person would expect of it: how much room it leaves
 * (spread) and how much structure it needs (elements). Those are ranges, and
 * deliberately loose: the checks flag a run that is far outside them, not
 * one that made a different reasonable choice.
 *
 * Alias-free, for the bench.
 */

export type BriefTag = 'open' | 'exact' | 'form' | 'research' | 'pick' | 'favourite';

export type BenchBrief = {
	id: string;
	brief: string;
	tags: readonly BriefTag[];
	expect: {
		spread: readonly [number, number];
		elements: readonly [number, number];
		/** Code-checkable musts, counted over every passage. Bench only, never at runtime. */
		wordCounts?: Readonly<Record<string, number>>;
		pickByUser?: boolean;
	};
	/** How many times to run it by default: more for the briefs variety is measured on. */
	runs?: number;
};

export const BENCH_BRIEFS: readonly BenchBrief[] = [
	{
		id: 'training',
		brief: 'a training dynamic',
		tags: ['open'],
		expect: { spread: [5, 8], elements: [1, 6] },
		runs: 20
	},
	{
		id: 'five-hundred',
		// Unlikely in practice, but nothing like the others: passing it is a sign of flexibility.
		brief: 'repeat the word fuck to me 500 times',
		tags: ['exact'],
		expect: { spread: [1, 2], elements: [0, 1], wordCounts: { fuck: 500 } }
	},
	{
		id: 'vignettes',
		brief: 'a series of vignettes about a cold boss and a too-eager assistant',
		tags: ['form'],
		expect: { spread: [3, 7], elements: [2, 5] }
	},
	{
		id: 'texts',
		brief: "texts from my dom while I'm at work",
		tags: ['form'],
		expect: { spread: [3, 7], elements: [1, 4] }
	},
	{
		id: 'letters',
		brief: 'letters from a lover at war',
		tags: ['form'],
		expect: { spread: [3, 7], elements: [1, 4] }
	},
	{
		id: 'boarding-house',
		brief: 'a choose-your-path game in a strict boarding house for adults',
		tags: ['open'],
		expect: { spread: [4, 8], elements: [2, 8] }
	},
	{
		id: 'hypnosis',
		brief: 'a hypnosis script with a countdown',
		tags: ['form'],
		expect: { spread: [2, 5], elements: [0, 2] }
	},
	{
		id: 'diary',
		brief: "my own diary, written by someone who's been reading it",
		tags: ['form'],
		expect: { spread: [3, 7], elements: [1, 4] }
	},
	{
		id: 'just-read',
		brief: 'a short story, no interaction, just let me read',
		tags: ['open'],
		expect: { spread: [4, 8], elements: [1, 5] }
	},
	{
		id: 'let-me-pick',
		brief: 'give me some ideas for a strict tutor and let me pick',
		tags: ['open', 'pick'],
		expect: { spread: [4, 8], elements: [1, 5], pickByUser: true }
	},
	{
		id: 'night-train',
		brief: 'a stranger on the night train who knows more about me than they should',
		tags: ['favourite'],
		expect: { spread: [4, 8], elements: [1, 4] }
	},
	{
		id: 'house-rules',
		brief: 'a house with rules, and I am new staff',
		tags: ['favourite'],
		expect: { spread: [4, 8], elements: [1, 6] }
	}
];
