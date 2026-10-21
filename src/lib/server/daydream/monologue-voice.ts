import type { DaydreamVoice } from '$lib/daydream';

/**
 * The guide for the `monologue` voice ("A monologue"): one voice speaking its
 * mind about what the daydream is about, rather than a story told scene by
 * scene.
 *
 * Like the system voice (`impersonal-voice.ts`), it is not ordinary fiction,
 * which the model writes well from a sentence: told only to speak "a
 * monologue", a model writes a character's soliloquy in a room, with a plot.
 * So it gets a section of its own, placed after everything describing the
 * idea (`buildMessages` in `prompt.ts`).
 *
 * The voice stands in for the story's ideas — the kinks, tropes and sayings
 * of what the user is into — rather than being a character with a life of its
 * own, which is why what it says is so often a belief, a rule, a mantra or a
 * confession, and why who speaks is left to the setup: an unnamed
 * voice with the user listening unless the setup suggests a character, or
 * the user's own inner voice where the idea says so or reads better as their
 * thoughts — but not for an idea merely about what someone is, which a
 * model left freer took as reason enough.
 *
 * Its shape is the model's to choose. It used to be told every statement
 * went bold on a line of its own, kept to a sentence, with a paragraph of
 * the voice's words under it, and it wrote exactly that whatever the idea:
 * a rambling confession or a single repeated mantra suited that no better
 * than a list of rules. So the guide names no shape at all: even offered as
 * one way among others, described in full beside a few words for the rest,
 * it was still the one the model reached for first. "Statement" is not the
 * unit either, though statements often suit a monologue: "turning them into
 * statements" and "every statement says something new" assumed it. The page
 * still draws a paragraph all in bold larger (`standout` in
 * `daydream/passage-format.ts`) when the model writes one.
 *
 * There are no examples. There were four, in a tame and an adult set by
 * heat, each a bold statement and one paragraph on it, and an opening with
 * no length preference came back in exactly that shape: four statements,
 * a paragraph each, with the model's own reasoning planning from them.
 * Without them the shape is the idea's and the moment's to suggest.
 */

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

/** The section that tells the model how to write the monologue. */
export function monologueGuide(voice: DaydreamVoice, characterCount: number): string {
	return `# Writing a monologue
This is not a story told scene by scene. It is one voice speaking its mind about what this daydream is about — the kinks, tropes and dynamics in the idea below — taking their ideas, the things people into them say and the sayings that go with them, and making them its own.
- Shape it however best fits the idea and the moment. Say what the ideas mean to the voice, why they get to it, where they show up in its day.
- Ground it in everyday life where it fits: the voice catches the idea at work, on the bus, at a café table, in a meeting, in bed, so it reads as something lived with rather than recited.
- Everything it says is new. Never repeat or reword what it has already said; build on an idea, go deeper into it or turn it instead.
- Write in the first person, in the voice's own way of talking.
- Little or no scene: no description of a room, and of anyone only what the voice would mention in passing. There is no plot to move along.
- When the user writes, the voice takes it up: what they ask about, it dwells on; what they push for, it goes further into; what they want less of, it drops.
${monologueSpeaker(voice, characterCount)}`;
}
