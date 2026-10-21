/**
 * The guide for the `impersonal` voice ("A system in charge"): the story is
 * told by the rules themselves, with no narrator.
 *
 * Every other voice is ordinary fiction, which the model writes well from a
 * sentence. This one is not: told only to be "an impersonal authority —
 * procedural, exact, never personal", the default model wrote a narrator
 * describing a hallway and a woman in a grey blouse, with the rules
 * mentioned in passing, and every later passage copied that opening. So this
 * voice gets a section of its own, placed after everything describing the
 * idea (`buildMessages` in `prompt.ts`), so it is the last thing the model
 * reads about how to write rather than the first. It lists what the system
 * writes in, form by form, so that it does not narrate.
 *
 * There are no examples. There were four, in a tame and an adult set by
 * heat. Examples set the shape of what comes back more than anything the
 * guide says: the monologue's four, each a statement and a paragraph, came
 * back as four statements with a paragraph each (`monologue-voice.ts`),
 * and an earlier set here, two of which began "You have been admitted. The
 * following applies from this moment", had the model open nearly every
 * story with exactly those words. Without them the system's shape is the
 * idea's to suggest.
 */

/** Said to both guides: without it, every system sounds like the one before it. */
const ITS_OWN =
	"Give this system its own name, its own rules and its own way of speaking, all taken from the idea below, and follow the idea's heat and kink.";

/**
 * The guide when the system governs a character rather than the user: it
 * writes about them in the third person, reports to the user — the
 * authority it answers to, unless they only watch — and carries out the
 * user's rulings as amendments (docs/daydreams.md, "Voices").
 */
function governingGuide(watching: boolean): string {
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
${ITS_OWN}`;
}

/** The section that tells the model how to write as the system. */
export function impersonalGuide(
	characterCount: number,
	governs: 'user' | 'character' = 'user',
	watching = false
): string {
	if (governs === 'character') {
		return governingGuide(watching);
	}
	const cast =
		characterCount === 0
			? 'No one is behind the system. Anything physical happens by mechanism or schedule — a light, a lock, a tone, a timer — and is reported as a fact, not described.'
			: 'The characters are its functionaries — staff, an attendant, an examiner. They appear as the system reports them ("The attendant will now…"), and when they speak it is in the clipped words of someone following procedure. They never step outside it.';
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
${ITS_OWN}`;
}
