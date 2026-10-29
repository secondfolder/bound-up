/**
 * The capability menu: features a daydream opts into, each one block of
 * prompt text plus the markup it unlocks (docs/dreams.md, "Capabilities").
 * This half is the list and what each unlocks; the prompt text is the
 * server's (`$lib/server/dream/capabilities.ts`).
 *
 * Pure and alias-free.
 */

export const CAPABILITIES = [
	'stats',
	'reveals',
	'choices',
	'questions',
	'blocks',
	'tone',
	'dice',
	'pictures',
	'research',
	'voice'
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Markup every daydream may use, whatever it opted into. */
export const ALWAYS_ALLOWED_TAGS: readonly string[] = ['say', 'beat', 'after', 'p'];

/** The tags each capability allows in a passage. */
export const CAPABILITY_TAGS: Readonly<Record<Capability, readonly string[]>> = {
	stats: ['set'],
	reveals: ['hidden', 'more'],
	choices: ['cycle'],
	questions: ['ask', 'option'],
	blocks: ['block', 'texts', 'letter', 'notice', 'diary', 'field', 'option'],
	tone: ['whisper', 'loud', 'slow'],
	dice: ['roll', 'on'],
	pictures: ['picture'],
	research: [],
	voice: ['sound']
};

const KNOWN = new Set<string>(CAPABILITIES);

export function isCapability(value: string): value is Capability {
	return KNOWN.has(value);
}

/** Reads a comma-separated list, keeping only known capabilities, each once. */
export function parseCapabilities(text: string): Capability[] {
	const found = new Set<Capability>();
	for (const part of text.split(',')) {
		const name = part.trim().toLowerCase();
		if (isCapability(name)) {
			found.add(name);
		}
	}
	return [...found];
}

/** The passage tags a daydream with these capabilities may use. */
export function allowedTags(capabilities: readonly Capability[]): Set<string> {
	return new Set([
		...ALWAYS_ALLOWED_TAGS,
		...capabilities.flatMap((name) => CAPABILITY_TAGS[name])
	]);
}
