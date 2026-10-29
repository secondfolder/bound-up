/**
 * The build's reply: title, telling notes, presentation, capabilities,
 * elements, and the opening passage streamed after them (docs/dreams.md,
 * "Building the daydream").
 *
 * `<passage>` is kept raw here and parsed on its own, as every passage is.
 *
 * Pure and alias-free.
 */

import { type Capability, parseCapabilities } from './capabilities';
import { type DreamElement, parseElements } from './elements';
import {
	DEFAULT_RAW_TAGS,
	findTag,
	type MarkupNode,
	parseMarkup,
	plainText,
	tagText
} from './markup';

export const VIEWS = ['scroll', 'tap', 'texts', 'monologue'] as const;
export type View = (typeof VIEWS)[number];

/** A curated set, so every daydream's look is one somebody designed (docs/dreams.md, "Risks"). */
export const THEMES = ['rust', 'paper', 'black', 'dusk', 'clinical', 'velvet', 'neon'] as const;
export type Theme = (typeof THEMES)[number];

export type Presentation = { view: View; theme: Theme; notes: string };

function isTheme(value: string | undefined): value is Theme {
	return (THEMES as readonly string[]).includes(value ?? '');
}

/**
 * How sexual it is. The model chooses it from the brief and the user's
 * preferences; it decides which providers can serve the daydream
 * (docs/dreams.md, "Adult-friendly providers"), so it is structure, not prose.
 */
export const HEAT_LEVELS = ['none', 'suggestive', 'steamy', 'explicit'] as const;
export type Heat = (typeof HEAT_LEVELS)[number];

function isHeat(value: string | undefined): value is Heat {
	return (HEAT_LEVELS as readonly string[]).includes(value ?? '');
}

export type Build = {
	title: string;
	heat: Heat;
	telling: string;
	presentation: Presentation;
	capabilities: Capability[];
	elements: DreamElement[];
	/** The opening passage's source, or null if the model never started it. */
	passage: string | null;
};

/** Telling notes go with every passage, so they are capped (docs/dreams.md). */
export const MAX_TELLING_CHARS = 2000;
const BUILD_RAW_TAGS: ReadonlySet<string> = new Set([...DEFAULT_RAW_TAGS, 'passage']);

function isView(value: string | undefined): value is View {
	return (VIEWS as readonly string[]).includes(value ?? '');
}

function readPresentation(nodes: readonly MarkupNode[]): Presentation {
	const tag = findTag(nodes, 'presentation');
	const view = tag?.attrs.view;
	const theme = tag?.attrs.theme?.trim().toLowerCase();
	return {
		view: isView(view) ? view : 'scroll',
		theme: isTheme(theme) ? theme : 'rust',
		notes: tag ? plainText(tag.children).trim() : ''
	};
}

export function parseBuild(text: string, options: { final?: boolean } = {}): Build {
	const nodes = parseMarkup(text, { final: options.final ?? true, rawTags: BUILD_RAW_TAGS });
	const telling = tagText(nodes, 'telling');
	const heat = findTag(nodes, 'heat')?.attrs.level?.trim().toLowerCase();
	return {
		title: tagText(nodes, 'title').slice(0, 80),
		heat: isHeat(heat) ? heat : 'steamy',
		// Too long to send with every passage: keep it whole, but only up to the cap.
		telling: telling.length > MAX_TELLING_CHARS ? telling.slice(0, MAX_TELLING_CHARS) : telling,
		presentation: readPresentation(nodes),
		capabilities: parseCapabilities(tagText(nodes, 'capabilities')),
		elements: parseElements(findTag(nodes, 'elements')?.children ?? []),
		passage: openingPassage(nodes)
	};
}

const FOOTER_OPEN = /<after>/i;

/**
 * The opening passage's source. A model often closes `</passage>` and then
 * writes the footer after it, as if the footer belonged to the whole reply
 * (seen on the first bench run), so a footer outside the passage is taken
 * as the passage's own.
 */
function openingPassage(nodes: readonly MarkupNode[]): string | null {
	const passage = findTag(nodes, 'passage');
	if (!passage) {
		return null;
	}
	const source = plainText(passage.children).trim();
	const strayFooter = nodes.find((node) => node.type === 'tag' && node.name === 'after');
	if (FOOTER_OPEN.test(source) || strayFooter?.type !== 'tag') {
		return source;
	}
	return `${source}\n<after>${plainText(strayFooter.children)}</after>`;
}
