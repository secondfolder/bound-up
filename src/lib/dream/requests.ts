/**
 * What the browser posts to the engine's model endpoints, checked by the
 * server before anything is sent on (docs/dreams.md, "What the server
 * sees"). The browser sends plaintext because the model needs the words and
 * the server cannot open the sealed copies; these schemas bound its size and
 * shape, and nothing else is read from it.
 *
 * Pure and alias-free, so the page and the server share them.
 */

import { z } from 'zod';
import {
	dreamElementSchema,
	MAX_AMENDMENT_CHARS,
	MAX_AMENDMENTS,
	MAX_BRIEF_CHARS,
	MAX_INPUT_CHARS,
	MAX_PASSAGE_CHARS,
	MAX_SUMMARY_CHARS
} from '../sealed-kinds/dreams';
import { HEAT_LEVELS, MAX_TELLING_CHARS, THEMES, VIEWS } from './build';
import { CAPABILITIES } from './capabilities';
import { MAX_ELEMENTS } from './elements';

const required = (max: number) => z.string().trim().min(1).max(max);
const strings = (max: number, count: number) => z.array(required(max)).max(count);

/** The most passages sent word for word: the rest go as scene summaries. */
export const MAX_HISTORY = 16;
/** The most scene summaries sent. */
export const MAX_SUMMARIES = 60;

const limits = strings(200, 60);
const preferences = strings(300, 80);
const nudges = z.array(z.object({ dimension: required(40), text: required(200) })).max(6);

export const readRequestSchema = z.object({
	brief: required(MAX_BRIEF_CHARS),
	amendments: strings(MAX_AMENDMENT_CHARS, MAX_AMENDMENTS),
	answer: z.object({ question: required(400), answer: required(400) }).nullable(),
	limits,
	preferences,
	recentDirections: strings(400, 20),
	nudges
});

export type ReadRequest = z.output<typeof readRequestSchema>;

export const buildRequestSchema = z.object({
	brief: required(MAX_BRIEF_CHARS),
	amendments: strings(MAX_AMENDMENT_CHARS, MAX_AMENDMENTS),
	musts: strings(400, 20),
	research: z.string().max(8000),
	direction: required(1000).nullable(),
	nudges,
	limits,
	preferences,
	recentNames: strings(80, 40),
	/** The build being changed, without its passage. */
	previous: z.string().max(40_000).nullable()
});

export type BuildRequest = z.output<typeof buildRequestSchema>;

const SLUG = /^[\w-]{1,40}$/;
const slug = z.string().regex(SLUG);
const turnExtras = {
	choices: z
		.array(z.object({ id: slug, value: required(200) }))
		.max(20)
		.optional(),
	fields: z
		.array(z.object({ block: slug, name: required(60), value: z.string().max(1000) }))
		.max(30)
		.optional()
};

const userTurnSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('continue'), ...turnExtras }),
	z.object({ kind: z.literal('words'), text: required(MAX_INPUT_CHARS), ...turnExtras })
]);

const setupSchema = z.object({
	heat: z.enum(HEAT_LEVELS),
	telling: z.string().max(MAX_TELLING_CHARS),
	capabilities: z.array(z.enum(CAPABILITIES)),
	elements: z.array(dreamElementSchema).max(MAX_ELEMENTS),
	presentation: z.object({
		view: z.enum(VIEWS),
		theme: z.enum(THEMES),
		notes: z.string().max(400)
	}),
	musts: strings(400, 20),
	research: z.string().max(8000)
});

export const passageRequestSchema = z.object({
	setup: setupSchema,
	limits,
	preferences,
	history: z
		.array(z.object({ passage: z.string().max(MAX_PASSAGE_CHARS), turn: userTurnSchema }))
		.max(MAX_HISTORY),
	summaries: strings(MAX_SUMMARY_CHARS, MAX_SUMMARIES),
	/** A passage to write again in new words, or null for a new one. */
	take: z.string().max(MAX_PASSAGE_CHARS).nullable(),
	repeated: strings(80, 12),
	/** A passage turned down with "Different direction". */
	notThis: z.string().max(MAX_PASSAGE_CHARS).nullable().optional(),
	/** The direction code picked for it. */
	steer: z.string().trim().max(1000).nullable().optional()
});

export type PassageRequest = z.output<typeof passageRequestSchema>;

const shared = {
	telling: z.string().max(MAX_TELLING_CHARS),
	limits
};

export const fillRequestSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('elements'),
		...shared,
		elements: z.array(dreamElementSchema).max(MAX_ELEMENTS),
		passages: z.array(z.string().max(MAX_PASSAGE_CHARS)).min(1).max(3),
		focus: z.string().max(40).nullable()
	}),
	z.object({
		kind: z.literal('more'),
		...shared,
		passage: z.string().max(MAX_PASSAGE_CHARS),
		phrase: required(400)
	}),
	z.object({
		kind: z.literal('summary'),
		...shared,
		passages: z.array(z.string().max(MAX_PASSAGE_CHARS)).min(1).max(MAX_HISTORY)
	})
]);

export type FillRequest = z.output<typeof fillRequestSchema>;

/** What a fill answers with: the model's reply, which the page reads. */
export type FillResponse = { text: string };
