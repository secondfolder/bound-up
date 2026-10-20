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
	DEFAULT_PICTURES,
	DEFAULT_STORY_DIALS,
	EMPTY_CASTING,
	inferVoice,
	MAX_DAYDREAM_CHARACTERS,
	voiceProblem
} from '../daydream';
import { CHARACTER_TEMPLATES, SCENE_TEMPLATES } from './catalog';
import type { SuggestedPart } from './suggestions';
import { type MarkedSummary, parseMarkedSummary } from './summary';

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
	/**
	 * The model's summary of it, with its blanks marked; none for a
	 * ready-made story, whose premise is shown instead. Only for showing the
	 * draft: it is not part of the setup.
	 */
	summary?: MarkedSummary | null;
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
		dials: DEFAULT_STORY_DIALS,
		pictures: DEFAULT_PICTURES
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
	/**
	 * What the setup form shows it as, written like the model's summary of a
	 * daydream it put together (`parseMarkedSummary`): the first mention of
	 * the scene, the heat, how it is told and each character marked as
	 * `[[key|words]]`, each character by their template's name.
	 */
	summary: string;
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
		summary:
			'[[scene|Snowed in at a lodge with your best friend, and only one bed]]. [[Robin|Robin]] insists the bed is fine, and is lying about why they booked it, after ten years of things neither of you has said: a [[heat|SFW]] slow burn. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A masquerade, a dare, and a stranger with no name]]. [[Jules|The stranger in the mask]] has watched you all night and finally makes a move, for a [[heat|flirty]] evening behind the masks. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|Kept late in the empty office after you botched the presentation]]. [[Lady Vale|Lady Vale]], your boss, has a [[heat|steamy]] punishment in mind for you to make up for it. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A test at a training facility, under rules you don’t know yet]]. [[Mara|Mara]], your instructor, runs it by the book: a [[heat|steamy]] trial of obedience, endurance and being watched. It’s told [[voice|as a system’s orders to you]].',
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
		summary:
			'[[scene|You run the assessment at a training facility]]. [[Remy|Remy]] is the trainee, standing at the line and not yet knowing the rules, and it is a [[heat|steamy]] test of obedience, endurance and being watched. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|Your new hire, kept late in your office after botching the presentation]]. [[Remy|Remy]] stands in front of your desk, waiting to hear how they will make up for it, and you have a [[heat|steamy]] punishment in mind. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|Rivals forced to work together overnight in an empty office]]. [[Dex|Dex]], your nemesis at work, picks one fight too many, and it turns into [[heat|explicit]] hate sex. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A bet you lost, and the evening you promised to give up]]. [[Kit|Kit]], your housemate, means to be insufferable about collecting, one [[heat|explicit]] demand at a time. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A bet you won, and the evening they promised to give up]]. [[Kit|Kit]], your housemate, is already arguing about the terms as you collect, one [[heat|explicit]] demand at a time. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|Tonight the admirer who has been watching you finally lets you see them]]. [[Ivy|Ivy]] has noticed everything about you, and is waiting in the dark of your apartment for an [[heat|explicit]] first meeting. It’s told [[voice|to you by a narrator]].',
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
		summary:
			'[[scene|After months of notes, gifts and watching, tonight you let them see you]]. [[Ellis|Ellis]] is pretending to sleep in their apartment, waiting for an [[heat|explicit]] night. It’s told [[voice|to you by a narrator]].',
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
		summary:
			'[[scene|A deal with a demon: your wish granted, paid for with your body]]. [[Nyx|Nyx]] steps out of the candlelit circle to collect, and the price is [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|Summoned by a mortal for a wish, and the price you name is their body]]. [[Ellis|Ellis]] trembles at the edge of the candlelit circle, wish already spoken, as you collect in [[heat|explicit]] detail. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|Your brat has pushed all week, and tonight you stop letting it slide]]. [[Kit|Kit]] rolls their eyes at your rules one more time, and every consequence is [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|You have pushed your dom all week, and tonight they stop letting it slide]]. [[Mara|Mara]] calmly lists everything you did, and every consequence is [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|Three weeks of keeping your partner locked in chastity, with the key around your neck]]. [[Vic|Vic]] kneels and asks very nicely, and you decide how [[heat|explicit]] tonight gets. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A weekend with your partner as your pet: a collar, a leash, a bowl, and no words allowed]]. [[Remy|Remy]] waits by the door with the leash in their mouth, and the weekend ahead is [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A month locked in chastity, and the keyholder decides when, if ever, you come]]. [[Sloane|Sloane]], your partner, checks the lock and asks how desperate you are, and the wait is [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A weekend as their pet: a collar, a leash, a bowl, and no words allowed]]. [[Marlowe|Marlowe]], your owner, clips on the leash, and the weekend ahead is [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|Months of conditioning you agreed to, and tonight the trigger words begin]]. [[Silas|Silas]], your partner, says the first one in a dim room, and you go under, into something [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|Months of conditioning they asked for, and tonight you start using the trigger words]]. [[Remy|Remy]], your partner, settles into the chair and goes under, into something [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A hookup in a hotel room, with no names and no pretending]]. [[Tess|Tess]], someone you met online, is already there when you arrive, and it gets [[heat|filthy]]. It’s told [[voice|to you by a narrator]].',
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
		summary:
			'[[scene|Their rut, a cabin in the woods, and a full moon]]. [[Rhys|Rhys]], your mate, has waited all day to breed you before morning, as many [[heat|filthy]] times as it takes. It’s told [[voice|to you by a narrator]].',
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
		summary:
			'[[scene|Your rut, a cabin in the woods, and a full moon]]. [[Remy|Remy]], your mate, waits on the bed, already shaking, and you mean to breed them before morning, as many [[heat|filthy]] times as it takes. It’s told [[voice|to you by a narrator]].',
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
		summary:
			'[[scene|The threesome you finally said yes to, at home]]. [[Sam|Sam]], your partner, set the night up and talks you through it, while [[Tess|Tess]], the guest Sam chose, cannot keep their hands off you: a [[heat|filthy]] night. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A guest for the night, there to be shared by you and your partner]]. [[Tess|Tess]] is already undressing [[Remy|Remy]], who cannot believe their luck, at the start of a [[heat|filthy]] night. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|Your partner has brought someone home, and you are only allowed to watch]]. From the chair at the foot of the bed, you see [[Jules|Jules]] with [[Dex|Dex]], who makes sure you see every [[heat|filthy]] second. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A couple’s invitation: one of them is yours, and the other only watches]]. [[Jules|Jules]] pulls you onto the bed, and [[Remy|Remy]], their partner, watches every [[heat|filthy]] second from the chair. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A chase through a moonlit forest, agreed beforehand, with a safeword to stop it]]. [[Rhys|Rhys]], your partner, counts down your head start, and once you are caught you are theirs, for something [[heat|filthy]]. It’s told [[voice|to you by a narrator]].',
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
		summary:
			'[[scene|A chase through a moonlit forest, agreed beforehand, with a safeword to stop it]]. [[Sasha|Sasha]], your partner, is already running, and once you catch them they are yours, for something [[heat|filthy]]. It’s told [[voice|to you by a narrator]].',
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
		summary:
			'[[scene|A shared house where you are free use, any time, anywhere, until your safeword]]. [[Tess|Tess]] bends you over the kitchen counter without a word, while [[Jules|Jules]] waits their turn, not patiently, for something [[heat|filthy]]. It’s told [[voice|to you by a narrator]].',
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
		summary:
			'[[scene|An anal-only arrangement, with the rules on the fridge]]. [[Jax|Jax]], your partner, checks your plug and brings out the next size up, for a [[heat|filthy]] day of training. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A gangbang you signed up for: a room full of strangers and a count to reach]]. [[Tess|Tess]] keeps the count, and [[Rhys|Rhys]] is first in line, not waiting, for a [[heat|filthy]] night where nobody leaves early. It’s told [[voice|to you by a narrator]].',
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
		summary:
			'[[scene|A gangbang you organise: you booked the room, and you keep the count]]. [[Vic|Vic]] is on the bed, counting the people in the room, and [[Rhys|Rhys]] is first in line, for a [[heat|filthy]] night. It’s told [[voice|to you by a narrator]].',
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
		summary:
			'[[scene|A home invasion you scripted together weeks ago, with a safeword to stop it]]. [[Cole|Cole]], your partner playing a stranger, is already inside when you get home after dark, and you fight back, for something [[heat|filthy]]. It’s told [[voice|to you by a narrator]].',
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
		summary:
			'[[scene|Captured behind enemy lines, and questioned in a holding cell]]. [[Hale|Hale]], the officer who caught you, pulls up a chair: they want a name, and have all night and [[heat|filthy]] means to get it. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A shared house where your housemate is free use, any time, anywhere, until their safeword]]. [[Remy|Remy]] is washing up and pretending not to notice you come in, for something [[heat|filthy]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|An anal-only arrangement you run, with your rules on the fridge]]. [[Kit|Kit]], your partner, complains about the next size up and bends over anyway, for a [[heat|filthy]] day of training. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A home invasion you scripted together weeks ago, with a safeword to stop it]]. You are already inside when [[Sasha|Sasha]], your partner, gets home after dark, and they fight back, for something [[heat|filthy]]. It’s told [[voice|to you by a narrator]].',
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
		summary:
			'[[scene|A spy caught behind your lines, chained in a holding cell]]. [[Vic|Vic]] spits at you: you want a name, and you have all night and [[heat|filthy]] means to get it. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A night of being used at a play party in a dungeon]]. [[Corin|Corin]], the host, presents you to the room, and [[Jules|Jules]] is first in line, for a [[heat|filthy]] night with nothing off the table but your limits. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		summary:
			'[[scene|A play party you host in a dungeon, with tonight’s toy yours to use and hand out]]. [[Vic|Vic]] kneels in the middle of the room, and [[Jules|Jules]] is first in line, for a [[heat|filthy]] night within their limits. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
	return forSide(DAYDREAM_STARTERS, side);
}

/**
 * The ready-made stories' ids in a fresh order, so the start page does not
 * open on the same few every time. Drawn by the page's load, not the
 * component: drawn during render, the server and the browser would each
 * draw their own and hydration would disagree with what was shown.
 */
export function shuffledStarterIds(random: () => number = Math.random): string[] {
	const ids = DAYDREAM_STARTERS.map((starter) => starter.id);
	for (let at = ids.length - 1; at > 0; at -= 1) {
		const other = Math.floor(random() * (at + 1));
		[ids[at], ids[other]] = [ids[other] as string, ids[at] as string];
	}
	return ids;
}

/**
 * How many ready-made stories the start page shows before "More ideas" shows
 * the rest: a handful to choose from rather than a catalogue to read through,
 * and as many as one round of suggested ones (`GENERATED_IDEAS`).
 */
export const SHOWN_STARTERS = 6;

/** The stories in `order` (ids), any it does not name after the rest. */
export function inOrder<T extends { id: string }>(
	stories: readonly T[],
	order: readonly string[]
): T[] {
	const at = (story: T) => {
		const found = order.indexOf(story.id);
		return found === -1 ? order.length : found;
	};
	return [...stories].sort((a, b) => at(a) - at(b));
}

/** `startersFor`'s rule for anything with a `you`: the generated ideas are filtered by it too. */
export function forSide<T extends { you: StarterSide | null }>(
	stories: readonly T[],
	side: StarterSide | null
): readonly T[] {
	return side === null
		? stories
		: stories.filter((story) => story.you === null || story.you === side);
}

/** What a story card says, for the start page's search to look through. */
export type SearchableStory = { title: string; premise: string; tags: readonly string[] };

/**
 * Whether a story card matches what was typed in the start page's search:
 * every word somewhere in its title, premise or tags, ignoring case, so
 * "brat office" finds a story tagged "brat" set in an office. Nothing
 * typed matches everything.
 */
const WORDS = /\s+/;

export function matchesSearch(story: SearchableStory, query: string): boolean {
	const words = query.toLocaleLowerCase().split(WORDS).filter(Boolean);
	const text = [story.title, story.premise, ...story.tags].join('\n').toLocaleLowerCase();
	return words.every((word) => text.includes(word));
}

/**
 * The side the start page remembers on the device, read back from storage.
 * Anything else — nothing stored, "Either", or a value from some other
 * version — is null, which shows every story.
 */
export function storedStarterSide(stored: string | null): StarterSide | null {
	return stored === 'dom' || stored === 'sub' ? stored : null;
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

/** A ready-made story's summary, read against the setup it makes (`starterSetup`). */
export function starterSummary(
	starter: DaydreamStarter,
	setup: Pick<DaydreamSetup, 'characters'>
): MarkedSummary | null {
	return parseMarkedSummary(
		starter.summary,
		setup.characters.map((character) => character.name)
	);
}
