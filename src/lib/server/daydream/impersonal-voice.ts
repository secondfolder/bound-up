import type { DialValue } from '$lib/daydream';

/**
 * The guide for the `impersonal` voice ("A system in charge"): the story is
 * told by the rules themselves, with no narrator.
 *
 * Every other voice is ordinary fiction, which the model writes well from a
 * sentence. This one is not: told only to be "an impersonal authority —
 * procedural, exact, never personal", the default model wrote a narrator
 * describing a hallway and a woman in a grey blouse, with the rules
 * mentioned in passing, and every later passage copied that opening. So this
 * voice gets a section of its own, with examples, placed after everything
 * describing the scene (`buildMessages` in `prompt.ts`), so it is the last
 * thing the model reads about how to write rather than the first.
 *
 * The examples show the form, not the content. There are two sets because
 * examples steer content too: a SFW scene shown clothing surrendered at the
 * door would drift towards it, and an explicit one shown nothing but hand
 * raising would stay timid. The heat dial picks; unset falls back to the
 * tame set, and the scene's own words decide.
 */

// The openings differ in form, and neither has a stock phrase to lift: the
// first versions both began "You have been admitted. The following applies
// from this moment" and ended "state your number", and the model opened
// nearly every story with exactly those words.
const TAME_EXAMPLES = [
	`NOTICE 1: ARRIVAL
1. Stand on the line until the light over the door turns green.
2. Speak only to answer. One word, unless more is asked for.
Further rules are issued as these are kept. The light is red.`,
	`Rule 1 kept: 5 minutes 00 seconds. Logged.
The light is green. Walk to the second line, three steps and no more, and wait there for the tone.`,
	`Rule 2 broken at 21:09: four words spoken. Infraction 1 of 3 recorded.
Consequence under Rule 2: return to the first line. The five minutes begin again.`,
	`The examiner will now review your conduct. The examiner does not answer questions. Hold the form out at arm's length until it is taken.`
];

const ADULT_EXAMPLES = [
	`EVENING SCHEDULE — ROOM 4
19:00  Clothing off, folded, in the tray by the door.
19:05  Kneel on the mat, knees apart, hands open on your thighs.
19:10  Inspection.
Until 19:10 you may not touch yourself. The clock reads 18:59.`,
	`19:04. Tray received, contents logged. Kneeling posture: correct.
Amendment 1: from now on you will thank the house aloud each time an entry is completed.`,
	`Infraction at 19:16: release without permission. Recorded, 1 of 3.
Consequence: your next three requests to finish are refused. The schedule resumes at its next entry.`,
	'The attendant will now complete the inspection. The attendant will touch where the form requires and record what is found. You will report your state on a scale of one to ten each time you are asked.'
];

/** Steamy and up: sex happens on the page, so the examples may show it. */
const ADULT_FROM: DialValue = 3;

export function impersonalExamples(heat: DialValue | null): readonly string[] {
	return heat !== null && heat >= ADULT_FROM ? ADULT_EXAMPLES : TAME_EXAMPLES;
}

/** The section that tells the model how to write as the system, with examples of the form. */
export function impersonalGuide(characterCount: number, heat: DialValue | null): string {
	const cast =
		characterCount === 0
			? 'No one is behind the system. Anything physical happens by mechanism or schedule — a light, a lock, a tone, a timer — and is reported as a fact, not described.'
			: 'The characters are its functionaries — staff, an attendant, an examiner. They appear as the system reports them ("The attendant will now…"), and when they speak it is in the clipped words of someone following procedure. They never step outside it.';
	const examples = impersonalExamples(heat)
		.map((example) => `"""\n${example}\n"""`)
		.join('\n');
	return `# Writing as the system
You are not a narrator and not a character. You are the system itself — the house's rules, the facility's protocol, the institution's procedures — and every passage is something it issues:
- notices and announcements, with headings in capitals where it suits;
- numbered rules, clauses and amendments;
- instructions with exact counts, times, positions and durations;
- records of what the user did: "Compliance recorded.", "Infraction 2 of 3.";
- assessments, checklists and results.
Write in the present tense, flat and exact. Address the user as "you", or by the one term or number the institution would use, and keep it.
Never write as a storyteller: no description of rooms, light or smells, no "you feel" or "you notice", no one's expressions. The system has no moods, gives no warm praise, and explains nothing beyond what a rule states.
When the user acts, answer as procedure: acknowledge it, record it, rule on it under the rules already issued — by number — and give the next instruction or consequence. Keep every rule you issue; add new ones as numbered amendments.
${cast}
Begin passages in different ways — a heading, a time, a ruling, a single order — and never twice in the same words.
These examples show the form only. Do not reuse any of their sentences, headings, rules, numbers or setting, and do not open the way they open: give this system its own name, its own rules and its own way of speaking, all taken from the scene above, and follow the scene's heat and kink, not theirs.
${examples}`;
}
