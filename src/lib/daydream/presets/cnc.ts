import type { PresetModule } from './types';

/** The chase, captivity, free use and the hardest end of the range. See `presets/index.ts`. */
export const CNC: PresetModule = {
	characters: [],
	ideas: [
		{
			id: 'hunt',
			label: 'The hunt',
			idea: {
				title: 'The hunt',
				setting: 'a forest at night, under a full moon',
				premise:
					'a chase you agreed to beforehand: run, and once you are caught you are theirs, with a safeword to stop it',
				yourRole: 'the prey',
				tone: 'primal, dark',
				notes: '',
				parts: [
					{
						name: 'the hunter',
						description: 'gives you a head start, and never needs a second one'
					}
				],
				dials: { heat: 5, kink: 4 }
			}
		},
		{
			id: 'your-hunt',
			label: 'Your hunt',
			idea: {
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
			idea: {
				title: 'Free use',
				setting: 'a shared house with one rule',
				premise:
					'the household agreed to free use: anyone may use you, any time, anywhere in the house, and only your safeword stops it',
				yourRole: 'the free-use toy',
				tone: 'casual, relentless, filthy',
				notes: '',
				parts: [
					{ name: 'the housemate', description: 'never asks, never needs to' },
					{
						name: 'the other housemate',
						description: 'uses you between other things, like a habit'
					}
				],
				dials: { heat: 5, kink: 4 }
			}
		},
		{
			id: 'anal-only',
			label: 'Back door only',
			idea: {
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
			id: 'break-in',
			label: 'The break-in',
			idea: {
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
			idea: {
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
			id: 'your-break-in',
			label: 'Your break-in',
			idea: {
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
			idea: {
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
			idea: {
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
	],
	starters: [
		{
			id: 'hunt',
			you: 'sub',
			tags: ['CNC', 'primal', 'chase'],
			voice: 'told',
			idea: 'hunt',
			summary:
				'[[idea|A chase through a moonlit forest, agreed beforehand, with a safeword to stop it]]. [[Rhys|Rhys]], your partner, counts down your head start, and once you are caught you are theirs, for something [[heat|filthy]]. It’s told [[voice|to you by a narrator]].',
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
			idea: 'your-hunt',
			summary:
				'[[idea|A chase through a moonlit forest, agreed beforehand, with a safeword to stop it]]. [[Sasha|Sasha]], your partner, is already running, and once you catch them they are yours, for something [[heat|filthy]]. It’s told [[voice|to you by a narrator]].',
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
			idea: 'free-use',
			summary:
				'[[idea|A shared house where you are free use, any time, anywhere, until your safeword]]. [[Tess|Tess]] bends you over the kitchen counter without a word, while [[Jules|Jules]] waits their turn, not patiently, for something [[heat|filthy]]. It’s told [[voice|to you by a narrator]].',
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
			idea: 'anal-only',
			summary:
				'[[idea|An anal-only arrangement, with the rules on the fridge]]. [[Jax|Jax]], your partner, checks your plug and brings out the next size up, for a [[heat|filthy]] day of training. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			id: 'break-in',
			you: 'sub',
			tags: ['CNC', 'home invasion', 'struggle', 'rough sex'],
			voice: 'told',
			idea: 'break-in',
			summary:
				'[[idea|A home invasion you scripted together weeks ago, with a safeword to stop it]]. [[Cole|Cole]], your partner playing a stranger, is already inside when you get home after dark, and you fight back, for something [[heat|filthy]]. It’s told [[voice|to you by a narrator]].',
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
			idea: 'interrogation',
			summary:
				'[[idea|Captured behind enemy lines, and questioned in a holding cell]]. [[Hale|Hale]], the officer who caught you, pulls up a chair: they want a name, and have all night and [[heat|filthy]] means to get it. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			id: 'your-break-in',
			you: 'dom',
			tags: ['CNC', 'home invasion', 'struggle', 'rough sex'],
			voice: 'told',
			idea: 'your-break-in',
			summary:
				'[[idea|A home invasion you scripted together weeks ago, with a safeword to stop it]]. You are already inside when [[Sasha|Sasha]], your partner, gets home after dark, and they fight back, for something [[heat|filthy]]. It’s told [[voice|to you by a narrator]].',
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
			idea: 'your-captive',
			summary:
				'[[idea|A spy caught behind your lines, chained in a holding cell]]. [[Vic|Vic]] spits at you: you want a name, and you have all night and [[heat|filthy]] means to get it. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			idea: 'dungeon',
			summary:
				'[[idea|A night of being used at a play party in a dungeon]]. [[Corin|Corin]], the host, presents you to the room, and [[Jules|Jules]] is first in line, for a [[heat|filthy]] night with nothing off the table but your limits. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
		}
	]
};
