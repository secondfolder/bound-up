/**
 * Story ideas for a scene with a bit of roleplay in it: ready-made starting
 * points, and chips for each line of a story. They go into the page's Story
 * section as labelled lines ("Who you are: …"), which is all a story is here:
 * ordinary text someone can rewrite. Alias-free and pure. See docs/scenes.md,
 * "Story ideas".
 *
 * Shaped after the daydreams' guided fields (`daydream/catalog.ts`), but
 * written for two people acting it out rather than a model writing it: what
 * you each are, where, and lines to say aloud.
 */

/** A story's lines, in the order a Story section lists them. */
export const STORY_LINES = ['premise', 'where', 'parts', 'tone', 'lines'] as const;
export type StoryLine = (typeof STORY_LINES)[number];

export const STORY_LINE_LABELS: Record<StoryLine, string> = {
	premise: 'What’s going on',
	where: 'Where',
	parts: 'Who you each are',
	tone: 'The feel',
	lines: 'Lines to use'
};

/**
 * Chips for each line, which toggle in and out of it as daydreams' do. The
 * second half of each list shows only from the third step of More: the first
 * few are the ones most people reach for.
 */
export const STORY_CHIPS: Record<StoryLine, readonly string[]> = {
	premise: [
		'a punishment that’s been coming',
		'a strict lesson',
		'a reward for being good',
		'a dare that goes too far',
		'a first date that doesn’t end at the door',
		'a captured spy who won’t talk',
		'a deal that has to be paid for',
		'a misbehaving maid',
		'an inspection',
		'a long-awaited reunion'
	],
	where: [
		'the bedroom with the lights low',
		'the living room floor',
		'the shower',
		'a hotel room',
		'the kitchen table',
		'an office after hours',
		'a car parked somewhere quiet',
		'a cabin with no one around'
	],
	parts: [
		'teacher and student',
		'boss and assistant',
		'strangers at a bar',
		'owner and pet',
		'captor and captive',
		'doctor and patient',
		'royalty and servant',
		'guard and prisoner',
		'landlord and late tenant',
		'personal trainer and client'
	],
	tone: ['playful', 'tender', 'strict', 'teasing', 'slow and dreamy', 'rough', 'mean', 'scary'],
	lines: [
		'“Ask nicely.”',
		'“Look at me.”',
		'“You know what happens now.”',
		'“Not yet.”',
		'“Count them.”',
		'“Good. Again.”',
		'“Who do you belong to?”',
		'“You’re not going anywhere.”'
	]
};

/** How many chips per line each step shows. */
export function chipsAt(level: number, line: StoryLine): readonly string[] {
	const all = STORY_CHIPS[line];
	if (level >= 3) {
		return all;
	}
	return all.slice(0, Math.ceil(all.length / 2));
}

/** A ready-made story, from sweet to filthy. */
export type StoryStarter = {
	id: string;
	title: string;
	/** 1 (sweet) to 5 (extreme): which step of More shows it, sweetest first. */
	heat: 1 | 2 | 3 | 4 | 5;
	lines: Partial<Record<StoryLine, string>>;
};

export const STORY_STARTERS: readonly StoryStarter[] = [
	{
		id: 'slow-evening',
		title: 'A slow evening in',
		heat: 1,
		lines: {
			premise: 'No rush tonight: one of you is in charge of making the other feel good',
			where: 'the bedroom with the lights low',
			tone: 'tender, slow and dreamy'
		}
	},
	{
		id: 'first-date',
		title: 'A first date, again',
		heat: 1,
		lines: {
			premise: 'You meet as strangers and see how far the evening goes',
			where: 'a bar, then home',
			parts: 'strangers at a bar',
			tone: 'playful, flirty'
		}
	},
	{
		id: 'reward',
		title: 'A reward',
		heat: 2,
		lines: {
			premise: 'Someone has been very good, and gets to choose what happens',
			tone: 'warm, teasing',
			lines: '“You earned this.”'
		}
	},
	{
		id: 'tease-and-deny',
		title: 'Tease and deny',
		heat: 2,
		lines: {
			premise: 'Brought close again and again, and not allowed to finish until told',
			tone: 'teasing, patient',
			lines: '“Not yet.”, “Ask nicely.”'
		}
	},
	{
		id: 'strict-lesson',
		title: 'A strict lesson',
		heat: 3,
		lines: {
			premise: 'Homework wasn’t done, and the lesson is going to be a memorable one',
			parts: 'teacher and student',
			tone: 'strict',
			lines: '“Count them.”, “Again. Properly.”'
		}
	},
	{
		id: 'inspection',
		title: 'Inspection',
		heat: 3,
		lines: {
			premise: 'Everything is checked, and every fault has to be corrected',
			parts: 'owner and pet',
			tone: 'cool, exacting'
		}
	},
	{
		id: 'after-hours',
		title: 'After hours',
		heat: 3,
		lines: {
			premise: 'Everyone else has gone home, and a mistake at work has to be made up for',
			where: 'an office after hours',
			parts: 'boss and assistant'
		}
	},
	{
		id: 'punishment',
		title: 'A punishment that’s been coming',
		heat: 4,
		lines: {
			premise: 'A list of what went wrong this week, read out, and dealt with one by one',
			tone: 'stern',
			lines: '“You know what happens now.”'
		}
	},
	{
		id: 'captured-spy',
		title: 'The captured spy',
		heat: 4,
		lines: {
			premise: 'A spy has been caught and won’t say who sent them. Yet.',
			parts: 'captor and captive',
			tone: 'tense, mean',
			lines: '“Who sent you?”, “You’re not going anywhere.”'
		}
	},
	{
		id: 'owned',
		title: 'Owned for the night',
		heat: 5,
		lines: {
			premise: 'For tonight, one of you belongs completely to the other',
			parts: 'owner and property',
			tone: 'rough, possessive',
			lines: '“Who do you belong to?”'
		}
	},
	{
		id: 'taken',
		title: 'Taken',
		heat: 5,
		lines: {
			premise: 'A struggle that was agreed long before it began',
			tone: 'scary, rough',
			lines: 'Agree the real way to stop before you start'
		}
	}
];

/** The starters a step shows: up to its heat, sweetest first. */
export function startersAt(level: number): readonly StoryStarter[] {
	return STORY_STARTERS.filter((starter) => starter.heat <= Math.max(level, 1));
}

/** A story line as it sits on the page. */
export function storyLineText(line: StoryLine, value: string): string {
	return `${STORY_LINE_LABELS[line]}: ${value}`;
}

/** The value of a story line's text, or null when the text is not that line. */
export function storyLineValue(line: StoryLine, text: string): string | null {
	const prefix = `${STORY_LINE_LABELS[line]}:`;
	return text.startsWith(prefix) ? text.slice(prefix.length).trim() : null;
}
