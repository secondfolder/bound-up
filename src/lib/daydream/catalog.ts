/**
 * The curated suggestions for making characters and ideas: chips for each
 * field, and starter templates to begin from.
 *
 * Built in rather than asked of the model, so the common choices are instant,
 * free, and never leave the device; "More ideas" asks the model for the
 * rest (`api/daydreams/suggest`). Chips are phrases that toggle in the free
 * text (`chips.ts`), so they read as things a person might have written.
 *
 * Content, like the seed prose: data rather than logic. It is weighted
 * towards sex and kink, because that is what people come to a kink app's
 * daydreams for: the archetypes, premises and acts are the ones popular
 * erotic fantasy returns to most (docs/daydreams.md, "What the presets are
 * drawn from"). It still runs the
 * whole range, with a few tame entries kept beside the explicit ones so a
 * story can start slow, and the starting points are ordered by heat and say
 * theirs on their buttons (`ideaLevel`, `characterLevel`), so nobody has to
 * guess what they are picking. Every character is an adult. The starting
 * points themselves are in `presets/`, a module per theme; this gathers
 * them. Pure and alias-free.
 */

import {
	type CharacterTextField,
	characterFromFlat,
	type DaydreamCasting,
	type DaydreamCharacter,
	type DaydreamField,
	type DaydreamNarrator,
	type FieldKind,
	type IdeaOpening,
	type IdeaOriginField,
	type IdeaPart,
	type IdeaTextField,
	type IdeaTracker,
	type IdeaWithoutOrigin,
	ideaFromFlat
} from '../daydream';
import { PRESET_CHARACTERS, PRESET_IDEAS } from './presets';
import type { FieldExtras, WithoutId } from './presets/types';

/**
 * Every character text the app knows: the core (type, appearance) and the
 * known kinds of field. Personality, how they talk and what they enjoy were
 * fixed fields once; what they hide, what they won't do and how they are won
 * over go beyond a standard sheet, and are what makes someone a person
 * (docs/daydreams.md, "Fields").
 */
export const CHARACTER_FIELD_LABELS: Readonly<
	Record<CharacterTextField, { label: string; hint: string }>
> = {
	archetype: { label: 'Type', hint: 'The kind of person they are, in a few words' },
	appearance: { label: 'Appearance', hint: 'What you notice about them' },
	personality: { label: 'Personality', hint: 'How they think and behave' },
	speech: { label: 'How they talk', hint: 'Their voice, their words, their habits' },
	likes: { label: 'What they enjoy', hint: 'What they want, given the chance' },
	hides: { label: 'What they hide', hint: 'What they keep from you, or from everyone' },
	wontDo: { label: 'What they won’t do', hint: 'Their own limits, whatever is asked' },
	wonOver: { label: 'How they’re won over', hint: 'What it takes to get close to them' },
	notes: { label: 'Anything else', hint: 'Whatever the rest leaves out' }
};

export const CHARACTER_CHIPS: Readonly<Record<CharacterTextField, readonly string[]>> = {
	archetype: [
		'best friend with a secret crush',
		'competitive rival',
		'strict boss',
		'strict mentor',
		'gentle dom',
		'mommy dom',
		'daddy dom',
		'brat',
		'brat tamer',
		'tsundere',
		'yandere',
		'possessive lover',
		'roommate',
		'experienced older lover',
		'tomboy',
		'goth',
		'shy virgin',
		'masked stranger',
		'demon',
		'succubus',
		'incubus',
		'vampire',
		'werewolf',
		'monster',
		'devoted servant',
		'shameless flirt',
		'sadistic dom',
		'eager submissive',
		'pain slut',
		'kinky switch',
		'keyholder',
		'hypnotist',
		'pet owner',
		'interrogator',
		'masked intruder',
		'bull'
	],
	personality: [
		'kind',
		'witty',
		'patient',
		'flustered',
		'smug',
		'bratty',
		'demanding',
		'calm',
		'mischievous',
		'protective',
		'possessive',
		'jealous',
		'obsessive',
		'praising',
		'cruel then tender',
		'quietly intense',
		'barely holding back',
		'flirtatious',
		'horny all the time',
		'shameless',
		'sadistic',
		'desperate to please',
		'ruthless in the role',
		'methodical',
		'smug about your frustration'
	],
	speech: [
		'speaks softly',
		'dry humour',
		'short and clipped',
		'never raises their voice',
		'teases constantly',
		'insults that sound like flirting',
		'formal and precise',
		'uses pet names',
		'calls you good girl or good boy',
		'whispers in your ear',
		'growls more than talks',
		'makes you say please',
		'counts out loud',
		'talks dirty',
		'narrates what they will do to you',
		'begs',
		'degrading names',
		'speaks to you like a pet',
		'slow and hypnotic',
		'asks the same question again and again',
		'few words and all of them threats'
	],
	appearance: [
		'tall',
		'freckles',
		'sharp suit',
		'tattoos',
		'reading glasses',
		'leather gloves',
		'an easy smile',
		'a stare that does not blink',
		'much bigger than you',
		'strong hands',
		'a mask',
		'horns and a tail',
		'fangs',
		'lingerie under everything',
		'a collar',
		'nipple piercings',
		'leather harness',
		'rope marks on their wrists',
		'a key on a chain',
		'a leash in one hand',
		'a balaclava'
	],
	likes: [
		'banter',
		'slow build-up',
		'kissing',
		'teasing',
		'praise kink',
		'aftercare',
		'rules and rituals',
		'making you wait',
		'being obeyed',
		'making you beg',
		'dirty talk',
		'oral',
		'riding',
		'rough sex',
		'breeding',
		'marking you as theirs',
		'size difference',
		'the chase',
		'consensual non-consent',
		'being watched',
		'sharing you',
		'spanking',
		'choking',
		'bondage',
		'edging',
		'orgasm denial',
		'overstimulation',
		'hypnosis',
		'free use',
		'degradation',
		'impact play',
		'using you',
		'anal',
		'anal training',
		'plugs',
		'chastity',
		'ruined orgasms',
		'forced orgasms',
		'pet play',
		'trigger words',
		'gangbangs',
		'cuckolding',
		'sensory deprivation',
		'struggle',
		'objectification'
	],
	hides: [
		'a crush on you',
		'how lonely they are',
		'that they want to be the one on their knees',
		'how much they think about you',
		'a second life online',
		'that this was planned',
		'how close they are to giving in',
		'a soft side',
		'a filthier streak than they let on',
		'that they have done this before'
	],
	wontDo: [
		'kissing on the mouth',
		'saying they love you',
		'begging',
		'being rushed',
		'anything in public',
		'sharing you',
		'letting you take charge',
		'breaking a rule they set',
		'being told no twice'
	],
	wonOver: [
		'patience',
		'being made to laugh',
		'obedience',
		'being challenged',
		'honesty',
		'slow and earned',
		'being chosen over everyone else',
		'never at all (or so they say)'
	],
	notes: []
};

/** The casting fields a person writes in: who a character is in this story. */
export const CASTING_FIELD_LABELS: Readonly<
	Record<Exclude<keyof DaydreamCasting, 'partId'>, { label: string; hint: string }>
> = {
	relationship: { label: 'Who they are to you', hint: 'In this daydream: how you know each other' },
	part: { label: 'Their part in this', hint: 'What they are doing, or want, as it starts' }
};

export const CASTING_CHIPS: Readonly<
	Record<Exclude<keyof DaydreamCasting, 'partId'>, readonly string[]>
> = {
	relationship: [
		'your partner',
		'your best friend',
		'your boss',
		'your coworker',
		'a stranger you just met',
		'your rival',
		'your roommate',
		'your neighbour',
		'your ex',
		'your personal trainer',
		'a hookup from an app',
		'the demon you summoned',
		'your owner',
		'your sub',
		'your keyholder',
		'your hypnotist',
		'the bull your partner chose',
		'your captor'
	],
	part: [
		'finally saying it',
		'testing you',
		'setting the rules',
		'collecting on a debt',
		'watching closely',
		'making you wait',
		'pretending not to be jealous',
		'about to lose patience',
		'trying to seduce you',
		'desperate to get you into bed',
		'making you beg',
		'claiming you',
		'chasing you',
		'sharing you',
		'punishing you',
		'training you'
	]
};

type FieldLabels = Readonly<Record<IdeaTextField, { label: string; hint: string }>>;

export const IDEA_FIELD_LABELS: FieldLabels = {
	setting: { label: 'Where', hint: 'The place it happens' },
	premise: { label: 'What it’s about', hint: 'What’s going on as it starts' },
	yourRole: { label: 'Your part', hint: 'Who you are in it, if you are in it' },
	tone: { label: 'Tone', hint: 'How it should feel' },
	notes: { label: 'Anything else', hint: 'Whatever the rest leaves out' }
};

/**
 * The same fields as a monologue reads them (docs/daydreams.md, "Ideas"): it
 * has no plot for "what's going on as it starts" to describe, and its notes
 * are the sayings it is built from, which the reply prompt sends as written.
 */
const MONOLOGUE_FIELD_LABELS: FieldLabels = {
	setting: { label: 'Where', hint: 'Where it is set, if anywhere' },
	premise: { label: 'What it’s about', hint: 'What the voice believes, and keeps coming back to' },
	yourRole: { label: 'Who you are to it', hint: 'Who it speaks to, or whose inner voice it is' },
	tone: { label: 'Tone', hint: 'How it sounds' },
	notes: {
		label: 'Sayings to build on',
		hint: 'Lines it starts from, one to a line, and anything else'
	}
};

/**
 * Where an idea came from, as the idea dialog shows it. The same for a
 * monologue as a story: neither field is read differently for one.
 */
export const IDEA_ORIGIN_LABELS: Readonly<
	Record<IdeaOriginField, { label: string; hint: string }>
> = {
	brief: {
		label: 'What you asked for',
		hint: 'The words this idea was written from, as you typed them'
	},
	research: {
		label: 'Background',
		hint: 'What was found and thought through as it was written, from any pages you linked'
	}
};

/** The idea's field labels for how the daydream is told: a monologue's own, or the usual. */
export function ideaFieldLabels(narrator: DaydreamNarrator | undefined): FieldLabels {
	return narrator === 'monologue' ? MONOLOGUE_FIELD_LABELS : IDEA_FIELD_LABELS;
}

/**
 * A field's name as the screens and the model read it: a known kind's from
 * the catalog — a monologue's notes as its sayings — or the one its user gave
 * it.
 */
export function fieldLabel(
	field: Pick<DaydreamField, 'kind' | 'label'>,
	of: 'character' | 'idea',
	narrator?: DaydreamNarrator
): string {
	if (field.kind === null) {
		return field.label;
	}
	if (of === 'character') {
		return CHARACTER_FIELD_LABELS[field.kind as CharacterTextField].label;
	}
	return ideaFieldLabels(narrator)[field.kind as IdeaTextField].label;
}

export const IDEA_CHIPS: Readonly<Record<IdeaTextField, readonly string[]>> = {
	setting: [
		'a snowed-in lodge',
		'an empty office after hours',
		'a shared apartment',
		'a hotel room',
		'a gym after closing',
		'a crowded night train',
		'a masquerade party',
		'a forest at night',
		'a summoning circle',
		'a vampire’s castle',
		'a training facility',
		'home on a quiet evening',
		'a sex club',
		'a dungeon',
		'a play party',
		'using you whenever they like',
		'keeping you locked',
		'breaking you',
		'playing a stranger',
		'a shared house with one rule',
		'a holding cell',
		'a room booked for a gangbang'
	],
	premise: [
		'snowed in with only one bed',
		'a confession years too late',
		'rivals forced to work together',
		'kept late after a mistake',
		'a bet you lost',
		'a contract to sign',
		'a deal with a demon',
		'a punishment long overdue',
		'a brat about to be tamed',
		'a test you have to pass',
		'a chase you agreed to',
		'a threesome you finally said yes to',
		'trying for a baby',
		'a hookup with no names',
		'a weekend of free use',
		'a night of being used',
		'an anal-only arrangement',
		'locked in chastity',
		'a weekend as their pet',
		'conditioned with trigger words',
		'a home invasion you scripted together',
		'a gangbang you signed up for',
		'captured and interrogated',
		'made to watch your partner with someone else'
	],
	yourRole: [
		'yourself',
		'the new hire',
		'the one who lost the bet',
		'a guest',
		'the brat',
		'the prey',
		'the one who summoned it',
		'the trainee',
		'the one being shared',
		'the one in charge for once',
		'the sub',
		'the toy for the night',
		'the pet',
		'the one locked up',
		'the free-use toy',
		'the captive',
		'the one watching'
	],
	tone: [
		'romantic',
		'slow-burn',
		'playful',
		'tender',
		'tense',
		'possessive',
		'strict',
		'clinical',
		'dark',
		'primal',
		'steamy',
		'humiliating',
		'filthy',
		'brutal',
		'degrading',
		'relentless',
		'ritual'
	],
	notes: []
};

/**
 * A fixed id for a starting point's field of its own, from its template and
 * label: the same each time the template is used, as a known kind's is
 * (`KNOWN_FIELD_IDS`), and shaped as every client id is. Two 32-bit FNV-1a
 * hashes, so it needs no crypto and runs anywhere.
 */
export function ownFieldId(seed: string): string {
	const hash = (offset: number) => {
		let value = offset;
		for (const char of seed) {
			value = Math.imul(value ^ (char.codePointAt(0) ?? 0), 0x01_00_01_93) >>> 0;
		}
		return value.toString(16).padStart(8, '0');
	};
	const hex = `${hash(0x81_1c_9d_c5)}${hash(0x05_0c_5d_1f)}${hash(0x2b_99_24_17)}${hash(0x6a_09_e6_67)}`;
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** A starting point's fields with its extras: the known ones it marks as spoilers, then its own. */
function withExtras<Kind extends FieldKind>(
	fields: readonly DaydreamField<Kind>[],
	{ spoilers = [], own = [] }: FieldExtras<Kind>,
	seed: string
): DaydreamField<Kind>[] {
	return [
		...fields.map((field) =>
			field.kind !== null && spoilers.includes(field.kind) ? { ...field, spoiler: true } : field
		),
		...own.map((field) => ({
			id: ownFieldId(`${seed}:${field.label}`),
			kind: null,
			label: field.label,
			value: field.value,
			spoiler: field.spoiler ?? false
		}))
	];
}

/**
 * Starting points for a new character: a full set of fields to edit from.
 * Ordered by libido, from SFW to slutty, as the dialog shows them (a stable
 * sort, so a module's order holds within a level).
 */
export const CHARACTER_TEMPLATES: readonly {
	id: string;
	label: string;
	character: DaydreamCharacter;
}[] = [...PRESET_CHARACTERS]
	.sort((a, b) => (a.character.dials.libido ?? 0) - (b.character.dials.libido ?? 0))
	.map(({ character: { spoilers, own, ...flat }, ...rest }) => {
		const character = characterFromFlat(flat);
		return {
			...rest,
			character: {
				...character,
				fields: withExtras(character.fields, { spoilers, own }, `character:${rest.id}`)
			}
		};
	});

/**
 * A starting point's idea. Its parts, openings and trackers have no ids: each
 * use gives them fresh ones (`withIds` in `DaydreamIdeaDialog`, and
 * `assembleSetup`), as ones made by hand get.
 */
export type IdeaTemplate = Omit<IdeaWithoutOrigin, 'parts' | 'openings' | 'trackers'> & {
	parts: WithoutId<IdeaPart>[];
	openings: WithoutId<IdeaOpening>[];
	trackers: WithoutId<IdeaTracker>[];
};

/**
 * Starting points for a new idea, ordered by heat, from SFW to filthy (a
 * stable sort, so a module's order holds within a heat).
 */
export const IDEA_TEMPLATES: readonly { id: string; label: string; idea: IdeaTemplate }[] = [
	...PRESET_IDEAS
]
	.sort((a, b) => (a.idea.dials.heat ?? 0) - (b.idea.dials.heat ?? 0))
	.map(({ idea: { spoilers, own, ...texts }, ...rest }) => {
		const idea = ideaFromFlat({
			...texts,
			openings: texts.openings ?? [],
			trackers: texts.trackers ?? []
		});
		return {
			...rest,
			idea: { ...idea, fields: withExtras(idea.fields, { spoilers, own }, `idea:${rest.id}`) }
		};
	});
