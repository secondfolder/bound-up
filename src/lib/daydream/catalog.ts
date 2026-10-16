/**
 * The curated suggestions for making characters and scenes: chips for each
 * field, and starter templates to begin from.
 *
 * Built in rather than asked of the model, so the common choices are instant,
 * free, and never leave the device; "More ideas" asks the model for the
 * rest (`api/daydreams/suggest`). Chips are phrases that toggle in the free
 * text (`chips.ts`), so they read as things a person might have written.
 *
 * Content, like the seed prose: adult by design, and data rather than logic.
 * Pure and alias-free.
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
		'strict mentor',
		'playful tease',
		'cold aristocrat',
		'devoted servant',
		'charming rogue',
		'stern officer',
		'gentle caretaker',
		'bratty troublemaker',
		'mysterious stranger',
		'competitive rival'
	],
	personality: [
		'patient',
		'demanding',
		'calm',
		'mischievous',
		'possessive',
		'observant',
		'unpredictable',
		'protective',
		'sardonic',
		'quietly intense'
	],
	speech: [
		'speaks softly',
		'short, clipped sentences',
		'never raises their voice',
		'teases constantly',
		'formal and precise',
		'uses pet names',
		'asks questions rather than giving orders',
		'counts out loud'
	],
	appearance: [
		'tall',
		'sharp suit',
		'tattoos',
		'reading glasses',
		'leather gloves',
		'long hair tied back',
		'an easy smile',
		'a stare that does not blink'
	],
	likes: [
		'praise',
		'teasing',
		'rules and rituals',
		'restraint',
		'making you wait',
		'being obeyed',
		'slow build-up',
		'keeping score'
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
		'your roommate'
	],
	part: [
		'testing you',
		'setting the rules',
		'collecting on a debt',
		'watching closely',
		'making you wait',
		'keeping a promise',
		'about to lose patience',
		'enjoying every minute'
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
		'an empty office after hours',
		'a hotel room',
		'a remote cabin',
		'a private library',
		'a car on a long drive',
		'a training facility',
		'a masquerade party',
		'home, on a quiet evening'
	],
	premise: [
		'a bet you lost',
		'a contract to sign',
		'an interview that goes off script',
		'a punishment long overdue',
		'a test you have to pass',
		'a game with rules you don’t know yet',
		'a reward you earned',
		'an evening you promised to give up'
	],
	yourRole: [
		'the new hire',
		'the one who lost the bet',
		'a guest',
		'the trainee',
		'the one in charge, for once',
		'yourself'
	],
	tone: [
		'slow-burn',
		'playful',
		'strict',
		'tender',
		'humiliating',
		'tense',
		'romantic',
		'clinical'
	],
	notes: []
};

/** Starting points for a new character: a full set of fields to edit from. */
export const CHARACTER_TEMPLATES: readonly {
	id: string;
	label: string;
	character: DaydreamCharacter;
}[] = [
	{
		id: 'mentor',
		label: 'The strict mentor',
		character: {
			name: 'Mara',
			archetype: 'strict mentor',
			personality: 'patient, demanding, quietly intense',
			speech: 'short, clipped sentences, never raises their voice',
			appearance: 'sharp suit, reading glasses',
			likes: 'rules and rituals, praise when it is earned',
			notes: '',
			dials: { tone: 'cold', control: 5, strictness: 5, edge: 3, talk: 2 }
		}
	},
	{
		id: 'tease',
		label: 'The playful tease',
		character: {
			name: 'Jules',
			archetype: 'playful tease',
			personality: 'mischievous, observant, unpredictable',
			speech: 'teases constantly, uses pet names',
			appearance: 'an easy smile',
			likes: 'teasing, making you wait',
			notes: '',
			dials: { tone: 'teasing', control: 4, strictness: 2, edge: 2, talk: 4 }
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
			dials: { tone: 'warm', control: 3, strictness: 2, edge: 1, talk: 3 }
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
			likes: 'being obeyed, keeping score',
			notes: '',
			dials: { tone: 'clinical', control: 5, strictness: 4, edge: 4, talk: 2 }
		}
	}
];

/**
 * Starting points for a new scene. Their parts have no ids: each use gives
 * them fresh ones (`DaydreamSceneDialog`), as a part made by hand gets.
 */
export const SCENE_TEMPLATES: readonly {
	id: string;
	label: string;
	scene: Omit<DaydreamScene, 'parts'> & { parts: { name: string; description: string }[] };
}[] = [
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
			]
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
			tone: 'playful',
			notes: '',
			parts: [{ name: 'the winner', description: 'won the bet, and means to collect' }]
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
			]
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
			tone: 'tender, slow-burn',
			notes: '',
			parts: [{ name: 'the one who planned it', description: 'arranged the whole weekend' }]
		}
	}
];
