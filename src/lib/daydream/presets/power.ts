import type { PresetModule } from './types';

/** Bosses, tests, bets, contracts and brats: power at work and at play. See `presets/index.ts`. */
export const POWER: PresetModule = {
	characters: [],
	ideas: [
		{
			id: 'after-hours',
			label: 'After hours',
			idea: {
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
			idea: {
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
			idea: {
				title: 'The assessment',
				setting: 'a training facility',
				premise:
					'you run the assessment: a trainee who does not know the rules yet, and a test of obedience, endurance and being watched',
				yourRole: 'the instructor',
				tone: 'clinical, strict',
				notes: '',
				parts: [
					{
						name: 'the trainee',
						description: 'desperate to pass, and does not know the rules yet'
					},
					{ name: 'the observer', description: 'watches, takes notes, says little' }
				],
				dials: { heat: 3, kink: 4 }
			}
		},
		{
			id: 'your-office',
			label: 'Your office',
			idea: {
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
			id: 'lost-bet',
			label: 'The lost bet',
			idea: {
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
			idea: {
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
			id: 'contract',
			label: 'The contract',
			idea: {
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
			idea: {
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
			idea: {
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
			id: 'house-rules',
			label: 'House rules',
			idea: {
				title: 'House rules',
				setting: 'your shared house',
				premise:
					'your housemate agreed to free use: you may use them any time, anywhere in the house, and only their safeword stops you',
				yourRole: 'the one using them',
				tone: 'casual, relentless, filthy',
				notes: '',
				parts: [
					{ name: 'the housemate', description: 'agreed to every rule, and pretends to mind' }
				],
				dials: { heat: 5, kink: 4 }
			}
		},
		{
			id: 'training-them',
			label: 'Training them',
			idea: {
				title: 'Training them',
				setting: 'home, where your rules are on the fridge',
				premise:
					'an anal-only arrangement you run: their front is off-limits for good, they stay plugged, and you set the training',
				yourRole: 'the one in charge',
				tone: 'strict, routine, filthy',
				notes: '',
				parts: [
					{
						name: 'your partner',
						description: 'wears the plug you chose, and follows your schedule'
					}
				],
				dials: { heat: 5, kink: 4 }
			}
		}
	],
	starters: [
		{
			id: 'after-hours',
			you: 'sub',
			tags: ['boss', 'office', 'punishment'],
			voice: 'talk',
			idea: 'after-hours',
			summary:
				'[[idea|Kept late in the empty office after you botched the presentation]]. [[Lady Vale|Lady Vale]], your boss, has a [[heat|steamy]] punishment in mind for you to make up for it. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			idea: 'facility',
			summary:
				'[[idea|A test at a training facility, under rules you don’t know yet]]. [[Mara|Mara]], your instructor, runs it by the book: a [[heat|steamy]] trial of obedience, endurance and being watched. It’s told [[voice|as a system’s orders to you]].',
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
			idea: 'your-assessment',
			summary:
				'[[idea|You run the assessment at a training facility]]. [[Remy|Remy]] is the trainee, standing at the line and not yet knowing the rules, and it is a [[heat|steamy]] test of obedience, endurance and being watched. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			idea: 'your-office',
			summary:
				'[[idea|Your new hire, kept late in your office after botching the presentation]]. [[Remy|Remy]] stands in front of your desk, waiting to hear how they will make up for it, and you have a [[heat|steamy]] punishment in mind. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			id: 'lost-bet',
			you: 'sub',
			tags: ['brat', 'humiliation', 'losing a bet'],
			voice: 'talk',
			idea: 'lost-bet',
			summary:
				'[[idea|A bet you lost, and the evening you promised to give up]]. [[Kit|Kit]], your housemate, means to be insufferable about collecting, one [[heat|explicit]] demand at a time. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			idea: 'won-bet',
			summary:
				'[[idea|A bet you won, and the evening they promised to give up]]. [[Kit|Kit]], your housemate, is already arguing about the terms as you collect, one [[heat|explicit]] demand at a time. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			id: 'brat-taming',
			you: 'dom',
			tags: ['brat taming', 'spanking', 'discipline'],
			voice: 'talk',
			idea: 'brat-taming',
			summary:
				'[[idea|Your brat has pushed all week, and tonight you stop letting it slide]]. [[Kit|Kit]] rolls their eyes at your rules one more time, and every consequence is [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			idea: 'tamed',
			summary:
				'[[idea|You have pushed your dom all week, and tonight they stop letting it slide]]. [[Mara|Mara]] calmly lists everything you did, and every consequence is [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			id: 'house-rules',
			you: 'dom',
			tags: ['free use', 'CNC', 'objectification'],
			voice: 'talk',
			idea: 'house-rules',
			summary:
				'[[idea|A shared house where your housemate is free use, any time, anywhere, until their safeword]]. [[Remy|Remy]] is washing up and pretending not to notice you come in, for something [[heat|filthy]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			idea: 'training-them',
			summary:
				'[[idea|An anal-only arrangement you run, with your rules on the fridge]]. [[Kit|Kit]], your partner, complains about the next size up and bends over anyway, for a [[heat|filthy]] day of training. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'brat',
					part: 'your partner',
					relationship: 'your partner',
					doing: 'complaining about the next size up, and bending over anyway'
				}
			]
		}
	]
};
