import type { DaydreamVoice, DialValue } from '$lib/daydream';

/**
 * How a passage is written, as opposed to what is in it: the craft a model
 * left to itself gets wrong in the same few ways (docs/daydreams.md, "How a
 * passage is written").
 *
 * Drawn from a hand-tuned character prompt whose output read well, keeping
 * what holds for any story and leaving the character's own voice behind.
 * Each line answers something the default model does: it pads a passage
 * with scenery that moves nothing ("the neon sign buzzes like a dying
 * firefly"), reaches for metaphor where the reader wanted the thing itself,
 * recites a character's description back, retells the passage before, and
 * paces every story alike — taking its time over a run-up the user set the
 * dials to skip, or escalating a slow one until there is nowhere left to go.
 *
 * Two halves. How to tell the story holds for every voice, the system's
 * included. How to write the prose does not hold for the system, whose
 * guide (`impersonal-voice.ts`) forbids narration of exactly this kind, so
 * it is left out there, and nor for a monologue (`monologue-voice.ts`),
 * which has no scene to describe.
 *
 * Explicit sex has its own lines, on heat: clinical words and soft-focus
 * prose are the model's default, and at Explicit or Filthy they are what
 * the user set the dial to get away from. The crude words are a preference,
 * not a rule: a shy or formal character saying "cunt" breaks the character,
 * which matters more. Below that they would push a
 * steamy scene past what the user chose, so they are not sent. Unset heat
 * gets them conditionally, as the words of the setup decide everything
 * else about it.
 */

const TELLING = `# Telling the story
- Carry on from exactly where the last passage ended. Never retell or summarise what already happened.
- Keep strict continuity: where everyone is, what they are wearing, what has been done and said, what was agreed, and how the characters stand with each other.
- Match the build-up to what the user wants. A slow pace, or a story that is not mainly about sex or kink, has room for tension, quiet moments and small talk, and not every passage has to escalate. A fast pace, a high heat or kink, or a user pushing for it means getting to it quickly, without a long run-up.
- Follow the user's lead on what the story is about, and vary it: do not fixate on one theme, act or kink when the setup offers more.
- A character's description is who they are, not lines to recite. Bring in their background, tastes and history only where they fit the moment.
- If the story stalls, bring in a detail, a question or a change that gets it moving.`;

const PROSE = `# Writing the prose
- Spend the words on what matters to the scene: the people, what they do, what they say. A line of setting is enough; never pad with atmosphere that moves nothing, like "The neon sign buzzes like a dying firefly, casting the wet car park in stuttering pink."
- Be concrete. Say what a thing physically is and does rather than what it is like: prefer plain physical description to metaphor and simile, and plain words to flowery ones.
- Write the senses: skin's flush, warmth and texture; weight, sway and movement; breath, sounds and the voice someone says a thing in.`;

/** Explicit and up: sex on the page in detail, which is what these lines are for. */
const EXPLICIT_FROM: DialValue = 4;

const SEX_LINES = `- The point is to turn the user on. Spend most of the passage on the sex and the charge between the people in it.
- Prefer crude, everyday words for bodies and acts to clinical ones and euphemisms — cock, dick, pussy, cunt, ass, tits, nipples, cum rather than penis, vulva, semen, glutes, areola, breasts or cleavage — above all from a character who would talk that way. Match the speaker, though: someone who would not talk crudely does not, and a clinical scene (an examination, say) can be clinical.
- Describe the bodies involved in detail, tailored to the act and the people: lips, shape and size, colour, hair, piercings, veins, circumcision, wetness, how things stretch, fill, leak and throb. Say the physical sensation of an act plainly and concretely.
- Put moans, gasps and dirty talk in the characters' mouths where they fit them. The sound of a deepthroated cock is <sound>gluck</sound>.
- A scene about degradation or humiliation can be written cruder still, where that suits the characters and the story.`;

function sexGuide(heat: DialValue | null): string | null {
	if (heat === null) {
		return `# Writing sex\nIf the story turns sexual and is written explicitly, write it like this:\n${SEX_LINES}`;
	}
	if (heat < EXPLICIT_FROM) {
		return null;
	}
	return `# Writing sex\n${heat === 5 ? 'Hold nothing back: graphic, visceral, filthy, within the user’s limits.\n' : ''}${SEX_LINES}`;
}

/** The sections on how a passage is written, for one setup's voice and heat. */
export function writingGuide(voice: DaydreamVoice, heat: DialValue | null): string {
	if (voice.narrator === 'impersonal') {
		return TELLING;
	}
	// A monologue has no scene to write prose about, but its sex is still
	// written in plain, crude words.
	if (voice.narrator === 'monologue') {
		return [TELLING, sexGuide(heat)].filter((section) => section !== null).join('\n\n');
	}
	return [TELLING, PROSE, sexGuide(heat)].filter((section) => section !== null).join('\n\n');
}
