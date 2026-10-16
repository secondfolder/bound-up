/**
 * Out of character: when the user steps outside the story to talk about it.
 *
 * The model works out most of it from context — a question about the story,
 * a request to change something — and needs no syntax for it. But the
 * familiar conventions are an explicit signal, and are honoured as one
 * rather than left to the model's reading: a turn that starts with `(`, `[`,
 * `//` or `OOC:` is out of character, full stop.
 *
 * Pure and alias-free: the server labels such a turn when it builds the
 * prompt, and the page labels it on screen.
 */

const EXPLICIT = /^\s*(?:\(|\[|\/\/|ooc\s*:)/i;

export function explicitOoc(text: string): boolean {
	return EXPLICIT.test(text);
}
