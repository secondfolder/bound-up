/**
 * Whole daydreams to start from: the ready-made stories on the new-daydream
 * page, and the assembly that turns a story described in pieces — by one of
 * those, or by the model from a sentence the user wrote — into a setup the
 * form can open.
 *
 * Ready-made stories are built from the starting points in `catalog.ts`
 * rather than written out again: a scene template, a voice, and character
 * templates cast into the scene's parts, with who they are in this story
 * written here, since that depends on the story (docs/daydreams.md,
 * "Characters, scenes and casting"). Like the rest of the catalog they run
 * the whole range, in order of heat, and say their level.
 *
 * Pure and alias-free.
 */

import {
	DAYDREAM_VOICE_PRESETS,
	type DaydreamCharacter,
	type DaydreamScene,
	type DaydreamSetup,
	type DaydreamVoicePresetId,
	DEFAULT_STORY_DIALS,
	EMPTY_CASTING,
	inferVoice,
	MAX_DAYDREAM_CHARACTERS,
	voiceProblem
} from '../daydream';
import { CHARACTER_TEMPLATES, SCENE_TEMPLATES } from './catalog';
import type { SuggestedPart } from './suggestions';

/** One person in a story described in pieces, and who they are in it. */
export type StoryCast = {
	character: DaydreamCharacter;
	/** The name of the scene's part they play, or null for none in particular. */
	partName: string | null;
	relationship: string;
	/** What they are doing, or want, as it starts: the casting's `part`. */
	doing: string;
};

/** A story described in pieces, before it has ids or a voice that is sure to work. */
export type StoryPieces = {
	/** Null to have it follow who is in it (`inferVoice`). */
	voice: DaydreamVoicePresetId | null;
	scene: Omit<DaydreamScene, 'parts'> & { parts: readonly SuggestedPart[] };
	cast: readonly StoryCast[];
};

/**
 * A setup from a story in pieces. Parts get fresh ids, each person is cast
 * into the part named for them if it is still free (by name, ignoring case),
 * and a voice that cannot work with who is in it — watching nobody, say —
 * gives way to the one that follows them. Nothing is from the library, so
 * every copy is one with no source.
 */
export function assembleSetup(
	pieces: StoryPieces,
	newId: () => string = () => crypto.randomUUID()
): DaydreamSetup {
	const parts = pieces.scene.parts.map((part) => ({ ...part, id: newId() }));
	const taken = new Set<string>();
	const cast = pieces.cast.slice(0, MAX_DAYDREAM_CHARACTERS);
	const characters = cast.map(({ character, partName, relationship, doing }) => {
		const part = parts.find(
			(candidate) =>
				!taken.has(candidate.id) &&
				partName !== null &&
				candidate.name.toLocaleLowerCase() === partName.trim().toLocaleLowerCase()
		);
		if (part) {
			taken.add(part.id);
		}
		return {
			...structuredClone(character),
			sourceId: null,
			sourceRevision: null,
			casting: { ...EMPTY_CASTING, partId: part?.id ?? null, relationship, part: doing }
		};
	});

	const chosen = DAYDREAM_VOICE_PRESETS.find((preset) => preset.id === pieces.voice);
	const unnamed = { narrator: 'none', stance: 'self', protagonistName: '' } as const;
	const voice = chosen ? { ...unnamed, ...chosen.voice } : inferVoice(unnamed, characters.length);

	return {
		title: '',
		voice:
			voiceProblem(voice, characters.length) === null
				? voice
				: inferVoice(voice, characters.length),
		characters,
		scene: { ...pieces.scene, parts, sourceId: null, sourceRevision: null },
		lead: 'character',
		limits: '',
		dials: DEFAULT_STORY_DIALS
	};
}

// ── ready-made stories ───────────────────────────────────────────────────────

/** The user's side in a ready-made story. */
export type StarterSide = 'dom' | 'sub';

export type DaydreamStarter = {
	id: string;
	/**
	 * Which side the user is on: the dom, the sub, or null for a story with
	 * no one in charge. The start page's "You as" filter goes by it.
	 */
	you: StarterSide | null;
	/** Its kinks and tropes, a word or two each, shown on its card so it can be picked at a glance. */
	tags: readonly string[];
	voice: DaydreamVoicePresetId;
	/** A `SCENE_TEMPLATES` id. */
	scene: string;
	cast: readonly {
		/** A `CHARACTER_TEMPLATES` id. */
		character: string;
		/** The name of the scene template's part they play. */
		part: string;
		relationship: string;
		doing: string;
	}[];
};

/** Ready-made stories, in the scenes' order: by heat, the one SFW slow burn first. */
export const DAYDREAM_STARTERS: readonly DaydreamStarter[] = [
	{
		id: 'one-bed',
		you: null,
		tags: ['friends to lovers', 'slow burn', 'one bed'],
		voice: 'talk',
		scene: 'one-bed',
		cast: [
			{
				character: 'best-friend',
				part: 'the best friend',
				relationship: 'your best friend for ten years',
				doing: 'insisting the one bed is fine, and lying about why they booked it'
			}
		]
	},
	{
		id: 'masquerade',
		you: null,
		tags: ['strangers', 'masks', 'teasing'],
		voice: 'talk',
		scene: 'masquerade',
		cast: [
			{
				character: 'tease',
				part: 'the stranger in the mask',
				relationship: 'a stranger, as far as you know',
				doing: 'has been watching you all night, and finally makes a move'
			}
		]
	},
	{
		id: 'after-hours',
		you: 'sub',
		tags: ['boss', 'office', 'punishment'],
		voice: 'talk',
		scene: 'after-hours',
		cast: [
			{
				character: 'boss',
				part: 'the boss',
				relationship: 'your boss',
				doing: 'kept you behind after you botched the presentation, and has a punishment in mind'
			}
		]
	},
	{
		id: 'facility',
		you: 'sub',
		tags: ['training', 'rules', 'obedience', 'being watched'],
		voice: 'rules',
		scene: 'facility',
		cast: [
			{
				character: 'mentor',
				part: 'the instructor',
				relationship: 'the one who decides whether you pass',
				doing: 'runs your assessment, strictly by the book'
			}
		]
	},
	{
		id: 'your-assessment',
		you: 'dom',
		tags: ['training', 'rules', 'obedience', 'watching'],
		voice: 'talk',
		scene: 'your-assessment',
		cast: [
			{
				character: 'eager-sub',
				part: 'the trainee',
				relationship: 'the trainee you are assessing',
				doing: 'standing at the line, waiting for your first instruction'
			}
		]
	},
	{
		id: 'your-office',
		you: 'dom',
		tags: ['boss', 'punishment', 'eager to please'],
		voice: 'talk',
		scene: 'your-office',
		cast: [
			{
				character: 'eager-sub',
				part: 'the new hire',
				relationship: 'your newest hire',
				doing: 'standing in front of your desk, waiting to hear their punishment'
			}
		]
	},
	{
		id: 'rivals',
		you: null,
		tags: ['enemies to lovers', 'hate sex'],
		voice: 'talk',
		scene: 'rivals',
		cast: [
			{
				character: 'rival',
				part: 'the rival',
				relationship: 'your nemesis at work',
				doing: 'picking a fight, because it is the only way they know to get close to you'
			}
		]
	},
	{
		id: 'lost-bet',
		you: 'sub',
		tags: ['brat', 'humiliation', 'losing a bet'],
		voice: 'talk',
		scene: 'lost-bet',
		cast: [
			{
				character: 'brat',
				part: 'the winner',
				relationship: 'your housemate',
				doing: 'won the bet, and means to be insufferable about collecting'
			}
		]
	},
	{
		id: 'won-bet',
		you: 'dom',
		tags: ['brat', 'humiliation', 'winning a bet'],
		voice: 'talk',
		scene: 'won-bet',
		cast: [
			{
				character: 'brat',
				part: 'the loser',
				relationship: 'your housemate',
				doing: 'lost the bet, and already arguing about the terms'
			}
		]
	},
	{
		id: 'admirer',
		you: 'sub',
		tags: ['yandere', 'stalker', 'possessive'],
		voice: 'told',
		scene: 'admirer',
		cast: [
			{
				character: 'admirer',
				part: 'the admirer',
				relationship: 'someone you have never noticed, who has noticed everything about you',
				doing: 'already inside, waiting in the dark'
			}
		]
	},
	{
		id: 'your-obsession',
		you: 'dom',
		tags: ['yandere', 'obsession', 'possessive'],
		voice: 'told',
		scene: 'your-obsession',
		cast: [
			{
				character: 'innocent',
				part: 'the one you watch',
				relationship: 'someone who has never noticed you, until now',
				doing: 'pretending to sleep, and waiting'
			}
		]
	},
	{
		id: 'summoning',
		you: 'sub',
		tags: ['demon', 'corruption', 'a deal'],
		voice: 'talk',
		scene: 'summoning',
		cast: [
			{
				character: 'demon',
				part: 'the demon',
				relationship: 'the demon you summoned',
				doing: 'stepping out of the circle to collect'
			}
		]
	},
	{
		id: 'summoned',
		you: 'dom',
		tags: ['demon', 'corruption', 'a deal'],
		voice: 'talk',
		scene: 'summoned',
		cast: [
			{
				character: 'innocent',
				part: 'the summoner',
				relationship: 'the mortal who summoned you',
				doing: 'trembling at the edge of the circle, wish already spoken'
			}
		]
	},
	{
		id: 'brat-taming',
		you: 'dom',
		tags: ['brat taming', 'spanking', 'discipline'],
		voice: 'talk',
		scene: 'brat-taming',
		cast: [
			{
				character: 'brat',
				part: 'the brat',
				relationship: 'your sub',
				doing: 'rolling their eyes at your rules, one more time'
			}
		]
	},
	{
		id: 'tamed',
		you: 'sub',
		tags: ['brat taming', 'spanking', 'discipline'],
		voice: 'talk',
		scene: 'tamed',
		cast: [
			{
				character: 'mentor',
				part: 'your dom',
				relationship: 'your dom',
				doing: 'calmly listing everything you did this week'
			}
		]
	},
	{
		id: 'the-key',
		you: 'dom',
		tags: ['chastity', 'orgasm denial', 'begging'],
		voice: 'talk',
		scene: 'the-key',
		cast: [
			{
				character: 'masochist',
				part: 'the locked one',
				relationship: 'your partner',
				doing: 'kneeling, and asking very nicely'
			}
		]
	},
	{
		id: 'new-pet',
		you: 'dom',
		tags: ['pet play', 'collar and leash', 'training'],
		voice: 'talk',
		scene: 'new-pet',
		cast: [
			{
				character: 'eager-sub',
				part: 'the pet',
				relationship: 'your partner, and your pet for the weekend',
				doing: 'waiting by the door with the leash in their mouth'
			}
		]
	},
	{
		id: 'locked',
		you: 'sub',
		tags: ['chastity', 'orgasm denial', 'begging'],
		voice: 'talk',
		scene: 'locked',
		cast: [
			{
				character: 'keyholder',
				part: 'the keyholder',
				relationship: 'your partner, and your keyholder',
				doing: 'checking the lock, and asking how desperate you are today'
			}
		]
	},
	{
		id: 'good-pet',
		you: 'sub',
		tags: ['pet play', 'collar and leash', 'no talking'],
		voice: 'talk',
		scene: 'good-pet',
		cast: [
			{
				character: 'pet-owner',
				part: 'the owner',
				relationship: 'your owner',
				doing: 'clipping on the leash for the weekend'
			}
		]
	},
	{
		id: 'trigger-words',
		you: 'sub',
		tags: ['hypnosis', 'trigger words', 'mind control'],
		voice: 'talk',
		scene: 'trigger-words',
		cast: [
			{
				character: 'hypnotist',
				part: 'the hypnotist',
				relationship: 'your partner, who has been conditioning you for months',
				doing: 'about to say the first trigger word'
			}
		]
	},
	{
		id: 'your-subject',
		you: 'dom',
		tags: ['hypnosis', 'trigger words', 'mind control'],
		voice: 'talk',
		scene: 'your-subject',
		cast: [
			{
				character: 'eager-sub',
				part: 'the subject',
				relationship: 'your partner, who asked to be conditioned',
				doing: 'settling into the chair, already going under'
			}
		]
	},
	{
		id: 'hotel-room',
		you: null,
		tags: ['hookup', 'no strings'],
		voice: 'told',
		scene: 'hotel-room',
		cast: [
			{
				character: 'neighbour',
				part: 'the hookup',
				relationship: 'someone you met online',
				doing: 'already in the room when you arrive'
			}
		]
	},
	{
		id: 'mating-season',
		you: 'sub',
		tags: ['breeding', 'werewolf', 'primal', 'size difference'],
		voice: 'told',
		scene: 'mating-season',
		cast: [
			{
				character: 'beast',
				part: 'your mate',
				relationship: 'your mate',
				doing: 'in rut, and has been waiting for you all day'
			}
		]
	},
	{
		id: 'your-rut',
		you: 'dom',
		tags: ['breeding', 'werewolf', 'primal', 'size difference'],
		voice: 'told',
		scene: 'your-rut',
		cast: [
			{
				character: 'eager-sub',
				part: 'your mate',
				relationship: 'your mate',
				doing: 'waiting for you on the bed, and already shaking'
			}
		]
	},
	{
		id: 'threesome',
		you: 'sub',
		tags: ['threesome', 'sharing', 'praise'],
		voice: 'talk',
		scene: 'threesome',
		cast: [
			{
				character: 'gentle-dom',
				part: 'your partner',
				relationship: 'your partner',
				doing: 'set the whole night up for you, and talks you through it'
			},
			{
				character: 'neighbour',
				part: 'the guest',
				relationship: 'the guest your partner picked',
				doing: 'cannot keep their hands off you'
			}
		]
	},
	{
		id: 'sharing-them',
		you: 'dom',
		tags: ['threesome', 'sharing', 'praise'],
		voice: 'talk',
		scene: 'sharing-them',
		cast: [
			{
				character: 'neighbour',
				part: 'your partner',
				relationship: 'your partner',
				doing: 'already undressing the guest'
			},
			{
				character: 'eager-sub',
				part: 'the guest',
				relationship: 'the guest you both picked',
				doing: 'cannot believe their luck'
			}
		]
	},
	{
		id: 'hotwife',
		you: 'sub',
		tags: ['cuckolding', 'made to watch', 'humiliation'],
		voice: 'talk',
		scene: 'hotwife',
		cast: [
			{
				character: 'tease',
				part: 'your partner',
				relationship: 'your partner',
				doing: 'making you watch, and telling you how much better it is'
			},
			{
				character: 'rival',
				part: 'the bull',
				relationship: 'the bull your partner chose',
				doing: 'making sure you see everything'
			}
		]
	},
	{
		id: 'the-bull',
		you: 'dom',
		tags: ['cuckolding', 'the bull', 'humiliation'],
		voice: 'talk',
		scene: 'the-bull',
		cast: [
			{
				character: 'tease',
				part: 'the partner',
				relationship: 'the one who invited you',
				doing: 'pulling you onto the bed'
			},
			{
				character: 'eager-sub',
				part: 'the one watching',
				relationship: 'their partner',
				doing: 'in the chair, watching every second'
			}
		]
	},
	{
		id: 'hunt',
		you: 'sub',
		tags: ['CNC', 'primal', 'chase'],
		voice: 'told',
		scene: 'hunt',
		cast: [
			{
				character: 'beast',
				part: 'the hunter',
				relationship: 'your partner, who agreed every rule of the chase with you beforehand',
				doing: 'counting down your head start'
			}
		]
	},
	{
		id: 'your-hunt',
		you: 'dom',
		tags: ['CNC', 'primal', 'chase'],
		voice: 'told',
		scene: 'your-hunt',
		cast: [
			{
				character: 'struggler',
				part: 'the prey',
				relationship: 'your partner, who agreed every rule of the chase with you beforehand',
				doing: 'already running'
			}
		]
	},
	{
		id: 'free-use',
		you: 'sub',
		tags: ['free use', 'CNC', 'objectification'],
		voice: 'told',
		scene: 'free-use',
		cast: [
			{
				character: 'neighbour',
				part: 'the housemate',
				relationship: 'your housemate',
				doing: 'bending you over the kitchen counter without a word'
			},
			{
				character: 'tease',
				part: 'the other housemate',
				relationship: 'your other housemate',
				doing: 'waiting their turn, and not patiently'
			}
		]
	},
	{
		id: 'anal-only',
		you: 'sub',
		tags: ['anal only', 'plugs', 'anal training'],
		voice: 'talk',
		scene: 'anal-only',
		cast: [
			{
				character: 'anal-trainer',
				part: 'your partner',
				relationship: 'your partner',
				doing: 'checking your plug, and bringing out the next size up'
			}
		]
	},
	{
		id: 'gangbang',
		you: 'sub',
		tags: ['gangbang', 'group', 'degradation'],
		voice: 'told',
		scene: 'gangbang',
		cast: [
			{
				character: 'neighbour',
				part: 'the organiser',
				relationship: 'the one who booked the room',
				doing: 'keeping the count, and sending the next one in'
			},
			{
				character: 'beast',
				part: 'the first in line',
				relationship: 'a stranger',
				doing: 'first, and not waiting'
			}
		]
	},
	{
		id: 'the-organiser',
		you: 'dom',
		tags: ['gangbang', 'group', 'degradation'],
		voice: 'told',
		scene: 'the-organiser',
		cast: [
			{
				character: 'masochist',
				part: 'the guest of honour',
				relationship: 'the one who signed up',
				doing: 'on the bed, counting the people in the room'
			},
			{
				character: 'beast',
				part: 'the first in line',
				relationship: 'a stranger',
				doing: 'first, and not waiting'
			}
		]
	},
	{
		id: 'break-in',
		you: 'sub',
		tags: ['CNC', 'home invasion', 'struggle', 'rough sex'],
		voice: 'told',
		scene: 'break-in',
		cast: [
			{
				character: 'intruder',
				part: 'the intruder',
				relationship: 'your partner, playing a stranger, with every rule agreed beforehand',
				doing: 'already inside when you get home'
			}
		]
	},
	{
		id: 'interrogation',
		you: 'sub',
		tags: ['captive', 'interrogation', 'forced orgasms', 'overstimulation'],
		voice: 'talk',
		scene: 'interrogation',
		cast: [
			{
				character: 'interrogator',
				part: 'the interrogator',
				relationship: 'the officer who captured you',
				doing: 'pulling up a chair'
			}
		]
	},
	{
		id: 'house-rules',
		you: 'dom',
		tags: ['free use', 'CNC', 'objectification'],
		voice: 'talk',
		scene: 'house-rules',
		cast: [
			{
				character: 'eager-sub',
				part: 'the housemate',
				relationship: 'your housemate',
				doing: 'washing up, and pretending not to notice you come in'
			}
		]
	},
	{
		id: 'training-them',
		you: 'dom',
		tags: ['anal only', 'plugs', 'anal training'],
		voice: 'talk',
		scene: 'training-them',
		cast: [
			{
				character: 'brat',
				part: 'your partner',
				relationship: 'your partner',
				doing: 'complaining about the next size up, and bending over anyway'
			}
		]
	},
	{
		id: 'your-break-in',
		you: 'dom',
		tags: ['CNC', 'home invasion', 'struggle', 'rough sex'],
		voice: 'told',
		scene: 'your-break-in',
		cast: [
			{
				character: 'struggler',
				part: 'the one at home',
				relationship: 'your partner, playing a stranger, with every rule agreed beforehand',
				doing: 'getting home, not knowing you are already inside'
			}
		]
	},
	{
		id: 'your-captive',
		you: 'dom',
		tags: ['captive', 'interrogation', 'pain', 'overstimulation'],
		voice: 'talk',
		scene: 'your-captive',
		cast: [
			{
				character: 'masochist',
				part: 'the captive',
				relationship: 'the spy you caught',
				doing: 'chained to the chair, and spitting at you'
			}
		]
	},
	{
		id: 'dungeon',
		you: 'sub',
		tags: ['being used', 'impact play', 'sadism', 'group'],
		voice: 'talk',
		scene: 'dungeon',
		cast: [
			{
				character: 'sadist',
				part: 'the host',
				relationship: 'a stranger who has heard all about you',
				doing: 'presenting you to the room'
			},
			{
				character: 'tease',
				part: 'the regular',
				relationship: 'someone who has had their eye on you all night',
				doing: 'first in line for you'
			}
		]
	},
	{
		id: 'your-party',
		you: 'dom',
		tags: ['being used', 'impact play', 'sadism', 'group'],
		voice: 'talk',
		scene: 'your-party',
		cast: [
			{
				character: 'masochist',
				part: 'the toy',
				relationship: 'a stranger who came to be used',
				doing: 'kneeling in the middle of the room'
			},
			{
				character: 'tease',
				part: 'the regular',
				relationship: 'someone who comes to every party',
				doing: 'first in line for your toy'
			}
		]
	}
];

/**
 * The ready-made stories for one side, or all of them for null ("Either"). A
 * story with no one in charge suits both sides, so it is never filtered out.
 */
export function startersFor(side: StarterSide | null): readonly DaydreamStarter[] {
	return side === null
		? DAYDREAM_STARTERS
		: DAYDREAM_STARTERS.filter((starter) => starter.you === null || starter.you === side);
}

/** The scene template a starter is built on. Throws for a starter that names one that is not there. */
export function starterScene(starter: DaydreamStarter) {
	const template = SCENE_TEMPLATES.find((entry) => entry.id === starter.scene);
	if (!template) {
		throw new Error(`The "${starter.id}" starter names a scene template that does not exist`);
	}
	return template;
}

/** A ready-made story as a setup. Throws for one naming a template that is not there. */
export function starterSetup(starter: DaydreamStarter, newId?: () => string): DaydreamSetup {
	const cast = starter.cast.map(({ character, part, relationship, doing }) => {
		const template = CHARACTER_TEMPLATES.find((entry) => entry.id === character);
		if (!template) {
			throw new Error(`The "${starter.id}" starter names a character template that does not exist`);
		}
		return { character: template.character, partName: part, relationship, doing };
	});
	return assembleSetup({ voice: starter.voice, scene: starterScene(starter).scene, cast }, newId);
}

/** How many of the ideas the start page shows at once. */
export const SHOWN_IDEA_CHIPS = 3;

/**
 * A few of the ideas, so the list reads as a nudge rather than a menu to
 * work through; the start page's shuffle draws another few, leaving out the
 * ones on screen (`exclude`). The first draw is the page's load, not the
 * component's: drawn during render, the server and the browser would each
 * draw their own and hydration would disagree with what was shown.
 */
export function pickIdeas(
	count: number = SHOWN_IDEA_CHIPS,
	random: () => number = Math.random,
	exclude: readonly string[] = []
): string[] {
	const fresh = DAYDREAM_IDEA_CHIPS.filter((idea) => !exclude.includes(idea));
	// Never fewer than asked for: with too few left, any of them will do.
	const pool = fresh.length >= count ? fresh : [...DAYDREAM_IDEA_CHIPS];
	for (let at = pool.length - 1; at > 0; at -= 1) {
		const other = Math.floor(random() * (at + 1));
		[pool[at], pool[other]] = [pool[other] as string, pool[at] as string];
	}
	return pool.slice(0, count);
}

/**
 * Ideas to start the "describe it" box from. They toggle into it, like the
 * chips under a field, so they read as something a person might have typed.
 */
export const DAYDREAM_IDEA_CHIPS: readonly string[] = [
	'my best friend finally confesses',
	'my strict boss keeps me late',
	'a rival I end up in bed with',
	'a dom who praises me through it',
	'a brat who needs putting in their place',
	'a possessive lover who gets jealous',
	'a demon I summoned wants paying',
	'a masked stranger chases me through the woods',
	'a werewolf on the full moon',
	'a threesome with my partner and a stranger',
	'a partner set on breeding me',
	'a house where I am trained to obey',
	'a stranger on a crowded night train',
	'being someone’s toy for the night',
	'free use in my own house',
	'my partner and I are anal only',
	'locked in chastity by my keyholder',
	'trained as someone’s pet',
	'a hypnotist who knows my trigger words',
	'a home invasion we planned together',
	'a gangbang I signed up for',
	'captured and interrogated',
	'my partner makes me watch'
];
