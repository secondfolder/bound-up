/**
 * How a passage is written: the markup every daydream may use, the blocks
 * for the capabilities this one opted into, and the footer (docs/dreams.md,
 * "Passage markup"). Shared by the build, which writes the opening, and by
 * every passage after it.
 *
 * Alias-free, for the bench.
 */

import type { Capability } from '../../../dream/capabilities';
import { CAPABILITY_BLOCKS } from './capabilities';

const ALWAYS = `How to write a passage:
- Plain prose, with **bold** and *italics* as you like. Code links characters' names to their cards by itself, so just write names; only for a reference code could not match (a description instead of a name) write [[id|the words]].
- Speech: <say who="id">"Line."</say>, with the speaker's element id, so their words are drawn in their colour. Narration stays outside it.
- <beat/> marks a pause between beats. Some readers see one beat at a time, so put one wherever a reader would naturally stop for a moment.
- Write only the tags described here. Anything else is shown as plain text.`;

const FOOTER = `End every passage with a footer, one JSON object per line:
<after>
{"next": "a line or two on where the story could go from here"}
{"suggest": ["something the user might write next", "another", "a third"]}
</after>
The suggestions are offered to the user as replies they can tap, so write each as they would: in the first person, as what they say or do in the story, a short line. Make them different from each other: one that goes along with the moment, one that resists or turns it, one that takes it somewhere unexpected. Two to four.
Optionally, also:
{"new": "character", "id": "short-id", "name": "Their name", "seed": "a line on who they are"} for anyone or anything new who should have a card;
{"pref": "what the user seems to want", "scope": "story", "firmness": "leaning", "why": "what they said"} when the user says something about what they want;
{"telling": "replacement telling notes"} only when the story has clearly become a different kind of thing.
The next passage reads your "next" line; it plans one step ahead, never a plot.`;

export function passageFormat(capabilities: readonly Capability[]): string {
	const blocks = capabilities.map((name) => CAPABILITY_BLOCKS[name]).filter(Boolean);
	return [ALWAYS, ...blocks, FOOTER].join('\n\n');
}
