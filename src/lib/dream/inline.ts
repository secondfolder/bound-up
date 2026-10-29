/**
 * A passage's plain text as the renderer draws it (docs/dreams.md, "The
 * markup"): Markdown emphasis, and every mention of an element's name linked
 * to its card. Code links names, so the model only marks a reference code
 * cannot match (`[[id|words]]`), which leaves it more attention for the
 * writing.
 *
 * Pure and alias-free.
 */

export type InlineSegment =
	| { kind: 'text'; text: string }
	| { kind: 'em'; text: string }
	| { kind: 'strong'; text: string }
	| { kind: 'link'; text: string; id: string };

// Markdown's rule: emphasis hugs its words, so "5 * 3" is not emphasis.
const EMPHASIS = /\*\*(?<strong>[^*\s](?:[^*\n]*[^*\s])?)\*\*|\*(?<em>[^*\s](?:[^*\n]*[^*\s])?)\*/g;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

function escapeRegex(text: string): string {
	return text.replace(REGEX_SPECIAL, '\\$&');
}

/**
 * One pattern matching any of the names as whole words, longest first so
 * "Ms Varga" wins over "Varga". Null when there are none.
 */
export function namePattern(names: readonly { id: string; name: string }[]): RegExp | null {
	if (names.length === 0) {
		return null;
	}
	const sorted = [...names].sort((a, b) => b.name.length - a.name.length);
	return new RegExp(
		`(?<![\\p{L}\\p{N}])(?:${sorted.map((entry) => escapeRegex(entry.name)).join('|')})(?![\\p{L}\\p{N}])`,
		'gu'
	);
}

function linkNames(
	text: string,
	pattern: RegExp | null,
	idFor: ReadonlyMap<string, string>
): InlineSegment[] {
	if (!pattern) {
		return text ? [{ kind: 'text', text }] : [];
	}
	const segments: InlineSegment[] = [];
	let at = 0;
	for (const match of text.matchAll(pattern)) {
		const id = idFor.get(match[0]);
		if (id === undefined || match.index === undefined) {
			continue;
		}
		if (match.index > at) {
			segments.push({ kind: 'text', text: text.slice(at, match.index) });
		}
		segments.push({ kind: 'link', text: match[0], id });
		at = match.index + match[0].length;
	}
	if (at < text.length) {
		segments.push({ kind: 'text', text: text.slice(at) });
	}
	return segments;
}

/** A run of text as segments: emphasis first, then names linked inside plain stretches. */
export function inlineSegments(
	text: string,
	names: readonly { id: string; name: string }[] = []
): InlineSegment[] {
	const pattern = namePattern(names);
	const idFor = new Map(names.map((entry) => [entry.name, entry.id]));
	const segments: InlineSegment[] = [];
	let at = 0;
	for (const match of text.matchAll(EMPHASIS)) {
		if (match.index === undefined) {
			continue;
		}
		segments.push(...linkNames(text.slice(at, match.index), pattern, idFor));
		const { strong, em } = match.groups ?? {};
		segments.push(strong ? { kind: 'strong', text: strong } : { kind: 'em', text: em ?? '' });
		at = match.index + match[0].length;
	}
	segments.push(...linkNames(text.slice(at), pattern, idFor));
	return segments;
}

const SPEAKER_SHADES = 5;

/** Which of a few speaker colours a character gets: the same every time for the same id. */
export function speakerShade(id: string): number {
	let hash = 0;
	for (const char of id) {
		hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
	}
	return hash % SPEAKER_SHADES;
}
