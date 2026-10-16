/**
 * The curated suggestions for making characters and scenes: chips for each
 * field, and starter templates to begin from.
 *
 * Built in rather than asked of the model, so the common choices are instant,
 * free, and never leave the device; "More ideas" asks the model for the
 * rest (`api/daydreams/suggest`). Chips are phrases that toggle in the free
 * text (`chips.ts`), so they read as things a person might have written.
 *
 * Content, like the seed prose: data rather than logic. It runs the whole
 * range on purpose, from SFW to filthy and extreme, because people use
 * Daydreams for all of it: each list keeps its tame entries and its explicit
 * ones side by side, and the starting points are ordered by heat and say
 * theirs on their buttons (`sceneLevel`, `characterLevel`), so nobody has to
 * guess what they are picking. Pure and alias-free.
 */

import type {
	CharacterTextField,
	DaydreamCasting,
	DaydreamCharacter,
	DaydreamScene,
	SceneTextField
} from '../daydream';

export const CHARACTER_FIELD_LABELS: Readonly<
	Record<CharacterTextField, { label: string; hint: string }>
> = {
	archetype: { label: 'Type', hint: 'The kind of person they are, in a few words' },
	personality: { label: 'Personality', hint: 'How they think and behave' },
	speech: { label: 'How they talk', hint: 'Their voice, their words, their habits' },
	appearance: { label: 'Appearance', hint: 'What you notice about them' },
	likes: { label: 'What they enjoy', hint: 'What they want from a scene' },
	notes: { label: 'Anything else', hint: 'Whatever the rest leaves out' }
};

export const CHARACTER_CHIPS: Readonly<Record<CharacterTextField, readonly string[]>> = {
	archetype: [
		'old friend',
		'strict mentor',
		'playful tease',
		'cold aristocrat',
		'devoted servant',
		'charming rogue',
		'stern officer',
		'gentle caretaker',
		'bratty troublemaker',
		'mysterious stranger',
		'competitive rival',
		'shameless flirt',
		'insatiable lover',
		'sadistic dom',
		'eager submissive',
		'pain slut',
		'kinky switch'
	],
	personality: [
		'patient',
		'kind',
		'witty',
		'demanding',
		'calm',
		'mischievous',
		'possessive',
		'observant',
		'unpredictable',
		'protective',
		'sardonic',
		'quietly intense',
		'flirtatious',
		'horny all the time',
		'shameless',
		'sadistic',
		'desperate to please'
	],
	speech: [
		'speaks softly',
		'dry humour',
		'short and clipped',
		'never raises their voice',
		'teases constantly',
		'formal and precise',
		'uses pet names',
		'asks questions rather than giving orders',
		'counts out loud',
		'talks dirty',
		'narrates what they will do to you',
		'begs',
		'degrading names'
	],
	appearance: [
		'tall',
		'freckles',
		'sharp suit',
		'tattoos',
		'reading glasses',
		'leather gloves',
		'long hair tied back',
		'an easy smile',
		'a stare that does not blink',
		'lingerie under everything',
		'a collar',
		'nipple piercings',
		'leather harness',
		'rope marks on their wrists'
	],
	likes: [
		'long conversations',
		'banter',
		'praise',
		'teasing',
		'rules and rituals',
		'restraint',
		'making you wait',
		'being obeyed',
		'slow build-up',
		'keeping score',
		'dirty talk',
		'oral',
		'being watched',
		'spanking',
		'bondage',
		'edging',
		'orgasm denial',
		'praise kink',
		'degradation',
		'impact play',
		'using you'
	],
	notes: []
};

/** The casting fields a person writes in: who a character is in this story. */
export const CASTING_FIELD_LABELS: Readonly<
	Record<Exclude<keyof DaydreamCasting, 'partId'>, { label: string; hint: string }>
> = {
	relationship: { label: 'Who they are to you', hint: 'In this story: how you know each other' },
	part: { label: 'Their part in this', hint: 'What they are doing, or want, as it starts' }
};

export const CASTING_CHIPS: Readonly<
	Record<Exclude<keyof DaydreamCasting, 'partId'>, readonly string[]>
> = {
	relationship: [
		'your partner',
		'your boss',
		'a stranger you just met',
		'an old friend',
		'your rival',
		'your landlord',
		'someone you hired',
		'your roommate',
		'your ex',
		'a hookup from an app',
		'your owner',
		'your sub'
	],
	part: [
		'catching up',
		'testing you',
		'setting the rules',
		'collecting on a debt',
		'watching closely',
		'making you wait',
		'keeping a promise',
		'about to lose patience',
		'enjoying every minute',
		'trying to seduce you',
		'desperate to get you into bed',
		'punishing you',
		'training you'
	]
};

export const SCENE_FIELD_LABELS: Readonly<Record<SceneTextField, { label: string; hint: string }>> =
	{
		setting: { label: 'Where', hint: 'The place it happens' },
		premise: { label: 'What’s going on', hint: 'How it starts' },
		yourRole: { label: 'Your part', hint: 'Who you are in it, if you are in it' },
		tone: { label: 'Tone', hint: 'How it should feel' },
		notes: { label: 'Anything else', hint: 'Whatever the rest leaves out' }
	};

export const SCENE_CHIPS: Readonly<Record<SceneTextField, readonly string[]>> = {
	setting: [
		'a lighthouse in a storm',
		'a café at closing time',
		'an empty office after hours',
		'a hotel room',
		'a remote cabin',
		'a private library',
		'a car on a long drive',
		'a training facility',
		'a masquerade party',
		'home on a quiet evening',
		'a sex club',
		'a dungeon',
		'a play party'
	],
	premise: [
		'a mystery to solve',
		'a reunion after years apart',
		'a bet you lost',
		'a contract to sign',
		'an interview that goes off script',
		'a punishment long overdue',
		'a test you have to pass',
		'a game with rules you don’t know yet',
		'a reward you earned',
		'an evening you promised to give up',
		'a hookup with no names',
		'a night of being used',
		'a training session you can’t leave early'
	],
	yourRole: [
		'yourself',
		'the new hire',
		'the one who lost the bet',
		'a guest',
		'the trainee',
		'the one in charge for once',
		'the sub',
		'the toy for the night'
	],
	tone: [
		'wholesome',
		'cosy',
		'romantic',
		'slow-burn',
		'playful',
		'tender',
		'tense',
		'strict',
		'clinical',
		'steamy',
		'humiliating',
		'filthy',
		'brutal'
	],
	notes: []
};

/**
 * Starting points for a new character: a full set of fields to edit from.
 * Ordered by libido, from SFW to slutty, as the dialog shows them.
 */
export const CHARACTER_TEMPLATES: readonly {
	id: string;
	label: string;
	character: DaydreamCharacter;
}[] = [
	{
		id: 'old-friend',
		label: 'The old friend',
		character: {
			name: 'Robin',
			archetype: 'old friend',
			personality: 'kind, witty, a little nostalgic',
			speech: 'dry humour, picks up where you left off',
			appearance: 'freckles, an easy smile',
			likes: 'long conversations, banter',
			notes: '',
			dials: {
				tone: 'warm',
				control: 3,
				strictness: 1,
				edge: 1,
				talk: 4,
				libido: 1,
				kink: 1
			}
		}
	},
	{
		id: 'caretaker',
		label: 'The gentle caretaker',
		character: {
			name: 'Sam',
			archetype: 'gentle caretaker',
			personality: 'calm, protective, patient',
			speech: 'speaks softly, asks questions rather than giving orders',
			appearance: 'long hair tied back',
			likes: 'praise, slow build-up',
			notes: '',
			dials: {
				tone: 'warm',
				control: 3,
				strictness: 2,
				edge: 1,
				talk: 3,
				libido: 3,
				kink: 1
			}
		}
	},
	{
		id: 'rogue',
		label: 'The charming rogue',
		character: {
			name: 'Dex',
			archetype: 'charming rogue',
			personality: 'flirtatious, mischievous, never serious for long',
			speech: 'all innuendo, uses pet names',
			appearance: 'an easy smile, a coat that has seen better days',
			likes: 'banter, making you blush',
			notes: '',
			dials: {
				tone: 'teasing',
				control: 3,
				strictness: 1,
				edge: 2,
				talk: 4,
				libido: 3,
				kink: 1
			}
		}
	},
	{
		id: 'mentor',
		label: 'The strict mentor',
		character: {
			name: 'Mara',
			archetype: 'strict mentor',
			personality: 'patient, demanding, quietly intense',
			speech: 'short, clipped sentences, never raises their voice',
			appearance: 'sharp suit, reading glasses',
			likes: 'rules and rituals, praise when it is earned, restraint',
			notes: '',
			dials: {
				tone: 'cold',
				control: 5,
				strictness: 5,
				edge: 3,
				talk: 2,
				libido: 3,
				kink: 4
			}
		}
	},
	{
		id: 'aristocrat',
		label: 'The cold aristocrat',
		character: {
			name: 'Lady Vale',
			archetype: 'cold aristocrat',
			personality: 'possessive, sardonic, demanding',
			speech: 'formal and precise',
			appearance: 'leather gloves, a stare that does not blink',
			likes: 'being obeyed, keeping score, making you wait',
			notes: '',
			dials: {
				tone: 'clinical',
				control: 5,
				strictness: 4,
				edge: 4,
				talk: 2,
				libido: 3,
				kink: 4
			}
		}
	},
	{
		id: 'tease',
		label: 'The playful tease',
		character: {
			name: 'Jules',
			archetype: 'playful tease',
			personality: 'mischievous, observant, unpredictable',
			speech: 'teases constantly, uses pet names, talks dirty',
			appearance: 'an easy smile, lingerie under everything',
			likes: 'teasing, edging, orgasm denial',
			notes: '',
			dials: {
				tone: 'teasing',
				control: 4,
				strictness: 2,
				edge: 2,
				talk: 4,
				libido: 4,
				kink: 3
			}
		}
	},
	{
		id: 'brat',
		label: 'The brat',
		character: {
			name: 'Kit',
			archetype: 'bratty troublemaker',
			personality: 'mouthy, defiant, desperate to be put in their place',
			speech: 'talks back, begs when it finally works',
			appearance: 'a collar they pretend not to care about',
			likes: 'spanking, being made to behave, bondage',
			notes: '',
			dials: {
				tone: 'teasing',
				control: 2,
				strictness: 1,
				edge: 2,
				talk: 4,
				libido: 4,
				kink: 4
			}
		}
	},
	{
		id: 'sadist',
		label: 'The sadist',
		character: {
			name: 'Corin',
			archetype: 'sadistic dom',
			personality: 'calm, observant, sadistic',
			speech: 'never raises their voice, degrading names, narrates what they will do to you',
			appearance: 'leather gloves, rope marks on their wrists from the last one',
			likes: 'impact play, degradation, your reactions, using you',
			notes: '',
			dials: {
				tone: 'cold',
				control: 5,
				strictness: 4,
				edge: 5,
				talk: 3,
				libido: 4,
				kink: 5
			}
		}
	},
	{
		id: 'neighbour',
		label: 'The eager neighbour',
		character: {
			name: 'Tess',
			archetype: 'shameless flirt',
			personality: 'horny all the time, shameless, cheerful about it',
			speech: 'says exactly what they want, talks dirty',
			appearance: 'a robe that never stays closed',
			likes: 'oral, being watched, dirty talk, more',
			notes: '',
			dials: {
				tone: 'warm',
				control: 4,
				strictness: 1,
				edge: 1,
				talk: 4,
				libido: 5,
				kink: 2
			}
		}
	}
];

/**
 * Starting points for a new scene, ordered by heat, from SFW to filthy. Their
 * parts have no ids: each use gives them fresh ones (`DaydreamSceneDialog`),
 * as a part made by hand gets.
 */
export const SCENE_TEMPLATES: readonly {
	id: string;
	label: string;
	scene: Omit<DaydreamScene, 'parts'> & { parts: { name: string; description: string }[] };
}[] = [
	{
		id: 'lighthouse',
		label: 'The lighthouse',
		scene: {
			title: 'The lighthouse',
			setting: 'a lighthouse in a storm',
			premise: 'a stranger washed up at the door, and a mystery to solve before the storm ends',
			yourRole: 'the keeper',
			tone: 'cosy, tense',
			notes: '',
			parts: [{ name: 'the stranger', description: 'washed up at the door, and hiding something' }],
			dials: { heat: 1, kink: 1 }
		}
	},
	{
		id: 'long-drive',
		label: 'The long drive',
		scene: {
			title: 'The long drive',
			setting: 'a car on a long drive',
			premise: 'a road trip with someone you have always wondered about',
			yourRole: 'yourself',
			tone: 'romantic, slow-burn',
			notes: '',
			parts: [{ name: 'the driver', description: 'picked the route, and the music' }],
			dials: { heat: 2, kink: 1 }
		}
	},
	{
		id: 'masquerade',
		label: 'The masquerade',
		scene: {
			title: 'The masquerade',
			setting: 'a masquerade party',
			premise: 'a masked stranger, a dare, and no names',
			yourRole: 'a guest',
			tone: 'playful, tense',
			notes: '',
			parts: [{ name: 'the stranger in the mask', description: 'chose you across the room' }],
			dials: { heat: 2, kink: 2 }
		}
	},
	{
		id: 'cabin',
		label: 'The cabin',
		scene: {
			title: 'The cabin',
			setting: 'a remote cabin',
			premise: 'a reward you earned, a whole weekend of it',
			yourRole: 'yourself',
			tone: 'tender, slow-burn, steamy',
			notes: '',
			parts: [{ name: 'the one who planned it', description: 'arranged the whole weekend' }],
			dials: { heat: 3, kink: 1 }
		}
	},
	{
		id: 'after-hours',
		label: 'After hours',
		scene: {
			title: 'After hours',
			setting: 'an empty office after hours',
			premise: 'an interview that goes off script',
			yourRole: 'the new hire',
			tone: 'slow-burn, tense',
			notes: '',
			parts: [
				{ name: 'the interviewer', description: 'runs the interview, and decides how it goes' }
			],
			dials: { heat: 3, kink: 2 }
		}
	},
	{
		id: 'facility',
		label: 'The facility',
		scene: {
			title: 'The facility',
			setting: 'a training facility',
			premise: 'a test you have to pass, under rules you don’t know yet',
			yourRole: 'the trainee',
			tone: 'clinical, strict',
			notes: '',
			parts: [
				{ name: 'the instructor', description: 'sets the tests and the rules' },
				{ name: 'the observer', description: 'watches, takes notes, says little' }
			],
			dials: { heat: 3, kink: 4 }
		}
	},
	{
		id: 'lost-bet',
		label: 'The lost bet',
		scene: {
			title: 'The lost bet',
			setting: 'home, on a quiet evening',
			premise: 'a bet you lost, and the evening you promised to give up',
			yourRole: 'the one who lost the bet',
			tone: 'playful, humiliating',
			notes: '',
			parts: [{ name: 'the winner', description: 'won the bet, and means to collect' }],
			dials: { heat: 4, kink: 3 }
		}
	},
	{
		id: 'contract',
		label: 'The contract',
		scene: {
			title: 'The contract',
			setting: 'a private library',
			premise:
				'a contract that signs you over for a month: their rules, their protocol, their body to use',
			yourRole: 'the one signing',
			tone: 'strict, formal, steamy',
			notes: '',
			parts: [{ name: 'the owner', description: 'wrote every clause, and enforces them' }],
			dials: { heat: 4, kink: 4 }
		}
	},
	{
		id: 'hotel-room',
		label: 'The hotel room',
		scene: {
			title: 'The hotel room',
			setting: 'a hotel room',
			premise: 'a hookup with no names: no pretending, you both know why you are here',
			yourRole: 'yourself',
			tone: 'urgent, filthy',
			notes: '',
			parts: [
				{
					name: 'the hookup',
					description: 'booked the room, and has been thinking about it all day'
				}
			],
			dials: { heat: 5, kink: 1 }
		}
	},
	{
		id: 'dungeon',
		label: 'The dungeon',
		scene: {
			title: 'The dungeon',
			setting: 'a play party in a dungeon',
			premise: 'a night of being used, with nothing off the table but your limits',
			yourRole: 'the toy for the night',
			tone: 'filthy, brutal',
			notes: '',
			parts: [
				{ name: 'the host', description: 'runs the party, and decides who gets you next' },
				{ name: 'the regular', description: 'has been waiting for someone new' }
			],
			dials: { heat: 5, kink: 5 }
		}
	}
];
