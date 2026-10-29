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

import { THEMES, VIEWS } from '../../../dream/build';
import { CAPABILITIES } from '../../../dream/capabilities';
import type { Nudge } from '../../../dream/nudges';
import { OVERUSED_NAMES } from '../../../dream/repetition';
import { bulletList, CORE_RULES, limitsSection, type ModelMessage, wrap } from './core';
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
};

const INSTRUCTIONS = `This step builds the daydream from the brief and the chosen direction, and then writes its opening.

Use only as much structure as the brief needs. A daydream with no elements and no capabilities is a good answer when the brief asks for something simple; a story with several people and things to track is a good answer when it asks for that.

Reply with these parts, in this order:

<title>a short name for this daydream</title>

<heat level="none|suggestive|steamy|explicit"/>
How sexual it is. Read it from the brief and the user's preferences; if they do not say, choose what the brief most plausibly wants.

<telling>
Notes for whoever writes every passage: what this daydream is, its form, its rhythm, how the user takes part, what to avoid. Under 250 words. Write what would make this daydream itself, not general advice about writing.
</telling>

<presentation view="…" theme="…">a sentence on what passages should look like</presentation>
view: ${VIEWS.join(', ')}. scroll is ordinary reading; tap shows one beat at a time, for slow, heavy scenes; texts is for a daydream told as messages; monologue is one voice in short lines.
theme: ${THEMES.join(', ')}.

<capabilities>a comma-separated list, possibly empty</capabilities>
From: ${CAPABILITIES.filter((name) => name !== 'research' && name !== 'voice').join(', ')}. Choose only what this daydream will actually use. What each does is described under "How to write a passage" below.

<elements>
Anything worth keeping a record of, as tags. The tag is the element's type, and any type is allowed. Known types the app does more with:
<character id="short-id" name="Their name" also="nicknames, other names">
  <appearance>what they look like (used for pictures)</appearance>
  <manner>how they behave and speak</manner>
  <background>a little of their history, where it shapes how they act</background>
  <with-you>who they are to the user</with-you>
  <unspoken shown="no">something they want or hide; shown="no" keeps it off their card</unspoken>
</character>
<you> for the user's own role, and any stats about them.
<place>, <thing>, <pressure> (a tension that pushes on every scene), or any other type.
Fields are free: use the ones above where they fit and invent others.
Stats, only where the daydream is a progression (a training, a debt, days kept): <stat name="poise" kind="meter|count|list|line" value="20" max="100">what moves it</stat>, inside the element it belongs to.
Write profiles, not plans: who people are, how they talk, what they want. Never plan events that only happen if something else does. The story is written one passage at a time.
Names: choose names that suit each person's background and age. Never use any of these, which are overused: ${OVERUSED_NAMES.join(', ')}.
</elements>

<passage>
the opening passage, written as described below, ending with its footer inside the passage
</passage>
In the opening, use only the markup for the capabilities you listed above.`;

export function buildMessages(input: BuildInput): ModelMessage[] {
	const system = [
		CORE_RULES,
		limitsSection(input.limits),
		INSTRUCTIONS,
		passageFormat(CAPABILITIES.filter((name) => name !== 'research'))
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
	if (input.recentNames.length > 0) {
		parts.push(`Names this user has had recently, to avoid: ${input.recentNames.join(', ')}`);
	}
	return [
		{ role: 'system', content: system },
		{ role: 'user', content: parts.join('\n\n') }
	];
}
