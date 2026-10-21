import {
	CHARACTER_TEXT_FIELDS,
	type CharacterDials,
	type DaydreamCharacterCopy,
	type DaydreamIdeaCopy,
	type DaydreamNarrator,
	type DaydreamSetup,
	type DaydreamStance,
	type DialValue,
	IDEA_TEXT_FIELDS,
	type PassageLength
} from '$lib/daydream';
import type { ContextTurn } from '$lib/daydream/context';
import type { PictureArchitecture } from '$lib/daydream/image-prompt';
import { DAYDREAM_STARTERS, starterSetup } from '$lib/daydream/starters';
import type { Combo } from '$lib/prompt-review';
import type { ReplyRequest } from '../prompt';
import type { SuggestRequest } from '../suggest-prompt';
import type { BuilderId } from './axes';

/**
 * A combination of axis values (`axes.ts`) turned into the input its builder
 * takes, for the prompt catalogue (docs/prompt-review.md).
 *
 * Every piece of text a user would write comes from a `TextSource`. By
 * default it is a labelled placeholder, `⟦idea.premise⟧`, so a reviewer sees
 * which words are the prompt's own and which are the user's, and so the
 * catalogue's text says nothing about what anyone might write. A ready-made
 * daydream's words can stand in instead (`starterText`), to read a prompt as
 * one would be sent.
 *
 * The inputs are built by hand rather than from the test helpers in
 * `$lib/testing`, which app code may not import; every one is checked against
 * its request schema before it is rendered (`render.ts`), so a combination
 * that no device could send is reported as such rather than reviewed.
 */

export type TextSource = (path: string) => string;

export const placeholderText: TextSource = (path) => `⟦${path}⟧`;

/** The ready-made daydreams that can lend their words, by id. */
export const STARTER_IDS: readonly string[] = DAYDREAM_STARTERS.map((starter) => starter.id);

/** A ready-made daydream's words where it has them, and placeholders for the rest. */
export function starterText(starterId: string): TextSource {
	const starter = DAYDREAM_STARTERS.find((entry) => entry.id === starterId);
	if (!starter) {
		return placeholderText;
	}
	const setup = starterSetup(starter);
	const words = new Map<string, string>();
	setup.characters.forEach((cast, index) => {
		const key = `character${index + 1}`;
		words.set(`${key}.name`, cast.name);
		for (const field of CHARACTER_TEXT_FIELDS) {
			words.set(`${key}.${field}`, cast[field]);
		}
		words.set(`${key}.relationship`, cast.casting.relationship);
		words.set(`${key}.doing`, cast.casting.part);
	});
	words.set('idea.title', setup.idea.title);
	for (const field of IDEA_TEXT_FIELDS) {
		words.set(`idea.${field}`, setup.idea[field]);
	}
	setup.idea.parts.forEach((part, index) => {
		words.set(`part${index + 1}.name`, part.name);
		words.set(`part${index + 1}.description`, part.description);
	});
	words.set('brief', starter.summary.replace(SUMMARY_BLANK, '$<words>'));
	return (path) => {
		const value = words.get(path)?.trim();
		return value ? value : placeholderText(path);
	};
}

/** A summary's `[[key|words]]` blank, for its words alone. */
const SUMMARY_BLANK = /\[\[[^|\]]+\|(?<words>[^\]]+)\]\]/g;

const PART_IDS = ['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2'];

const dial = (value: string | undefined): DialValue | null =>
	value === undefined || value === 'unset' ? null : (Number(value) as DialValue);

function characterDials(combo: Combo): CharacterDials {
	const tone = combo['char.tone'];
	return {
		tone: tone === undefined || tone === 'unset' ? null : (tone as CharacterDials['tone']),
		control: dial(combo['char.control']),
		strictness: dial(combo['char.strictness']),
		edge: dial(combo['char.edge']),
		talk: dial(combo['char.talk']),
		libido: dial(combo['char.libido']),
		kink: dial(combo['char.kink'])
	};
}

function character(
	text: TextSource,
	index: number,
	all: boolean,
	dials: CharacterDials | null
): DaydreamCharacterCopy {
	const key = `character${index + 1}`;
	const field = (name: string) => (all ? text(`${key}.${name}`) : '');
	return {
		sourceId: null,
		sourceRevision: null,
		name: text(`${key}.name`),
		archetype: field('archetype'),
		personality: field('personality'),
		speech: field('speech'),
		appearance: field('appearance'),
		likes: field('likes'),
		notes: field('notes'),
		dials: dials ?? characterDials({}),
		casting: {
			partId: PART_IDS[index] ?? null,
			relationship: field('relationship'),
			part: field('doing')
		}
	};
}

function idea(text: TextSource, combo: Combo, characterCount: number): DaydreamIdeaCopy {
	const all = combo.text !== 'minimal';
	const field = (name: string) => (all ? text(`idea.${name}`) : '');
	return {
		sourceId: null,
		sourceRevision: null,
		title: text('idea.title'),
		setting: field('setting'),
		premise: text('idea.premise'),
		yourRole: field('yourRole'),
		tone: field('tone'),
		notes: field('notes'),
		brief: combo.origin === 'none' ? '' : text('brief'),
		research: combo.origin === 'brief+research' ? text('research') : '',
		parts: Array.from({ length: characterCount }, (_, index) => ({
			id: PART_IDS[index] ?? '',
			name: text(`part${index + 1}.name`),
			description: all ? text(`part${index + 1}.description`) : ''
		})),
		dials: { heat: dial(combo.heat), kink: dial(combo.kink) }
	};
}

function replySetup(text: TextSource, combo: Combo): DaydreamSetup {
	const count = Number(combo.characters);
	const all = combo.text !== 'minimal';
	const stance = combo.stance as DaydreamStance;
	return {
		title: text('title'),
		voice: {
			narrator: combo.narrator as DaydreamNarrator,
			stance,
			protagonistName: stance === 'persona' ? text('protagonistName') : ''
		},
		characters: Array.from({ length: count }, (_, index) =>
			character(text, index, all, index === 0 ? characterDials(combo) : null)
		),
		idea: idea(text, combo, count),
		lead: combo.lead as DaydreamSetup['lead'],
		limits: combo.limits === 'set' ? text('limits') : '',
		dials: {
			intensity: Number(combo.intensity) as DialValue,
			pace: Number(combo.pace) as DialValue,
			length: combo.length as PassageLength
		},
		pictures: { on: combo.pictures !== 'none', style: 'photo' }
	};
}

const DIRECTIONS = [
	{ id: 'slower', label: 'Slower' },
	{ id: 'tease', label: 'Tease me' }
];

/**
 * One conversation with every kind of turn in it, so a reply's history shows
 * how each is put to the model. Turns are rendered one at a time
 * (`render` in prompt.ts), so one of each covers them all.
 */
function conversation(text: TextSource): ContextTurn[] {
	const story = (n: number, extra: Partial<Extract<ContextTurn, { type: 'text' }>> = {}) =>
		({ type: 'text', role: 'story', text: text(`turn.story${n}`), ...extra }) as const;
	const user = (n: number, extra: Partial<Extract<ContextTurn, { type: 'text' }>> = {}) =>
		({ type: 'text', role: 'user', text: text(`turn.user${n}`), ...extra }) as const;
	return [
		{ type: 'omitted' },
		story(1, { buttons: DIRECTIONS, image: text('turn.image') }),
		user(1),
		story(2, { expansion: text('turn.expansion'), buttons: DIRECTIONS }),
		{ type: 'reaction', reaction: 'love', of: null },
		user(2, { readAs: 'action' }),
		story(3),
		user(3, { readAs: 'instruction' }),
		story(4),
		user(4, { readAs: 'direction' }),
		story(5),
		user(5, { readAs: 'cowrite' }),
		story(6),
		user(6, { readAs: 'ooc' }),
		story(7, { ooc: true }),
		{ type: 'direction', label: 'Slower' },
		story(8),
		{ type: 'steer', action: 'more', quote: text('turn.quote1') },
		story(9),
		{ type: 'steer', action: 'not-this', quote: text('turn.quote2') },
		story(10, {
			rewrite: {
				targetText: text('turn.story9'),
				quote: text('turn.quote3'),
				instruction: text('turn.instruction1')
			}
		}),
		{ type: 'steer', action: 'rewrite', quote: text('turn.quote4') },
		story(11),
		{ type: 'reaction', reaction: 'like', of: text('turn.excerpt').slice(0, 60) },
		{ type: 'reaction', reaction: 'not-for-me', of: null },
		{ type: 'roll', sides: 6, result: 4, outcome: text('turn.outcome').slice(0, 80) },
		story(12),
		{ type: 'safety', signal: 'yellow' },
		story(13),
		{ type: 'safety', signal: 'resume' },
		story(14),
		user(7)
	];
}

export type ReplyInput = { request: ReplyRequest; pictures: PictureArchitecture | null };

export function replyInput(combo: Combo, text: TextSource): ReplyInput {
	const setup = replySetup(text, combo);
	const base = { setup, currentDirections: DIRECTIONS };
	const pictures = combo.pictures === 'none' ? null : (combo.pictures as PictureArchitecture);
	switch (combo.state) {
		case 'opening':
			return { request: { ...base, mode: 'opening', turns: [] }, pictures };
		case 'rewrite':
			return {
				request: {
					...base,
					mode: 'rewrite',
					turns: conversation(text),
					rewrite: {
						targetText: text('turn.rewriteTarget'),
						quote: text('turn.rewriteQuote'),
						instruction: text('turn.rewriteInstruction')
					}
				},
				pictures
			};
		case 'stopped':
			return {
				request: {
					...base,
					mode: 'reply',
					turns: [...conversation(text), { type: 'safety', signal: 'red' }]
				},
				pictures
			};
		default:
			return { request: { ...base, mode: 'reply', turns: conversation(text) }, pictures };
	}
}

const sideOf = (combo: Combo) => (combo.side === 'either' ? null : (combo.side as 'dom' | 'sub'));

const limitsOf = (combo: Combo, text: TextSource) => (combo.limits === 'set' ? text('limits') : '');

/** A brief, with a link in it when the combination has one. */
function brief(combo: Combo, text: TextSource): string {
	return combo.links === 'none'
		? text('brief')
		: `${text('brief')} https://example.com/linked-page`;
}

const contextNarrator = (combo: Combo) =>
	combo.narrator === 'unset' || combo.narrator === undefined
		? undefined
		: (combo.narrator as DaydreamNarrator);

function contextOf(combo: Combo, text: TextSource) {
	return {
		characters:
			combo.cast === 'some'
				? [
						{ name: text('character1.name'), archetype: text('character1.archetype') },
						{ name: text('character2.name'), archetype: '' }
					]
				: [],
		limits: limitsOf(combo, text),
		...(combo.story === 'yes'
			? { story: { intensity: 3, pace: 3, length: 'medium' } as const }
			: {}),
		...(contextNarrator(combo) ? { narrator: contextNarrator(combo) } : {})
	};
}

const ideaDials = (combo: Combo) => ({
	heat: combo.rated === 'heat' || combo.rated === 'both' ? (3 as const) : null,
	kink: combo.rated === 'kink' || combo.rated === 'both' ? (3 as const) : null
});

export type SuggestInput = { request: SuggestRequest; canReadLinks: boolean };

/** A suggestion request, for every builder but the replies. */
export function suggestInput(
	builder: Exclude<BuilderId, 'reply'>,
	combo: Combo,
	text: TextSource
): SuggestInput {
	const canReadLinks = combo.links === 'read';
	switch (builder) {
		case 'daydream':
			return {
				request: {
					task: 'daydream',
					brief: brief(combo, text),
					side: sideOf(combo),
					voice: combo.voice === 'choose' ? null : (combo.voice as 'talk'),
					...(combo.chosen === 'yes'
						? { chosen: { title: text('chosen.title'), premise: text('chosen.premise') } }
						: {}),
					...(combo.research === 'yes' ? { research: text('research') } : {}),
					limits: limitsOf(combo, text)
				},
				canReadLinks
			};
		case 'ideas':
			return {
				request: {
					task: 'ideas',
					brief: brief(combo, text),
					side: sideOf(combo),
					limits: limitsOf(combo, text),
					offered: combo.offered === 'some' ? [text('offered1'), text('offered2')] : []
				},
				canReadLinks
			};
		case 'fill':
		case 'surprise-idea':
		case 'chips': {
			const target = builder === 'surprise-idea' ? 'idea' : (combo.target as 'character' | 'idea');
			const half = builder === 'fill' && combo.written === 'half';
			const draft =
				target === 'character'
					? {
							name: text('character1.name'),
							...(half ? { personality: text('character1.personality') } : {}),
							...(builder === 'chips'
								? { [combo.field ?? '']: text(`character1.${combo.field}`) }
								: {})
						}
					: {
							title: text('idea.title'),
							...(half ? { premise: text('idea.premise') } : {}),
							...(builder === 'chips' ? { [combo.field ?? '']: text(`idea.${combo.field}`) } : {}),
							...(combo.parts === 'some'
								? {
										parts: [{ name: text('part1.name'), description: text('part1.description') }]
									}
								: {})
						};
			return {
				request: {
					task: builder,
					target,
					...(builder === 'chips' ? { field: combo.field } : {}),
					draft,
					...(target === 'character'
						? { dials: characterDials(combo) }
						: { ideaDials: ideaDials(combo) }),
					context: contextOf(combo, text)
				} as SuggestRequest,
				canReadLinks: false
			};
		}
		case 'casting':
			return {
				request: {
					task: 'casting',
					character: {
						name: text('character1.name'),
						archetype: text('character1.archetype'),
						personality: text('character1.personality')
					},
					idea: {
						title: text('idea.title'),
						premise: text('idea.premise'),
						setting: text('idea.setting')
					},
					part:
						combo.part === 'some'
							? { name: text('part1.name'), description: text('part1.description') }
							: null,
					others:
						combo.others === 'some'
							? [{ name: text('character2.name'), part: text('part2.name') }]
							: [],
					stance: combo.stance as DaydreamStance,
					limits: limitsOf(combo, text)
				},
				canReadLinks: false
			};
		case 'name':
			return {
				request: {
					task: 'name',
					idea: { title: text('idea.title'), premise: text('idea.premise') },
					characters:
						combo.characters === 'some' ? [text('character1.name'), text('character2.name')] : [],
					opening: text('opening'),
					limits: limitsOf(combo, text)
				},
				canReadLinks: false
			};
		default:
			return builder satisfies never;
	}
}
