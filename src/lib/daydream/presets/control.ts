import type { PresetModule } from './types';

/** Chastity, pets, hypnosis and ownership. See `presets/index.ts`. */
export const CONTROL: PresetModule = {
	characters: [],
	ideas: [
		{
			id: 'the-key',
			label: 'The key',
			idea: {
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
			idea: {
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
			idea: {
				title: 'Locked',
				setting: 'home, on a quiet evening',
				premise:
					'locked in chastity for a month, and the keyholder decides when, if ever, you come',
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
			idea: {
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
			idea: {
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
			idea: {
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
		// Monologues: one voice speaking its mind, so no one to cast. The setting
		// is where the voice speaks from, which is nowhere in particular.
		{
			id: 'owned',
			label: 'Owned',
			idea: {
				title: 'Owned',
				setting: 'nowhere in particular: a voice, and you listening',
				premise: 'a voice that knows exactly what being owned means to you, and tells you',
				yourRole: 'the one who wants to be owned',
				tone: 'devoted, relentless, filthy',
				notes: '',
				parts: [],
				dials: { heat: 4, kink: 4 }
			}
		},
		{
			id: 'yours-to-use',
			label: 'Yours to use',
			idea: {
				title: 'Yours to use',
				setting: 'nowhere in particular: a voice, and you listening',
				premise:
					'a devoted voice telling you everything it would let you do to it, and why it needs you in charge',
				yourRole: 'the one in charge',
				tone: 'eager, worshipful, filthy',
				notes: '',
				parts: [],
				dials: { heat: 4, kink: 4 }
			}
		}
	],
	starters: [
		{
			id: 'the-key',
			you: 'dom',
			tags: ['chastity', 'orgasm denial', 'begging'],
			voice: 'talk',
			idea: 'the-key',
			summary:
				'[[idea|Three weeks of keeping your partner locked in chastity, with the key around your neck]]. [[Vic|Vic]] kneels and asks very nicely, and you decide how [[heat|explicit]] tonight gets. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			idea: 'new-pet',
			summary:
				'[[idea|A weekend with your partner as your pet: a collar, a leash, a bowl, and no words allowed]]. [[Remy|Remy]] waits by the door with the leash in their mouth, and the weekend ahead is [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			idea: 'locked',
			summary:
				'[[idea|A month locked in chastity, and the keyholder decides when, if ever, you come]]. [[Sloane|Sloane]], your partner, checks the lock and asks how desperate you are, and the wait is [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			idea: 'good-pet',
			summary:
				'[[idea|A weekend as their pet: a collar, a leash, a bowl, and no words allowed]]. [[Marlowe|Marlowe]], your owner, clips on the leash, and the weekend ahead is [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			idea: 'trigger-words',
			summary:
				'[[idea|Months of conditioning you agreed to, and tonight the trigger words begin]]. [[Silas|Silas]], your partner, says the first one in a dim room, and you go under, into something [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			idea: 'your-subject',
			summary:
				'[[idea|Months of conditioning they asked for, and tonight you start using the trigger words]]. [[Remy|Remy]], your partner, settles into the chair and goes under, into something [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			id: 'owned',
			you: 'sub',
			tags: ['ownership', 'mantras', 'monologue'],
			voice: 'monologue',
			idea: 'owned',
			summary:
				'[[idea|A voice that knows exactly what being owned means to you, and says it]]. It talks about belonging to someone, and gets more [[heat|explicit]] as it goes. It’s told [[voice|as a monologue, one voice speaking its mind]].',
			cast: []
		},
		{
			id: 'yours-to-use',
			you: 'dom',
			tags: ['devotion', 'worship', 'monologue'],
			voice: 'monologue',
			idea: 'yours-to-use',
			summary:
				'[[idea|A devoted voice telling you everything it would let you do to it]]. It’s all about needing you in charge, and it gets more [[heat|explicit]] as it goes. It’s told [[voice|as a monologue, one voice speaking its mind]].',
			cast: []
		}
	]
};
