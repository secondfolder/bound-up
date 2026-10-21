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
 * describing the idea (`buildMessages` in `prompt.ts`), so it is the last
 * thing the model reads about how to write rather than the first.
 *
 * The examples show the form, not the content. There are two sets because
 * examples steer content too: a SFW daydream shown clothing surrendered at the
 * door would drift towards it, and an explicit one shown nothing but hand
 * raising would stay timid. The heat dial picks; unset falls back to the
 * tame set, and the idea's own words decide.
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

/**
 * The last example in each set names a functionary ("The examiner will
 * now…"), which a system with no one behind it must not copy: models copy
 * examples. So with no characters it is swapped for one done by mechanism.
 */
const UNSTAFFED_EXAMPLE = {
	tame: "Review begins at the tone. Hold the form out at arm's length. The tray beneath it records how long it is held, and the light above the door decides when it is enough.",
	adult:
		'Inspection begins at the tone. The restraint on the left wrist closes, then the right. Report your state on a scale of one to ten each time the light flashes.'
} as const;

/**
 * The examples when the system governs a character and answers to the user
 * (`DaydreamVoice.governs`): the same form, about "the subject" in the
 * third person, with the system asking the user for rulings and carrying
 * them out as amendments.
 */
const GOVERNING_TAME_EXAMPLES = [
	`NOTICE 1: THE SUBJECT
1. The subject stands on the line until the light over the door turns green.
2. The subject speaks only to answer.
Further rules are issued on your instruction.`,
	`Rule 1 kept by the subject: 5 minutes 00 seconds. Logged.
Request from the subject: permission to sit. Awaiting your ruling.`,
	'Ruling received. Amendment 1: the subject remains standing until 21:00. Issued, and acknowledged.',
	`Rule 2 broken by the subject at 21:09: four words spoken. Infraction 1 of 3 recorded.
Consequence proposed: the five minutes begin again. Confirm or amend.`
];

const GOVERNING_ADULT_EXAMPLES = [
	`EVENING SCHEDULE — ROOM 4 — THE SUBJECT
19:00  Clothing off, folded, in the tray by the door.
19:05  Kneeling on the mat, knees apart, hands open on the thighs.
19:10  Inspection, at your pleasure.
The subject may not touch themselves before 19:10.`,
	`19:04. Tray received, contents logged. The subject's posture: correct.
Request from the subject: permission to speak. Awaiting your ruling.`,
	'Amendment 3, on your instruction: the subject thanks the house aloud each time an entry is completed. Issued. First thanks recorded at 19:07.',
	`Infraction at 19:16: the subject came without permission. Recorded, 1 of 3.
Consequence proposed: the next three requests to finish refused. Confirm or amend.`
];

/** Steamy and up: sex happens on the page, so the examples may show it. */
const ADULT_FROM: DialValue = 3;

export function impersonalExamples(heat: DialValue | null, characterCount = 1): readonly string[] {
	const adult = heat !== null && heat >= ADULT_FROM;
	const examples = adult ? ADULT_EXAMPLES : TAME_EXAMPLES;
	return characterCount === 0
		? [...examples.slice(0, -1), UNSTAFFED_EXAMPLE[adult ? 'adult' : 'tame']]
		: examples;
}

/**
 * The guide when the system governs a character rather than the user: it
 * writes about them in the third person, reports to the user — the
 * authority it answers to, unless they only watch — and carries out the
 * user's rulings as amendments (docs/daydreams.md, "Voices").
 */
function governingGuide(heat: DialValue | null, watching: boolean): string {
	const adult = heat !== null && heat >= ADULT_FROM;
	const examples = (adult ? GOVERNING_ADULT_EXAMPLES : GOVERNING_TAME_EXAMPLES)
		.map((example) => `"""\n${example}\n"""`)
		.join('\n');
	const user = watching
		? 'The user only watches: the system addresses no one but the subject, and asks no one for rulings.'
		: 'The user is the authority the system answers to, as "you": it reports to them, asks them for rulings on what the subject requests and what an infraction costs, and carries out what they decide as amendments.';
	return `# Writing as the system
You are not a narrator and not a character. You are the system itself — the house's rules, the facility's protocol, the institution's procedures — and it governs one of the characters below: the first, called "the subject" here, unless the idea says otherwise. Every passage is something it issues:
- notices and rules for the subject, with headings in capitals where it suits;
- numbered rules, clauses and amendments;
- instructions to the subject with exact counts, times, positions and durations;
- records of what the subject did: "Compliance recorded.", "Infraction 2 of 3.";
- requests and reports${watching ? '' : ' to the user'}.
Write in the present tense, flat and exact. Refer to the subject in the third person, by the one term, name or number the institution would use, and keep it. ${user}
Never write as a storyteller: no description of rooms, light or smells, no one's feelings, no one's expressions. The system has no moods, gives no warm praise, and explains nothing beyond what a rule states.
When the user acts, answer as procedure: record their order or ruling, issue it to the subject as an instruction or amendment, by number, and report the subject's compliance or infraction. Keep every rule issued.
Any other characters are its functionaries, and appear only as it reports them.
Begin passages in different ways — a heading, a time, a ruling, a single order — and never twice in the same words.
These examples show the form only. Do not reuse any of their sentences, headings, rules, numbers or setting, and do not open the way they open: give this system its own name, its own rules and its own way of speaking, all taken from the idea below, and follow the idea's heat and kink, not theirs.
${examples}`;
}

/** The section that tells the model how to write as the system, with examples of the form. */
export function impersonalGuide(
	characterCount: number,
	heat: DialValue | null,
	governs: 'user' | 'character' = 'user',
	watching = false
): string {
	if (governs === 'character') {
		return governingGuide(heat, watching);
	}
	const cast =
		characterCount === 0
			? 'No one is behind the system. Anything physical happens by mechanism or schedule — a light, a lock, a tone, a timer — and is reported as a fact, not described.'
			: 'The characters are its functionaries — staff, an attendant, an examiner. They appear as the system reports them ("The attendant will now…"), and when they speak it is in the clipped words of someone following procedure. They never step outside it.';
	const examples = impersonalExamples(heat, characterCount)
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
These examples show the form only. Do not reuse any of their sentences, headings, rules, numbers or setting, and do not open the way they open: give this system its own name, its own rules and its own way of speaking, all taken from the idea below, and follow the idea's heat and kink, not theirs.
${examples}`;
}
