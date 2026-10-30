/**
 * Step 3: building the daydream and opening it, in one streamed reply
 * (docs/dreams.md, "Building the daydream"). The reply is read by
 * `parseBuild`; its `<passage>` is the first passage.
 *
 * Every capability block is included here, because the build is what
 * chooses them; passages after it get only the chosen ones.
 *
 * Alias-free, for the bench.
 */

import { VIEWS } from '../../../dream/build';
import { passageCapabilities } from '../../../dream/capabilities';
import type { Nudge } from '../../../dream/nudges';
import { OVERUSED_NAMES } from '../../../dream/repetition';
import {
	amendmentParts,
	bulletList,
	CORE_RULES,
	limitsSection,
	type ModelMessage,
	wrap
} from './core';
import { passageFormat } from './passage-format';

export type BuildInput = {
	brief: string;
	musts: readonly string[];
	research: string;
	/** The chosen direction, or null when step 1 and the build are one call. */
	direction: string | null;
	nudges: readonly Nudge[];
	limits: readonly string[];
	preferences: readonly string[];
	/** Names from this user's recent daydreams, to avoid along with the overused ones. */
	recentNames: readonly string[];
	/** Changes the user asked for while it was being set up, oldest first. */
	amendments?: readonly string[];
	/** Names drawn by code for the build to choose from (`drawPool`). */
	namePool?: string;
	/**
	 * The build these changes are to, without its passage: rebuilt keeping
	 * everything the changes do not touch (docs/dreams.md, "The setup page").
	 */
	previous?: string | null;
};

const INSTRUCTIONS = `This step builds the daydream from the brief and the chosen direction, and then writes its opening.

Use only as much structure as the brief needs. A daydream with no elements is a good answer when the brief asks for something simple; a story with several people and things to track is a good answer when it asks for that.

Reply with these parts, in this order:

<title>a short name for this daydream</title>

<heat level="none|suggestive|steamy|explicit"/>
How sexual it is. Read it from the brief and the user's preferences; if they do not say, choose what the brief most plausibly wants. A brief that names a sexual kink or act is explicit unless it says otherwise.

<telling>
Notes for whoever writes every passage: what this daydream is, its form, its rhythm, how the user takes part, what to avoid. Under 250 words. Write what would make this daydream itself, not general advice about writing.
</telling>
Form: when the brief asks for a form, every passage is written in it, and the telling notes say so, with how long a passage is. Vignettes, snippets or moments: each passage one short, self-contained moment of about 60 to 150 words, a new scene each time, joined by the brief's theme rather than a plot, never carrying on from the last unless the user asks. Without a form asked for, say in the telling notes what length suits this daydream.
Pacing: when the brief explicitly asks for a kink, a sexual act or a particular scene, get to it soon, in the opening or the passage after: the act itself, written as what it is, rather than hints of it or a build-up held back as a payoff. Build up to it only when something says to: the brief or the user's preferences ask for a slow burn, a tease or a build-up, or the chosen direction is about the anticipation itself. Say which in the telling notes.

<presentation view="…">a sentence on what passages should look like</presentation>
view: ${VIEWS.join(', ')}. scroll is ordinary reading; tap shows one beat at a time, for slow, heavy scenes; texts is for a daydream told as messages; monologue is one voice in short lines.

<elements>
Anything worth keeping a record of, as tags. The tag is the element's type, and any type is allowed. Known types the app does more with:
<character id="short-id" name="Their name" short="what to call them" also="nicknames, other names" name-from="German woman born in the 1970s, uncommon">
  <appearance>what they look like (used for pictures)</appearance>
  <manner>how they behave and speak</manner>
  <background>a little of their history, where it shapes how they act</background>
  <relationship-with-you>who they are to the user, and what is between you</relationship-with-you>
  <unspoken shown="no">something they want or hide; shown="no" keeps it off their card</unspoken>
</character>
<you> for the user's own role, and any stats about them.
<place>, <thing>, <pressure> (a tension that pushes on every scene), or any other type.
Every element has a name, a pressure or a place as much as a person: the words the user will see it called by ("The Friday inspection", "The studio"). When a name is longer than about three words, add short="…", a word or two to call it by.
Fields are free: use the ones above where they fit and invent others.
Stats, only where the daydream is a progression (a training, a debt, days kept): <stat name="poise" kind="meter|count|list|line" value="20" max="100">what moves it</stat>, inside the element it belongs to.
Write profiles, not plans: who people are, how they talk, what they want. Never plan events that only happen if something else does. The story is written one passage at a time.
Names: choose names that suit each person's background and age. Where their background is in the pool of names below, choose from it; otherwise name them yourself. Never use any of these, which are overused: ${OVERUSED_NAMES.join(', ')}. On each character, write name-from="…": a few words on what their name should suit (background, gender, roughly when they were born, how unusual), so another can be drawn for them later.
</elements>

<passage>
the opening passage, written as described below, ending with its footer inside the passage
</passage>
In the opening, use only the markup described below, and only where the moment calls for it.`;

export function buildMessages(input: BuildInput): ModelMessage[] {
	const system = [
		CORE_RULES,
		limitsSection(input.limits),
		INSTRUCTIONS,
		// Not voice: that is on when the user listens, never the build's choice.
		passageFormat(passageCapabilities(false))
	].join('\n\n');
	const parts = [wrap('brief', input.brief)];
	if (input.musts.length > 0) {
		parts.push(
			`What the brief requires, which the daydream must meet:\n${bulletList(input.musts)}`
		);
	}
	if (input.research) {
		parts.push(wrap('research', input.research));
	}
	if (input.direction) {
		parts.push(`The chosen direction:\n${input.direction}`);
	}
	if (input.preferences.length > 0) {
		parts.push(wrap('preferences', bulletList(input.preferences)));
	}
	if (input.nudges.length > 0) {
		parts.push(
			`Nudges, as suggestions:\n${bulletList(input.nudges.map((nudge) => `${nudge.dimension}: ${nudge.text}`))}`
		);
	}
	if (input.namePool) {
		parts.push(`A pool of names, drawn at random from real ones by background:\n${input.namePool}`);
	}
	if (input.recentNames.length > 0) {
		parts.push(`Names this user has had recently, to avoid: ${input.recentNames.join(', ')}`);
	}
	if (input.previous) {
		parts.push(
			`The daydream was already built as below. Build it again with the changes that follow, keeping everything they do not touch, and write a new opening.\n${wrap('previous', input.previous)}`
		);
	}
	parts.push(...amendmentParts(input.amendments ?? []));
	return [
		{ role: 'system', content: system },
		{ role: 'user', content: parts.join('\n\n') }
	];
}
