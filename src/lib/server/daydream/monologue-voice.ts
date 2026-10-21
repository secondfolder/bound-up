import type { DaydreamVoice, DialValue } from '$lib/daydream';

/**
 * The guide for the `monologue` voice ("A monologue"): one voice speaking its
 * mind about what the daydream is about, statement after statement, rather
 * than a story told scene by scene.
 *
 * Like the system voice (`impersonal-voice.ts`), it is not ordinary fiction,
 * which the model writes well from a sentence: told only to speak "a
 * monologue", a model writes a character's soliloquy in a room, with a plot.
 * So it gets a section of its own, with examples of the form, placed after
 * everything describing the idea (`buildMessages` in `prompt.ts`).
 *
 * The voice stands in for the story's ideas — the kinks, tropes and sayings
 * of what the user is into — rather than being a character with a life of its
 * own, which is why it speaks in short statements, each with a little in its
 * own words after it, and why who speaks is left to the setup: an unnamed
 * voice with the user listening unless the setup suggests a character, or
 * the user's own inner voice where the idea says so or reads better as their
 * thoughts — but not for an idea merely about what someone is, which a
 * model left freer took as reason enough.
 *
 * Each statement is bold on a line of its own, which the page draws larger
 * (`standout` in `daydream/passage-format.ts`), so the statements read as
 * what the passage is built on.
 *
 * The examples show the form, not the content, and are deliberately broad,
 * since examples steer content too. One in each set is the longer, inner
 * voice kind, caught in an ordinary day, because shown only short ones a
 * model never writes it, and it is what a monologue of the user's own
 * thoughts reads best as. Two sets, picked by heat like the
 * system's: a tame daydream shown sex would drift towards it, and an explicit
 * one shown only rules and praise would stay timid.
 */

const TAME_EXAMPLES = [
	`**Rules are a kindness.**

People think they're a cage. They're not. When someone else sets the rules, I don't have to carry every little decision around all day. I just have to be good.`,
	`**Asking permission is the point.**

Not because I can't decide for myself. Because I like the moment where I ask, and wait, and the answer isn't mine to give.`,
	`**Praise lands harder when it's earned.**

One quiet *good* at the end of a long day does more for me than a hundred easy ones ever could.`,
	`**Being told what to do is restful.**

Even the little things. What to wear, when to go to bed. I'll be halfway through some ordinary afternoon, standing in the queue at the bank, and remember I don't have to decide any of it tonight, and the whole day loosens.`
];

const ADULT_EXAMPLES = [
	`**Being owned is a relief.**

I mean it. Someone else decides when, and how, and how often, and all I have to do is be ready. Ready is easy. Ready is the best I've ever felt.`,
	`**My body isn't mine on the nights I'm theirs.**

They touch what they like and take what they like. I don't get a vote, and I've never once wanted one.`,
	`**Begging is foreplay.**

Not the polite kind. The kind where you've said *please* so many times it stops being a word, and you'd say anything at all to be let finish.`,
	`**I was made to be used.**

I think it on the train, in the queue for coffee, in the middle of a meeting where everyone thinks I'm taking notes. Under all of it there's the same quiet thought, looping: someone should be using me right now. My mouth, my body, my time. It isn't a mood. It's just what I'm for, and the rest of the day is waiting.`
];

/** Steamy and up: sex happens on the page, so the examples may show it. */
const ADULT_FROM: DialValue = 3;

export function monologueExamples(heat: DialValue | null): readonly string[] {
	return heat !== null && heat >= ADULT_FROM ? ADULT_EXAMPLES : TAME_EXAMPLES;
}

/** Who speaks with no character set: an unnamed voice, or the user's own inner voice where it fits. */
const UNNAMED_SPEAKER = {
	listening:
		"No speaker is set. Unless the idea suggests one, speak as an unnamed voice with the user listening. Where the idea says so, or would work better as the user's own thoughts, the voice is instead their own inner voice, in the first person as them — but an idea about what someone is or what people believe is no reason on its own.",
	overheard: 'No speaker is set. Unless the idea suggests one, speak as an unnamed voice.'
} as const;

/** Who speaks with characters set: one of them, or the user's own inner voice where it fits. */
const CHARACTER_SPEAKER = {
	listening:
		"The speaker is one of the characters in it, below — the first, unless the idea says otherwise — or, where the idea says so or would work better as their own thoughts, the user's own inner voice; anyone else is someone the voice talks about or to.",
	overheard:
		'The speaker is one of the characters in it, below — the first, unless the idea says otherwise; anyone else is someone the voice talks about or to.'
} as const;

/** Who speaks, and where the user stands: left to the setup, with a default for when it says nothing. */
export function monologueSpeaker(voice: DaydreamVoice, characterCount: number): string {
	// Someone who only overhears has no inner voice in it to speak as.
	const absent = voice.stance === 'absent';
	const who = characterCount === 0 ? UNNAMED_SPEAKER : CHARACTER_SPEAKER;
	const user = absent
		? 'The user is not spoken to: they overhear it.'
		: // Their name, for a persona, is with the rest of this daydream (`describeNarrator`).
			'Speak to the user as "you" where it fits. As their own inner voice it says what they think, as "I", and never speaks to them as "you".';
	return `${absent ? who.overheard : who.listening} Whoever it is stands in for the story's ideas rather than being a character with a life of their own: give them a way of talking, and keep their own history to a touch. ${user}`;
}

/** The section that tells the model how to write the monologue, with examples of the form. */
export function monologueGuide(
	voice: DaydreamVoice,
	characterCount: number,
	heat: DialValue | null
): string {
	const examples = monologueExamples(heat)
		.map((example) => `"""\n${example}\n"""`)
		.join('\n');
	return `# Writing a monologue
This is not a story told scene by scene. It is one voice speaking its mind about what this daydream is about — the kinks, tropes and dynamics in the idea below — taking their ideas, the things people into them say and the sayings that go with them, and turning them into statements.
- Write short paragraphs, as many as the moment has in it and the length below leans towards. Most open with a statement on a line of its own, in bold — a belief, a rule, a mantra, a confession, something someone into this would say — followed by the voice's own words on it: a few sentences, or a longer run when the idea has more in it — what it means to them, why it gets to them, where it shows up in their day.
- Ground it in everyday life where it fits: the voice catches the idea at work, on the bus, at a café table, in a meeting, in bed, so it reads as something lived with rather than recited.
- Keep each statement short enough to land: a sentence, rarely two.
- Every statement says something new. Never repeat one or reword one already made; build on an idea, go deeper into it or turn it instead.
- Write in the first person, in the voice's own way of talking.
- Little or no scene: no description of a room, and of anyone only what the voice would mention in passing. There is no plot to move along.
- When the user writes, the voice takes it up: what they ask about, it dwells on; what they push for, it goes further into; what they want less of, it drops.
${monologueSpeaker(voice, characterCount)}
These examples show the form only. Do not reuse any of their statements or sentences: take every idea from the one below, and follow its heat and kink, not theirs.
${examples}`;
}
