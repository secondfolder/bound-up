import { z } from 'zod';
import { SCENE_SECTIONS } from './blocks';
import { STORY_LINE_LABELS, STORY_LINES, type StoryLine } from './story';

/**
 * Help from the model with a scene, only ever when someone presses a button
 * for it: what the request carries, what each kind of answer looks like, and
 * the words the model is given. Pure and alias-free: the browser builds the
 * request and checks the answer with these, and the server builds the
 * prompt. See docs/scenes.md, "Help from the model".
 *
 * What is sent is the page as the person asking sees it, with anything
 * hidden from them already left out (`visibleText`), so a partner's surprise
 * never reaches the model through them.
 */

/** Long enough for any scene someone plans; a guard on cost, not a limit on writing. */
export const MAX_HELP_PAGE = 8000;

const page = z.string().max(MAX_HELP_PAGE);

export const sceneHelpRequestSchema = z.discriminatedUnion('task', [
	/** What might we have missed? Prompts in the "think about" style. */
	z.object({ task: z.literal('missed'), page }),
	/** More chips for one line of the story. */
	z.object({ task: z.literal('story-chips'), line: z.enum(STORY_LINES), page }),
	/** A menu drawn from what the page says. */
	z.object({ task: z.literal('menu'), page })
]);

export type SceneHelpRequest = z.output<typeof sceneHelpRequestSchema>;
export type SceneHelpTask = SceneHelpRequest['task'];

/* ── answers ─────────────────────────────────────────────────────────────── */

// A model's answer is read leniently, as anything a partner wrote is: what
// does not fit is dropped, not the whole answer.
const shortText = (max: number) =>
	z
		.string()
		.transform((value) => value.trim())
		.pipe(z.string().min(1).max(max));

export const missedAnswerSchema = z.object({
	ideas: z
		.array(
			z.object({
				title: shortText(80),
				why: shortText(240),
				section: z.enum(SCENE_SECTIONS).catch('notes')
			})
		)
		.max(5)
});

export const storyChipsAnswerSchema = z.object({
	// A chip is toggled in and out of a comma-separated line (`toggleChip`).
	chips: z.array(shortText(60).refine((chip) => !chip.includes(','))).max(8)
});

export const menuAnswerSchema = z.object({
	courses: z
		.array(z.object({ name: shortText(40), items: z.array(shortText(80)).min(1).max(8) }))
		.min(1)
		.max(5)
});

export type MissedAnswer = z.output<typeof missedAnswerSchema>;
export type StoryChipsAnswer = z.output<typeof storyChipsAnswerSchema>;
export type MenuAnswer = z.output<typeof menuAnswerSchema>;

export type SceneHelpAnswer =
	| ({ task: 'missed' } & MissedAnswer)
	| ({ task: 'story-chips' } & StoryChipsAnswer)
	| ({ task: 'menu' } & MenuAnswer);

/**
 * The model's text as an answer to `task`, or null for one that is not.
 * A model may wrap its JSON in a code fence or a sentence, so the object is
 * taken from the first brace to the last.
 */
export function parseHelpAnswer(task: SceneHelpTask, text: string): SceneHelpAnswer | null {
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start === -1 || end <= start) {
		return null;
	}
	let raw: unknown;
	try {
		raw = JSON.parse(text.slice(start, end + 1));
	} catch {
		return null;
	}
	switch (task) {
		case 'missed': {
			const parsed = missedAnswerSchema.safeParse(raw);
			return parsed.success ? { task, ...parsed.data } : null;
		}
		case 'story-chips': {
			const parsed = storyChipsAnswerSchema.safeParse(raw);
			return parsed.success ? { task, ...parsed.data } : null;
		}
		case 'menu': {
			const parsed = menuAnswerSchema.safeParse(raw);
			return parsed.success ? { task, ...parsed.data } : null;
		}
		default:
			return null;
	}
}

/* ── the prompt ──────────────────────────────────────────────────────────── */

export const HELP_RULES = [
	'You help consenting adults plan a BDSM or kink scene together, in a private planning app. Explicit adult content is expected and fine.',
	'Everyone involved is an adult. Never suggest anything involving a minor, or anyone who could be read as one: no ages under eighteen, no school-age framing, no childlike bodies or behaviour.',
	'Respect the page. Never suggest anything it lists as a limit, as off the table, or as "say it, don\'t do it" as something to do.',
	'Be warm and plain, in British English. No lecturing, no disclaimers, no jargon a newcomer would not know.',
	'Answer with JSON only, in exactly the shape asked for, and nothing else.'
] as const;

function taskText(request: SceneHelpRequest): string {
	switch (request.task) {
		case 'missed':
			return [
				'Read the scene below and suggest up to five things the people planning it might want to think about that the page does not cover yet: practical, safety or emotional considerations, or ideas that would make it better.',
				'Each is a short question as a title, and one warm sentence on why it might be worth a thought.',
				`Say which part of the plan each belongs to: one of ${SCENE_SECTIONS.join(', ')}.`,
				'Shape: {"ideas":[{"title":"…","why":"…","section":"…"}]}'
			].join('\n');
		case 'story-chips':
			return [
				`Suggest up to eight short phrases for the "${STORY_LINE_LABELS[request.line as StoryLine]}" line of this scene's story, that fit what the page already says and are different from what it has.`,
				'Each phrase is a few words, with no commas.',
				'Shape: {"chips":["…"]}'
			].join('\n');
		case 'menu':
			return [
				'Suggest a menu for this scene: a few courses (for example a warm-up, the main part, something to finish, aftercare), each with a few things to choose from, drawn from what the page says the people want.',
				'Shape: {"courses":[{"name":"…","items":["…"]}]}'
			].join('\n');
		default:
			return '';
	}
}

/** The messages for the model: the rules, then the task and the page. */
export function helpMessages(
	request: SceneHelpRequest
): { role: 'system' | 'user'; content: string }[] {
	return [
		{ role: 'system', content: HELP_RULES.join('\n') },
		{
			role: 'user',
			content: `${taskText(request)}\n\nThe scene so far:\n"""\n${request.page.trim() || '(nothing written yet)'}\n"""`
		}
	];
}
