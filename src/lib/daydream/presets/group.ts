import type { PresetModule } from './types';

/** Threesomes, sharing, watching and being watched. See `presets/index.ts`. */
export const GROUP: PresetModule = {
	characters: [],
	ideas: [
		{
			id: 'threesome',
			label: 'Three of us',
			idea: {
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
			idea: {
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
			idea: {
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
			idea: {
				title: 'The bull',
				setting: 'a couple’s bedroom, with a chair at the foot of the bed',
				premise:
					'a couple has invited you over: one of them is for you, the other is only allowed to watch',
				yourRole: 'the bull',
				tone: 'humiliating, filthy',
				notes: '',
				parts: [
					{ name: 'the partner', description: 'the one you are here for' },
					{
						name: 'the one watching',
						description: 'sits in the chair, and is not allowed to touch'
					}
				],
				dials: { heat: 5, kink: 3 }
			}
		},
		{
			id: 'gangbang',
			label: 'The gangbang',
			idea: {
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
			idea: {
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
			id: 'your-party',
			label: 'Your party',
			idea: {
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
	],
	starters: [
		{
			id: 'threesome',
			you: 'sub',
			tags: ['threesome', 'sharing', 'praise'],
			voice: 'talk',
			idea: 'threesome',
			summary:
				'[[idea|The threesome you finally said yes to, at home]]. [[Sam|Sam]], your partner, set the night up and talks you through it, while [[Tess|Tess]], the guest Sam chose, cannot keep their hands off you: a [[heat|filthy]] night. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			idea: 'sharing-them',
			summary:
				'[[idea|A guest for the night, there to be shared by you and your partner]]. [[Tess|Tess]] is already undressing [[Remy|Remy]], who cannot believe their luck, at the start of a [[heat|filthy]] night. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			idea: 'hotwife',
			summary:
				'[[idea|Your partner has brought someone home, and you are only allowed to watch]]. From the chair at the foot of the bed, you see [[Jules|Jules]] with [[Dex|Dex]], who makes sure you see every [[heat|filthy]] second. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			idea: 'the-bull',
			summary:
				'[[idea|A couple’s invitation: one of them is yours, and the other only watches]]. [[Jules|Jules]] pulls you onto the bed, and [[Remy|Remy]], their partner, watches every [[heat|filthy]] second from the chair. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			id: 'gangbang',
			you: 'sub',
			tags: ['gangbang', 'group', 'degradation'],
			voice: 'told',
			idea: 'gangbang',
			summary:
				'[[idea|A gangbang you signed up for: a room full of strangers and a count to reach]]. [[Tess|Tess]] keeps the count, and [[Rhys|Rhys]] is first in line, not waiting, for a [[heat|filthy]] night where nobody leaves early. It’s told [[voice|to you by a narrator]].',
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
			idea: 'the-organiser',
			summary:
				'[[idea|A gangbang you organise: you booked the room, and you keep the count]]. [[Vic|Vic]] is on the bed, counting the people in the room, and [[Rhys|Rhys]] is first in line, for a [[heat|filthy]] night. It’s told [[voice|to you by a narrator]].',
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
			id: 'your-party',
			you: 'dom',
			tags: ['being used', 'impact play', 'sadism', 'group'],
			voice: 'talk',
			idea: 'your-party',
			summary:
				'[[idea|A play party you host in a dungeon, with tonight’s toy yours to use and hand out]]. [[Vic|Vic]] kneels in the middle of the room, and [[Jules|Jules]] is first in line, for a [[heat|filthy]] night within their limits. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
	]
};
