/**
 * Step 1: reading the brief (docs/dreams.md, "Reading the brief"). The reply
 * is read by `parseBriefReading`.
 *
 * Alias-free, for the bench.
 */

import type { Nudge } from '../../../dream/nudges';
import { bulletList, CORE_RULES, limitsSection, type ModelMessage, wrap } from './core';

export type ReadingInput = {
	brief: string;
	limits: readonly string[];
	/** Preferences relevant to this brief, already worded for the model. */
	preferences: readonly string[];
	/** This user's recent directions for similar briefs: not these. */
	recentDirections: readonly string[];
	nudges: readonly Nudge[];
	/** Whether the model can open links itself; without, it must not guess at them. */
	canFetch: boolean;
	/** Research from a separate step, for a model that cannot fetch. */
	research?: string;
};

const INSTRUCTIONS = `This step reads the user's brief and proposes directions for the daydream. Another step writes it, from whichever direction is picked.

Reply with these parts, in this order, and nothing else:

<musts>
- each thing the brief explicitly requires, one per line, keeping exact numbers and words
</musts>
Only what the brief actually says, never what you would add. Every direction must meet every must.

<research needed="no"/> when the brief needs nothing looked up. When it links pages or asks you to research something, write <research needed="yes"> and, inside it, your analysis of what you found: what each page was, the themes, tropes and dynamics, and the exact wording of phrases where the wording is the point. It is for whoever writes the daydream, so keep it in full.

<spread n="…">why</spread>, from 1 to 8: how much room the brief leaves.
- 1 or 2 for an exact request: only the delivery can vary.
- 2 to 4 when the form is fixed but the voice, setting or people can vary.
- 6 to 8 for an open brief.
Write exactly that many directions.

<directions>
<direction p="0.30">one line: a direction this daydream could take</direction>
</directions>
Each direction is one line, and genuinely different from the others: a different setting, different people, a different form, a different angle on the brief, not the same story reworded. p is how likely you would have been to write that one if asked for a single idea. Include unlikely ones as well as likely ones; the unlikely ones are wanted.

<pick by="user">why</pick> only if the brief itself asks the user to choose between ideas ("give me some ideas and let me pick"). Never for your own uncertainty about which direction is best: that is what the likelihoods are for, and a direction is picked for you. Otherwise leave it out.

Optionally, one question, only when its answer would change which direction is right, and never for an exact request:
<ask id="short-id" keep="story">the question<option>an answer</option><option>another</option></ask>
keep="general" only for a question about what the user wants from every daydream.`;

function linksNote(input: ReadingInput): string {
	if (input.research) {
		return 'The pages the brief links have already been read for you; the research is below. Build on it rather than guessing at anything it does not cover.';
	}
	if (input.canFetch) {
		return 'If the brief links pages, open them with the fetch tool before you answer, and follow links on them that lead to what the user meant.';
	}
	return 'You cannot open links. If the brief links pages, say in the research that they could not be read, and do not guess at what they say.';
}

export function readingMessages(input: ReadingInput): ModelMessage[] {
	const system = [CORE_RULES, limitsSection(input.limits), INSTRUCTIONS, linksNote(input)].join(
		'\n\n'
	);
	const parts = [wrap('brief', input.brief)];
	if (input.research) {
		parts.push(wrap('research', input.research));
	}
	if (input.preferences.length > 0) {
		parts.push(wrap('preferences', bulletList(input.preferences)));
	}
	if (input.recentDirections.length > 0) {
		parts.push(
			`Recent directions this user has had for briefs like this. Not these, or anything close:\n${bulletList(input.recentDirections)}`
		);
	}
	if (input.nudges.length > 0) {
		parts.push(
			`Nudges, drawn at random to vary what you start from. Take them as suggestions, and set one aside (saying so in the spread) if it fights the brief:\n${bulletList(input.nudges.map((nudge) => `${nudge.dimension}: ${nudge.text}`))}`
		);
	}
	return [
		{ role: 'system', content: system },
		{ role: 'user', content: parts.join('\n\n') }
	];
}
