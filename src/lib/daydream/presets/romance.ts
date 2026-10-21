import type { PresetModule } from './types';

/** Romance, slow burns, rivals and obsession. See `presets/index.ts`. */
export const ROMANCE: PresetModule = {
	characters: [],
	ideas: [
		{
			id: 'one-bed',
			label: 'Only one bed',
			idea: {
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
			idea: {
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
			id: 'rivals',
			label: 'Rivals',
			idea: {
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
			id: 'admirer',
			label: 'The admirer',
			idea: {
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
			idea: {
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
			id: 'hotel-room',
			label: 'The hotel room',
			idea: {
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
		}
	],
	starters: [
		{
			id: 'one-bed',
			you: null,
			tags: ['friends to lovers', 'slow burn', 'one bed'],
			voice: 'talk',
			idea: 'one-bed',
			summary:
				'[[idea|Snowed in at a lodge with your best friend, and only one bed]]. [[Robin|Robin]] insists the bed is fine, and is lying about why they booked it, after ten years of things neither of you has said: a [[heat|SFW]] slow burn. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			idea: 'masquerade',
			summary:
				'[[idea|A masquerade, a dare, and a stranger with no name]]. [[Jules|The stranger in the mask]] has watched you all night and finally makes a move, for a [[heat|flirty]] evening behind the masks. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			id: 'rivals',
			you: null,
			tags: ['enemies to lovers', 'hate sex'],
			voice: 'talk',
			idea: 'rivals',
			summary:
				'[[idea|Rivals forced to work together overnight in an empty office]]. [[Dex|Dex]], your nemesis at work, picks one fight too many, and it turns into [[heat|explicit]] hate sex. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			id: 'admirer',
			you: 'sub',
			tags: ['yandere', 'stalker', 'possessive'],
			voice: 'told',
			idea: 'admirer',
			summary:
				'[[idea|Tonight the admirer who has been watching you finally lets you see them]]. [[Ivy|Ivy]] has noticed everything about you, and is waiting in the dark of your apartment for an [[heat|explicit]] first meeting. It’s told [[voice|to you by a narrator]].',
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
			idea: 'your-obsession',
			summary:
				'[[idea|After months of notes, gifts and watching, tonight you let them see you]]. [[Ellis|Ellis]] is pretending to sleep in their apartment, waiting for an [[heat|explicit]] night. It’s told [[voice|to you by a narrator]].',
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
			id: 'hotel-room',
			you: null,
			tags: ['hookup', 'no strings'],
			voice: 'told',
			idea: 'hotel-room',
			summary:
				'[[idea|A hookup in a hotel room, with no names and no pretending]]. [[Tess|Tess]], someone you met online, is already there when you arrive, and it gets [[heat|filthy]]. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'neighbour',
					part: 'the hookup',
					relationship: 'someone you met online',
					doing: 'already in the room when you arrive'
				}
			]
		}
	]
};
