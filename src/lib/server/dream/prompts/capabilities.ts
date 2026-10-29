/**
 * Each capability's block of prompt text: what it asks of the writer and the
 * markup it unlocks (docs/dreams.md, "Capabilities"). A daydream's passage
 * prompt includes only the blocks for what it opted into, so the number of
 * prompts grows with capabilities, never with their combinations.
 *
 * Alias-free, for the bench.
 */

import type { Capability } from '../../../dream/capabilities';

export const CAPABILITY_BLOCKS: Readonly<Record<Capability, string>> = {
	stats: `Stats. The elements may have <stat>s. Move a stat only when the passage earns it, a step at a time, never every passage for the sake of it. Wrap the words that earn the change: <set you.poise="+5">You don't move. She notices.</set>. Use the bare form <set you.poise="+5"/> only where no phrase fits, such as a report that already states the number. Address a stat by its element's id and its name, as in you.poise or renwick.composure; a value is a change ("+5", "-10") or a new value.`,
	reveals: `Reveals. Hide what has a better moment to be discovered: <hidden label="what it is">the hidden text</hidden>, which the reader taps to see. Offer expandable detail sparingly, around a short phrase worth lingering on: <more>her outfit</more>. Write only the phrase; the detail is written when tapped.`,
	choices: `Choices. Where the user would want a small say inside the text, offer it: <cycle id="wear">the collar|nothing|your shirt</cycle>. The first option is shown; the user taps through the others, and their choice reaches you with their next turn.`,
	questions: `Questions. At most one per passage, and only when the answer would change what comes next: <ask keep="story">question<option>…</option><option>…</option></ask>. Ask in a character's voice with as="id" when that keeps the scene going; plainly when it is about the daydream itself. keep="general" only for a question about what the user wants from every daydream.`,
	blocks: `Blocks. When part of the story takes a form from inside its world, write it in that form: <block kind="report" title="…">…</block>. Kinds with their own layout: contract, rules, report, questionnaire, punch-card, schedule, texts, group-chat, email, voice-note, call-response, lines, letter, notice, diary; or any other kind you need. To let the user fill something in as their turn, put fields in the block: <field id="c1" type="initial">clause text</field>, where type is initial, check, choice (with <option>s), text, sign, say or tap-count (with target="20"). What they enter reaches you with their next turn, skipped fields included.`,
	tone: 'Tone. Mark lines that should be read differently: <whisper>…</whisper> for quiet ones, <loud>…</loud> for loud ones, <slow>…</slow> for lines meant to land one at a time.',
	dice: `Dice. At a genuinely uncertain moment, offer a roll rather than deciding: <roll sides="6"><on n="1-2">…</on><on n="3-6">…</on></roll>, covering every face. The browser rolls, and the result reaches you as the user's turn.`,
	pictures: `Pictures. At a moment worth seeing, offer one: <picture of="element ids">a caption</picture>. It is drawn from the elements' appearance fields, so describe nothing about anyone's looks in the caption.`,
	research: `Research. If the user asks for more of what the research drew on, say so in the footer with {"research": "what to look for"}.`,
	voice: `Voice. The user listens as well as reads. Where a line would otherwise be read flat, add a short delivery cue: <say who="id" how="low, amused">…</say>, or how="…" on a tone tag. Where a character would make a sound, write it: <sound who="id">sighs</sound>. Keep cues to a few words.`
};
