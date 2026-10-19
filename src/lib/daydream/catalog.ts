/**
 * The curated suggestions for making characters and scenes: chips for each
 * field, and starter templates to begin from.
 *
 * Built in rather than asked of the model, so the common choices are instant,
 * free, and never leave the device; "More ideas" asks the model for the
 * rest (`api/daydreams/suggest`). Chips are phrases that toggle in the free
 * text (`chips.ts`), so they read as things a person might have written.
 *
 * Content, like the seed prose: data rather than logic. It is weighted
 * towards sex and kink, because that is what people come to a kink app's
 * daydreams for: the archetypes, premises and acts are the ones that recur
 * most in NSFW character cards, erotic audio, erotica and fantasy surveys
 * (docs/daydreams.md, "What the presets are drawn from"). It still runs the
 * whole range, with a few tame entries kept beside the explicit ones so a
 * story can start slow, and the starting points are ordered by heat and say
 * theirs on their buttons (`sceneLevel`, `characterLevel`), so nobody has to
 * guess what they are picking. Every character is an adult, and nothing here
 * is built on blood relations. Pure and alias-free.
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
 * Starting points for a new character: a full set of fields to edit from.
 * Ordered by libido, from SFW to slutty, as the dialog shows them.
 */
export const CHARACTER_TEMPLATES: readonly {
	id: string;
	label: string;
	character: DaydreamCharacter;
}[] = [
	{
		id: 'best-friend',
		label: 'The best friend',
		character: {
			name: 'Robin',
			archetype: 'best friend with a secret crush',
			personality: 'kind, witty, flustered whenever you get close',
			speech: 'dry humour, changes the subject when it gets serious',
			appearance: 'freckles, an easy smile, wearing your hoodie again',
			likes: 'banter, slow build-up, finally saying it',
			notes: '',
			dials: {
				tone: 'warm',
				control: 2,
				strictness: 1,
				edge: 1,
				talk: 4,
				libido: 1,
				kink: 1
			}
		}
	},
	{
		id: 'innocent',
		label: 'The innocent',
		character: {
			name: 'Ellis',
			archetype: 'shy virgin',
			personality: 'shy, curious, braver than they look',
			speech: 'stammers, apologises, then asks for more',
			appearance: 'blushes all the way down',
			likes: 'being shown how, praise, slow build-up, being corrupted',
			notes: '',
			dials: {
				tone: 'warm',
				control: 1,
				strictness: 1,
				edge: 1,
				talk: 3,
				libido: 2,
				kink: 2
			}
		}
	},
	{
		id: 'gentle-dom',
		label: 'The gentle dom',
		character: {
			name: 'Sam',
			archetype: 'gentle dom',
			personality: 'calm, protective, praising',
			speech: 'speaks softly, calls you good girl or good boy, uses pet names',
			appearance: 'strong hands, an easy smile',
			likes: 'praise kink, taking care of you, aftercare, slow build-up',
			notes: '',
			dials: {
				tone: 'warm',
				control: 4,
				strictness: 2,
				edge: 1,
				talk: 3,
				libido: 3,
				kink: 2
			}
		}
	},
	{
		id: 'rival',
		label: 'The rival',
		character: {
			name: 'Dex',
			archetype: 'competitive rival',
			personality: 'smug, competitive, secretly obsessed with you',
			speech: 'insults that sound like flirting',
			appearance: 'sharp suit, a smirk you want to wipe off',
			likes: 'winning, hate sex, making you admit you want it',
			notes: '',
			dials: {
				tone: 'teasing',
				control: 4,
				strictness: 1,
				edge: 3,
				talk: 4,
				libido: 3,
				kink: 2
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
		id: 'boss',
		label: 'The cold boss',
		character: {
			name: 'Lady Vale',
			archetype: 'strict boss',
			personality: 'possessive, sardonic, demanding',
			speech: 'formal and precise, “my office, now”',
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
		id: 'keyholder',
		label: 'The keyholder',
		character: {
			name: 'Sloane',
			archetype: 'keyholder',
			personality: 'patient, smug, endlessly amused by your frustration',
			speech: 'asks how many days it has been, every single day',
			appearance: 'a key on a chain around their neck',
			likes: 'chastity, orgasm denial, ruined orgasms, making you beg',
			notes: '',
			dials: {
				tone: 'teasing',
				control: 5,
				strictness: 4,
				edge: 3,
				talk: 3,
				libido: 3,
				kink: 4
			}
		}
	},
	{
		id: 'hypnotist',
		label: 'The hypnotist',
		character: {
			name: 'Silas',
			archetype: 'hypnotist',
			personality: 'calm, patient, quietly controlling',
			speech: 'slow and hypnotic, counts you down, uses your trigger words',
			appearance: 'a voice you cannot stop listening to',
			likes: 'trigger words, making you obey without knowing why, mindless pleasure',
			notes: '',
			dials: {
				tone: 'warm',
				control: 5,
				strictness: 3,
				edge: 2,
				talk: 3,
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
		id: 'admirer',
		label: 'The obsessive admirer',
		character: {
			name: 'Ivy',
			archetype: 'yandere',
			personality: 'sweet, devoted, possessive to the point of menace',
			speech: 'soft and adoring, until someone else looks at you',
			appearance: 'a stare that does not blink, a photo of you in their wallet',
			likes: 'claiming you, marking you as theirs, never letting you go',
			notes: '',
			dials: {
				tone: 'warm',
				control: 4,
				strictness: 2,
				edge: 3,
				talk: 3,
				libido: 4,
				kink: 3
			}
		}
	},
	{
		id: 'demon',
		label: 'The demon',
		character: {
			name: 'Nyx',
			archetype: 'demon',
			personality: 'seductive, patient, delighted by your weakness',
			speech: 'old-fashioned, and every sentence is a bargain',
			appearance: 'horns and a tail, eyes that glow in the dark',
			likes: 'deals, corruption, collecting what you owe in your body',
			notes: '',
			dials: {
				tone: 'teasing',
				control: 5,
				strictness: 3,
				edge: 3,
				talk: 3,
				libido: 4,
				kink: 4
			}
		}
	},
	{
		id: 'brat',
		label: 'The brat',
		character: {
			name: 'Kit',
			archetype: 'brat',
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
		id: 'pet-owner',
		label: 'The pet owner',
		character: {
			name: 'Marlowe',
			archetype: 'pet owner',
			personality: 'affectionate, strict, treats you as an animal and nothing more',
			speech: 'speaks to you like a pet, good pet, bad pet',
			appearance: 'a leash wrapped round one hand',
			likes: 'pet play, collars, crawling, treats and punishments, using their pet',
			notes: '',
			dials: {
				tone: 'warm',
				control: 5,
				strictness: 4,
				edge: 3,
				talk: 2,
				libido: 4,
				kink: 4
			}
		}
	},
	{
		id: 'interrogator',
		label: 'The interrogator',
		character: {
			name: 'Hale',
			archetype: 'interrogator',
			personality: 'cold, methodical, sadistic',
			speech: 'asks the same question again and again, quietly',
			appearance: 'a uniform, rolled-up sleeves, a stare that does not blink',
			likes: 'restraint, sensory deprivation, forced orgasms, overstimulation, breaking you',
			notes: '',
			dials: {
				tone: 'clinical',
				control: 5,
				strictness: 5,
				edge: 5,
				talk: 2,
				libido: 4,
				kink: 5
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
		id: 'eager-sub',
		label: 'The eager sub',
		character: {
			name: 'Remy',
			archetype: 'eager submissive',
			personality: 'sweet, devoted, desperate to please',
			speech: 'says please and thank you for everything, asks permission',
			appearance: 'a collar they never take off',
			likes: 'serving, being told what to do, praise kink, being used',
			notes: '',
			dials: {
				tone: 'warm',
				control: 1,
				strictness: 1,
				edge: 1,
				talk: 3,
				libido: 4,
				kink: 3
			}
		}
	},
	{
		id: 'masochist',
		label: 'The pain slut',
		character: {
			name: 'Vic',
			archetype: 'pain slut',
			personality: 'defiant until it hurts, then grateful',
			speech: 'begs for more, counts every stroke',
			appearance: 'last week’s marks still fading',
			likes: 'impact play, being made to take it, degradation, more than they can handle',
			notes: '',
			dials: {
				tone: 'teasing',
				control: 1,
				strictness: 1,
				edge: 1,
				talk: 3,
				libido: 4,
				kink: 5
			}
		}
	},
	{
		id: 'struggler',
		label: 'The fighter',
		character: {
			name: 'Sasha',
			archetype: 'kinky switch',
			personality: 'fierce, stubborn, fights like they mean it',
			speech: 'swears at you, says no and means more, and has a safeword for when they mean stop',
			appearance: 'scratches left on whoever caught them last',
			likes: 'consensual non-consent, struggle, being overpowered, rough sex',
			notes: '',
			dials: {
				tone: 'cold',
				control: 2,
				strictness: 1,
				edge: 2,
				talk: 3,
				libido: 4,
				kink: 5
			}
		}
	},
	{
		id: 'beast',
		label: 'The beast',
		character: {
			name: 'Rhys',
			archetype: 'werewolf',
			personality: 'possessive, instinctive, barely holding back',
			speech: 'growls more than talks, short and clipped',
			appearance: 'scarred, much bigger than you, eyes gone gold',
			likes: 'the chase, pinning you down, breeding, marking you as theirs',
			notes: '',
			dials: {
				tone: 'cold',
				control: 5,
				strictness: 2,
				edge: 4,
				talk: 1,
				libido: 5,
				kink: 4
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
			likes: 'oral, being watched, dirty talk, sharing, more',
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
	},
	{
		id: 'anal-trainer',
		label: 'The anal trainer',
		character: {
			name: 'Jax',
			archetype: 'anal enthusiast',
			personality: 'strict about the rules, shameless about everything else',
			speech: 'talks dirty, praises how much you can take',
			appearance: 'a drawer full of plugs in rising sizes',
			likes: 'anal, anal training, plugs, stretching you, keeping you plugged all day',
			notes: '',
			dials: {
				tone: 'teasing',
				control: 4,
				strictness: 4,
				edge: 3,
				talk: 4,
				libido: 5,
				kink: 4
			}
		}
	},
	{
		id: 'intruder',
		label: 'The masked intruder',
		character: {
			name: 'Cole',
			archetype: 'masked intruder',
			personality: 'ruthless in the role, careful underneath it',
			speech: 'few words and all of them threats',
			appearance: 'a balaclava, gloves, much bigger than you',
			likes: 'consensual non-consent, struggle, pinning you down, rough sex',
			notes: '',
			dials: {
				tone: 'cold',
				control: 5,
				strictness: 3,
				edge: 5,
				talk: 1,
				libido: 5,
				kink: 5
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
		id: 'one-bed',
		label: 'Only one bed',
		scene: {
			title: 'Only one bed',
			setting: 'a snowed-in lodge',
			premise:
				'snowed in with your best friend, one bed, and years of things neither of you has said',
			yourRole: 'yourself',
			tone: 'slow-burn, tender',
			notes: '',
			parts: [
				{ name: 'the best friend', description: 'booked the room, and swears it was a mistake' }
			],
			dials: { heat: 1, kink: 1 }
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
		id: 'after-hours',
		label: 'After hours',
		scene: {
			title: 'After hours',
			setting: 'an empty office after hours',
			premise: 'kept late after the presentation you botched, to make it up to your boss',
			yourRole: 'the new hire',
			tone: 'slow-burn, tense',
			notes: '',
			parts: [
				{ name: 'the boss', description: 'kept you behind, and decides how you make up for it' }
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
			premise:
				'a test you have to pass, under rules you don’t know yet: obedience, endurance, being watched',
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
		id: 'your-assessment',
		label: 'The assessment',
		scene: {
			title: 'The assessment',
			setting: 'a training facility',
			premise:
				'you run the assessment: a trainee who does not know the rules yet, and a test of obedience, endurance and being watched',
			yourRole: 'the instructor',
			tone: 'clinical, strict',
			notes: '',
			parts: [
				{ name: 'the trainee', description: 'desperate to pass, and does not know the rules yet' },
				{ name: 'the observer', description: 'watches, takes notes, says little' }
			],
			dials: { heat: 3, kink: 4 }
		}
	},
	{
		id: 'your-office',
		label: 'Your office',
		scene: {
			title: 'Your office',
			setting: 'your office after hours',
			premise:
				'your new hire botched the presentation, and you have kept them late to decide how they make up for it',
			yourRole: 'the boss',
			tone: 'strict, slow-burn',
			notes: '',
			parts: [
				{
					name: 'the new hire',
					description: 'nervous, eager, and willing to do anything to keep the job'
				}
			],
			dials: { heat: 3, kink: 3 }
		}
	},
	{
		id: 'rivals',
		label: 'Rivals',
		scene: {
			title: 'Rivals',
			setting: 'an empty office after hours',
			premise: 'rivals forced to work together overnight, and one argument too many',
			yourRole: 'yourself',
			tone: 'tense, steamy',
			notes: '',
			parts: [
				{
					name: 'the rival',
					description: 'has made your life hell, and cannot stop looking at you'
				}
			],
			dials: { heat: 4, kink: 2 }
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
		id: 'won-bet',
		label: 'The won bet',
		scene: {
			title: 'The won bet',
			setting: 'home, on a quiet evening',
			premise: 'a bet you won, and the evening they promised to give up',
			yourRole: 'the winner',
			tone: 'playful, humiliating',
			notes: '',
			parts: [
				{
					name: 'the loser',
					description: 'lost the bet, and is going to be a brat about paying up'
				}
			],
			dials: { heat: 4, kink: 3 }
		}
	},
	{
		id: 'admirer',
		label: 'The admirer',
		scene: {
			title: 'The admirer',
			setting: 'your apartment, late at night',
			premise:
				'the notes, the gifts, the feeling of being watched: tonight your admirer lets you see them',
			yourRole: 'yourself',
			tone: 'dark, possessive',
			notes: '',
			parts: [
				{ name: 'the admirer', description: 'has wanted you for months, and is done waiting' }
			],
			dials: { heat: 4, kink: 3 }
		}
	},
	{
		id: 'your-obsession',
		label: 'Your obsession',
		scene: {
			title: 'Your obsession',
			setting: 'their apartment, late at night',
			premise: 'months of notes, gifts and watching: tonight you finally let them see you',
			yourRole: 'the admirer',
			tone: 'dark, possessive',
			notes: '',
			parts: [
				{
					name: 'the one you watch',
					description: 'has felt you watching for months, and left the door unlocked'
				}
			],
			dials: { heat: 4, kink: 3 }
		}
	},
	{
		id: 'summoning',
		label: 'The summoning',
		scene: {
			title: 'The summoning',
			setting: 'a summoning circle in candlelight',
			premise: 'a deal with a demon: your wish granted, paid for with your body',
			yourRole: 'the one who summoned it',
			tone: 'dark, teasing, steamy',
			notes: '',
			parts: [{ name: 'the demon', description: 'answered the call, and names the price' }],
			dials: { heat: 4, kink: 3 }
		}
	},
	{
		id: 'summoned',
		label: 'Summoned',
		scene: {
			title: 'Summoned',
			setting: 'a summoning circle in candlelight',
			premise: 'a mortal has summoned you for a wish, and you name the price: their body',
			yourRole: 'the demon',
			tone: 'dark, teasing, steamy',
			notes: '',
			parts: [
				{ name: 'the summoner', description: 'drew the circle, and did not read the small print' }
			],
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
		id: 'brat-taming',
		label: 'Brat taming',
		scene: {
			title: 'Brat taming',
			setting: 'home, on a quiet evening',
			premise: 'your brat has pushed all week, and tonight you stop letting it slide',
			yourRole: 'their dom',
			tone: 'playful, strict',
			notes: '',
			parts: [
				{
					name: 'the brat',
					description: 'mouthy, defiant, and hoping you finally do something about it'
				}
			],
			dials: { heat: 4, kink: 3 }
		}
	},
	{
		id: 'tamed',
		label: 'Tamed',
		scene: {
			title: 'Tamed',
			setting: 'home, on a quiet evening',
			premise: 'you have pushed all week, and tonight your dom stops letting it slide',
			yourRole: 'the brat',
			tone: 'playful, strict',
			notes: '',
			parts: [{ name: 'your dom', description: 'patient all week, and done being patient' }],
			dials: { heat: 4, kink: 3 }
		}
	},
	{
		id: 'the-key',
		label: 'The key',
		scene: {
			title: 'The key',
			setting: 'home, with the key around your neck',
			premise:
				'you have kept your partner locked in chastity for three weeks, and they have started to beg',
			yourRole: 'the keyholder',
			tone: 'teasing, strict, degrading',
			notes: '',
			parts: [
				{ name: 'the locked one', description: 'three weeks without, and losing their mind' }
			],
			dials: { heat: 4, kink: 4 }
		}
	},
	{
		id: 'new-pet',
		label: 'Your new pet',
		scene: {
			title: 'Your new pet',
			setting: 'your apartment, set up for a pet',
			premise:
				'your partner asked to be your pet for the weekend: a collar, a leash, a bowl on the floor, and no words allowed',
			yourRole: 'the owner',
			tone: 'ritual, tender, humiliating',
			notes: '',
			parts: [{ name: 'the pet', description: 'yours for the weekend, and eager to be trained' }],
			dials: { heat: 4, kink: 4 }
		}
	},
	{
		id: 'locked',
		label: 'Locked',
		scene: {
			title: 'Locked',
			setting: 'home, on a quiet evening',
			premise: 'locked in chastity for a month, and the keyholder decides when, if ever, you come',
			yourRole: 'the one locked up',
			tone: 'teasing, strict, degrading',
			notes: '',
			parts: [
				{ name: 'the keyholder', description: 'holds the key, and checks the lock every day' }
			],
			dials: { heat: 4, kink: 4 }
		}
	},
	{
		id: 'good-pet',
		label: 'Good pet',
		scene: {
			title: 'Good pet',
			setting: 'their apartment, set up for a pet',
			premise:
				'a weekend as their pet: a collar, a leash, a bowl on the floor, and no words allowed',
			yourRole: 'the pet',
			tone: 'ritual, tender, humiliating',
			notes: '',
			parts: [
				{ name: 'the owner', description: 'feeds you, trains you, and uses you when they like' }
			],
			dials: { heat: 4, kink: 4 }
		}
	},
	{
		id: 'trigger-words',
		label: 'Trigger words',
		scene: {
			title: 'Trigger words',
			setting: 'a dim room with a comfortable chair',
			premise:
				'months of conditioning you agreed to, and tonight they start using the trigger words',
			yourRole: 'the subject',
			tone: 'hypnotic, slow, steamy',
			notes: '',
			parts: [
				{
					name: 'the hypnotist',
					description: 'planted every trigger, and knows exactly what each one does'
				}
			],
			dials: { heat: 4, kink: 4 }
		}
	},
	{
		id: 'your-subject',
		label: 'Your subject',
		scene: {
			title: 'Your subject',
			setting: 'a dim room with a comfortable chair',
			premise:
				'months of conditioning they agreed to, and tonight you start using the trigger words',
			yourRole: 'the hypnotist',
			tone: 'hypnotic, slow, steamy',
			notes: '',
			parts: [
				{ name: 'the subject', description: 'conditioned for months, and every trigger works' }
			],
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
		id: 'mating-season',
		label: 'Mating season',
		scene: {
			title: 'Mating season',
			setting: 'a cabin in the woods on the full moon',
			premise:
				'it is their rut, and they mean to breed you before morning, as many times as it takes',
			yourRole: 'their mate',
			tone: 'primal, possessive, filthy',
			notes: '',
			parts: [{ name: 'your mate', description: 'has waited all month, and will not be gentle' }],
			dials: { heat: 5, kink: 3 }
		}
	},
	{
		id: 'your-rut',
		label: 'Your rut',
		scene: {
			title: 'Your rut',
			setting: 'a cabin in the woods on the full moon',
			premise:
				'it is your rut, and you mean to breed your mate before morning, as many times as it takes',
			yourRole: 'the one in rut',
			tone: 'primal, possessive, filthy',
			notes: '',
			parts: [
				{ name: 'your mate', description: 'came to the cabin knowing exactly what it is for' }
			],
			dials: { heat: 5, kink: 3 }
		}
	},
	{
		id: 'threesome',
		label: 'Three of us',
		scene: {
			title: 'Three of us',
			setting: 'home, on a quiet evening',
			premise: 'the threesome you finally said yes to, and the guest your partner chose',
			yourRole: 'the one being shared',
			tone: 'playful, filthy',
			notes: '',
			parts: [
				{ name: 'your partner', description: 'set it all up, and wants to watch' },
				{ name: 'the guest', description: 'invited for you, and very keen' }
			],
			dials: { heat: 5, kink: 3 }
		}
	},
	{
		id: 'sharing-them',
		label: 'Sharing them',
		scene: {
			title: 'Sharing them',
			setting: 'home, on a quiet evening',
			premise:
				'you and your partner have a guest for the night, and the guest is there to be shared',
			yourRole: 'one of the two in charge',
			tone: 'playful, filthy',
			notes: '',
			parts: [
				{ name: 'your partner', description: 'goes along with whatever you decide' },
				{ name: 'the guest', description: 'eager, and outnumbered' }
			],
			dials: { heat: 5, kink: 3 }
		}
	},
	{
		id: 'hotwife',
		label: 'Made to watch',
		scene: {
			title: 'Made to watch',
			setting: 'your bedroom, with a chair at the foot of the bed',
			premise: 'your partner has brought someone home, and you are only allowed to watch',
			yourRole: 'the one watching',
			tone: 'humiliating, filthy',
			notes: '',
			parts: [
				{ name: 'your partner', description: 'chose the guest, and wants you to see everything' },
				{ name: 'the bull', description: 'smug, and much better at this than you' }
			],
			dials: { heat: 5, kink: 3 }
		}
	},
	{
		id: 'the-bull',
		label: 'The bull',
		scene: {
			title: 'The bull',
			setting: 'a couple’s bedroom, with a chair at the foot of the bed',
			premise:
				'a couple has invited you over: one of them is for you, the other is only allowed to watch',
			yourRole: 'the bull',
			tone: 'humiliating, filthy',
			notes: '',
			parts: [
				{ name: 'the partner', description: 'the one you are here for' },
				{ name: 'the one watching', description: 'sits in the chair, and is not allowed to touch' }
			],
			dials: { heat: 5, kink: 3 }
		}
	},
	{
		id: 'hunt',
		label: 'The hunt',
		scene: {
			title: 'The hunt',
			setting: 'a forest at night, under a full moon',
			premise:
				'a chase you agreed to beforehand: run, and once you are caught you are theirs, with a safeword to stop it',
			yourRole: 'the prey',
			tone: 'primal, dark',
			notes: '',
			parts: [
				{ name: 'the hunter', description: 'gives you a head start, and never needs a second one' }
			],
			dials: { heat: 5, kink: 4 }
		}
	},
	{
		id: 'your-hunt',
		label: 'Your hunt',
		scene: {
			title: 'Your hunt',
			setting: 'a forest at night, under a full moon',
			premise:
				'a chase you agreed to beforehand: they run, and once you catch them they are yours, with a safeword to stop it',
			yourRole: 'the hunter',
			tone: 'primal, dark',
			notes: '',
			parts: [{ name: 'the prey', description: 'took the head start, and wants to be caught' }],
			dials: { heat: 5, kink: 4 }
		}
	},
	{
		id: 'free-use',
		label: 'Free use',
		scene: {
			title: 'Free use',
			setting: 'a shared house with one rule',
			premise:
				'the household agreed to free use: anyone may use you, any time, anywhere in the house, and only your safeword stops it',
			yourRole: 'the free-use toy',
			tone: 'casual, relentless, filthy',
			notes: '',
			parts: [
				{ name: 'the housemate', description: 'never asks, never needs to' },
				{ name: 'the other housemate', description: 'uses you between other things, like a habit' }
			],
			dials: { heat: 5, kink: 4 }
		}
	},
	{
		id: 'anal-only',
		label: 'Back door only',
		scene: {
			title: 'Back door only',
			setting: 'home, where the rules are on the fridge',
			premise:
				'an anal-only arrangement: your front is off-limits for good, you stay plugged, and every day is training',
			yourRole: 'yourself',
			tone: 'strict, routine, filthy',
			notes: '',
			parts: [
				{ name: 'your partner', description: 'keeps the rules, the plugs, and the schedule' }
			],
			dials: { heat: 5, kink: 4 }
		}
	},
	{
		id: 'gangbang',
		label: 'The gangbang',
		scene: {
			title: 'The gangbang',
			setting: 'a room booked for a gangbang',
			premise:
				'a gangbang you signed up for: a room full of strangers, a count to reach, and nobody leaves early',
			yourRole: 'the guest of honour',
			tone: 'relentless, degrading, filthy',
			notes: '',
			parts: [
				{
					name: 'the organiser',
					description: 'booked the room, keeps the count, and sends the next one in'
				},
				{ name: 'the first in line', description: 'has been watching you undress' }
			],
			dials: { heat: 5, kink: 4 }
		}
	},
	{
		id: 'the-organiser',
		label: 'The organiser',
		scene: {
			title: 'The organiser',
			setting: 'a room booked for a gangbang',
			premise:
				'a gangbang they signed up for: you booked the room, you keep the count, and you send the next one in',
			yourRole: 'the organiser',
			tone: 'relentless, degrading, filthy',
			notes: '',
			parts: [
				{
					name: 'the guest of honour',
					description: 'signed up for this, and is starting to regret the number'
				},
				{ name: 'the first in line', description: 'has been watching them undress' }
			],
			dials: { heat: 5, kink: 4 }
		}
	},
	{
		id: 'break-in',
		label: 'The break-in',
		scene: {
			title: 'The break-in',
			setting: 'your home, after dark',
			premise:
				'a home invasion you scripted together weeks ago: they choose the night, you fight back, and only the safeword stops it',
			yourRole: 'yourself',
			tone: 'dark, brutal',
			notes: '',
			parts: [
				{ name: 'the intruder', description: 'your partner, playing someone you have never met' }
			],
			dials: { heat: 5, kink: 5 }
		}
	},
	{
		id: 'interrogation',
		label: 'The interrogation',
		scene: {
			title: 'The interrogation',
			setting: 'a holding cell',
			premise:
				'captured behind enemy lines: they want a name, and they have all night to get it out of you',
			yourRole: 'the captive',
			tone: 'cold, brutal, relentless',
			notes: '',
			parts: [
				{
					name: 'the interrogator',
					description: 'asks the questions, and decides what each wrong answer costs'
				}
			],
			dials: { heat: 5, kink: 5 }
		}
	},
	{
		id: 'house-rules',
		label: 'House rules',
		scene: {
			title: 'House rules',
			setting: 'your shared house',
			premise:
				'your housemate agreed to free use: you may use them any time, anywhere in the house, and only their safeword stops you',
			yourRole: 'the one using them',
			tone: 'casual, relentless, filthy',
			notes: '',
			parts: [{ name: 'the housemate', description: 'agreed to every rule, and pretends to mind' }],
			dials: { heat: 5, kink: 4 }
		}
	},
	{
		id: 'training-them',
		label: 'Training them',
		scene: {
			title: 'Training them',
			setting: 'home, where your rules are on the fridge',
			premise:
				'an anal-only arrangement you run: their front is off-limits for good, they stay plugged, and you set the training',
			yourRole: 'the one in charge',
			tone: 'strict, routine, filthy',
			notes: '',
			parts: [
				{ name: 'your partner', description: 'wears the plug you chose, and follows your schedule' }
			],
			dials: { heat: 5, kink: 4 }
		}
	},
	{
		id: 'your-break-in',
		label: 'Your break-in',
		scene: {
			title: 'Your break-in',
			setting: 'their home, after dark',
			premise:
				'a home invasion you scripted together weeks ago: you choose the night, they fight back, and only their safeword stops you',
			yourRole: 'the intruder',
			tone: 'dark, brutal',
			notes: '',
			parts: [
				{
					name: 'the one at home',
					description: 'your partner, playing someone who has never met you'
				}
			],
			dials: { heat: 5, kink: 5 }
		}
	},
	{
		id: 'your-captive',
		label: 'Your captive',
		scene: {
			title: 'Your captive',
			setting: 'a holding cell',
			premise:
				'you caught a spy behind your lines: you want a name, and you have all night to get it out of them',
			yourRole: 'the interrogator',
			tone: 'cold, brutal, relentless',
			notes: '',
			parts: [{ name: 'the captive', description: 'defiant, and not as strong as they think' }],
			dials: { heat: 5, kink: 5 }
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
	},
	{
		id: 'your-party',
		label: 'Your party',
		scene: {
			title: 'Your party',
			setting: 'a play party in a dungeon',
			premise:
				'a play party you run, and tonight’s toy is yours to use and hand out, within their limits',
			yourRole: 'the host',
			tone: 'filthy, brutal',
			notes: '',
			parts: [
				{ name: 'the toy', description: 'new, nervous, and yours for the night' },
				{ name: 'the regular', description: 'has been waiting for someone new' }
			],
			dials: { heat: 5, kink: 5 }
		}
	}
];
