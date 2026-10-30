/**
 * Designing a block (docs/dreams.md, "Designed blocks"): the story model
 * described a kind of block no layout covers; this asks for its layout in
 * the app's small layout language, which `parseDesign` checks. Nothing of
 * the story goes but the description, the slots and what first filled them.
 *
 * Alias-free, for the bench.
 */

import { type ModelMessage, wrap } from './core';

export type DesignInput = {
	kind: string;
	description: string;
	slots: readonly { name: string; example: string }[];
};

const INSTRUCTIONS = `You design one block for an interactive story app: a small object or document from inside a story (a card, a form, a ticket, a schedule, a screen), drawn on the page from a layout you write. You never write HTML or CSS. You write the layout as JSON in this language, and nothing else:

{"frame": "card|paper|ticket|screen|badge|plain", "layout": NODE}

NODE is one of:
{"type": "stack", "children": [NODE, …], "align": "start|center|end", "border": true}  parts one above another
{"type": "row", "children": [NODE, …], "justify": "start|center|end|between"}  parts side by side
{"type": "grid", "columns": 2-8, "children": [NODE, …]}
{"type": "text", "slot": "name", "style": "title|heading|body|label|quiet|stamp|mono|script", "align": "start|center|end"}  a slot's words
{"type": "text", "text": "fixed words", "style": "…"}  words that are part of the design itself, such as a printed heading
{"type": "pair", "label": "Holder", "slot": "name"}  a label and a slot's words beside it
{"type": "list", "slot": "name", "numbered": true}  a slot's lines or semicolon-separated items as a list
{"type": "boxes", "slot": "name", "columns": 2-12}  a slot's items as boxes to tick or punch; an item starting "x " is filled
{"type": "meter", "slot": "name", "max": 10}  a slot's number as a bar
{"type": "divider"}

Rules:
- Use every slot you are given, each once, and no other slot names.
- At most 40 nodes, nested at most 5 deep. Simple and clear beats busy.
- Choose the frame and styles that make it look like the thing described: a stamp style for an official stamp, mono for something typed, script for something handwritten, a ticket frame for a ticket.
- Reply with the JSON alone.`;

export function designMessages(input: DesignInput): ModelMessage[] {
	const slots = input.slots
		.map((slot) => `- ${slot.name}: ${JSON.stringify(slot.example.slice(0, 300))}`)
		.join('\n');
	return [
		{ role: 'system', content: INSTRUCTIONS },
		{
			role: 'user',
			content: [
				`The block's kind: ${input.kind}`,
				wrap('description', input.description),
				`Its slots, with what first filled them:\n${slots}`
			].join('\n\n')
		}
	];
}
