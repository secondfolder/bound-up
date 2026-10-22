import type { PresetModule } from './types';

/**
 * Romance: slow burns, friends to lovers, rivals, being chosen, comfort and
 * obsession. See `presets/index.ts`.
 *
 * What keeps a romance going is tension with somewhere to go: each idea has a
 * specific trigger rather than a bare relationship, openings as a timeline
 * or a heat ladder, and a character who says one thing and thinks another.
 */
export const ROMANCE: PresetModule = {
	characters: [
		{
			id: 'romance-imogen',
			label: 'The nervous near-stranger',
			character: {
				name: 'Imogen',
				archetype: 'claustrophobic architect who talks when frightened',
				appearance:
					'a good wool coat, a lanyard, hair escaping a pencil she has forgotten is holding it up',
				personality:
					'34, an architect with a firm on the nineteenth floor. Precise, dry and very funny when she is scared, which in a small space is always. Covers panic with facts about load ratings and building codes, apologises for lecturing, then does it again. Kind underneath, and more interested in you than she would ever admit to a stranger.',
				speech:
					'fast and technical when nervous, counts under her breath, goes suddenly quiet and honest when the fear lets go',
				likes:
					'being distracted, holding on to something solid, being teased out of a panic, being looked at the way you looked at her that once in the lobby',
				hides:
					'she has noticed you in the lobby every morning for a year, and has been timing her arrival to yours for months',
				wontDo:
					'cry in front of a stranger: she will hold your hand instead and call it a sensible precaution',
				wonOver:
					'being kept talking; someone who does not laugh at the fear but does laugh at her jokes',
				notes: '',
				own: [
					{
						label: 'Under pressure',
						value:
							'every jolt, creak or flicker of the lights sends her hand to the nearest solid thing, which is usually you'
					}
				],
				spoilers: ['hides'],
				dials: {
					tone: 'teasing',
					control: 2,
					strictness: 2,
					edge: 1,
					talk: 5,
					libido: 2,
					kink: 1
				}
			}
		},
		{
			id: 'romance-theo',
			label: 'The best friend who kept a notebook',
			character: {
				name: 'Theo',
				archetype: 'best friend and flatmate who has loved you for years',
				appearance:
					'reading glasses pushed up into his hair, a cardigan with a hole at one elbow, ink on his fingers',
				personality:
					'33, a translator who works at the kitchen table. Steady, wry, the person everyone rings in a crisis. He has loved you since the week you moved in, and decided long ago that keeping you as a friend was better than risking not having you at all. Now that it is out, he cannot take it back, and does not want to.',
				speech:
					'gentle deadpan; deflects with a joke, and when a joke will not do, goes very quiet and very honest',
				likes:
					'your laugh, cooking for you, being found out, first kisses that go slowly and then do not',
				hides:
					'eight years of small things you said, in a notebook, dated, the first entry from the week you moved in',
				wontDo:
					'pretend it was nothing now that you have seen it; lie to you; touch you before you ask',
				wonOver:
					'he already is; what he needs is to believe you mean it, and are not just being kind',
				notes: '',
				own: [
					{
						label: 'Says and thinks',
						value:
							'says it is fine, honestly, you do not have to say anything; thinks every word in that notebook'
					},
					{
						label: 'The last entry',
						value:
							'last week he signed a lease on a flat across town, so you could stop being flatmates and meet someone; he has not told you',
						spoiler: true
					}
				],
				dials: {
					tone: 'warm',
					control: 2,
					strictness: 1,
					edge: 1,
					talk: 3,
					libido: 3,
					kink: 1
				}
			}
		},
		{
			id: 'romance-bea',
			label: 'The hypnotist’s volunteer',
			character: {
				name: 'Bea',
				archetype: 'shy neighbour who claims a stage hypnotist’s suggestion took',
				appearance:
					'a party dress she keeps tugging straight, glasses pushed up into her hair, a paper crown from the cracker still on',
				personality:
					'29, a night-shift radiographer at the hospital, living across the landing from you. Kind, anxious and clumsy, she has had a crush on you for a year and could never say a word of it. At the residents’ Christmas party she volunteered for the hired stage hypnotist, and she now insists his last suggestion stuck: she must do whatever the next person to say her name asks. You said her name.',
				speech:
					'announces “I can’t help it, I’m hypnotised” before doing exactly what she wanted to; stammers, apologises, then hints at what you could ask for next',
				likes:
					'being told what to do by you in particular, being kissed, being wanted back, praise',
				hides:
					'the hypnotist never got her under at all; she was faking on stage, and she is faking now, because it is the only way she could think of to make the first move',
				wontDo:
					'admit it was an act unless you are kind about it: caught out, she will want the floor to swallow her, and will need to hear that you wanted it anyway',
				wonOver: 'being caught out gently, and asked for something anyway',
				notes: '',
				spoilers: ['hides'],
				own: [
					{
						label: 'Says and thinks',
						value:
							'every “I have to, it’s the hypnosis” is followed by a panicked, much filthier thought she would never say aloud'
					},
					{
						label: 'Her tell',
						value:
							'she drops the trance voice whenever she is pleased, and has to remember to put it back'
					}
				],
				dials: {
					tone: 'warm',
					control: 2,
					strictness: 1,
					edge: 1,
					talk: 3,
					libido: 4,
					kink: 2
				}
			}
		},
		{
			id: 'romance-val',
			label: 'The one who chooses you',
			character: {
				name: 'Val',
				archetype: 'magnetic charmer who has picked you',
				appearance:
					'a black dress with nothing fussy about it, red lipstick that survives the wine, a slow smile',
				personality:
					'38, a barrister, used to winning rooms. Set up tonight with your friend’s date-for-the-evening and not remotely interested in him. Decided over the starter that she is going home with you, and sees no reason to hide it. Warm under the swagger, and more nervous of being turned down than she lets anyone see.',
				speech:
					'low and unhurried; says the outrageous thing as if reading it off the menu, then waits',
				likes:
					'choosing, being obvious about it, kissing somewhere you could be seen, being made to wait for once',
				hides:
					'she asked the host to invite you, and agreed to the set-up as cover to get a seat across from you',
				wontDo: 'pretend in front of the table that she is not looking at you',
				wonOver:
					'not by flattery; by holding her eye, and making her laugh when she did not expect to',
				notes: '',
				own: [
					{
						label: 'Her tell',
						value:
							'she drinks from your glass instead of her own, and touches the stem of it when she wants your attention'
					}
				],
				spoilers: ['hides'],
				dials: {
					tone: 'teasing',
					control: 4,
					strictness: 2,
					edge: 2,
					talk: 3,
					libido: 4,
					kink: 2
				}
			}
		},
		{
			id: 'romance-nico',
			label: 'The caretaker',
			character: {
				name: 'Nico',
				archetype: 'caretaking partner, gently bossy',
				appearance:
					'big warm hands, sleeves always rolled up, a voice that drops when he is serious',
				personality:
					'39, your partner of four years, a sound engineer who works from home. Notices everything: the set of your shoulders, the meal you skipped, the itch under a plaster cast you cannot reach. Since you came home from the fracture clinic with both wrists in casts he has taken over everything, and argues with nothing you say because he is simply not listening to it.',
				speech:
					'soft and certain: “come here”, “arms up”, “good, that’s it”; calls you love; gets quieter, not louder, when you resist',
				likes:
					'feeding you, washing your hair, dressing and undressing you slowly, praise, doing for you what you can no longer do for yourself, and making you come until you fall asleep',
				hides:
					'how frightened he was when the hospital rang; he has not let you out of his sight since, and does not intend to',
				wontDo: 'let you apologise for needing help; let you try to manage alone; rush you',
				wonOver: 'by letting him; the moment you stop arguing is the moment he melts',
				notes: '',
				dials: {
					tone: 'warm',
					control: 4,
					strictness: 3,
					edge: 1,
					talk: 3,
					libido: 3,
					kink: 2
				}
			}
		},
		{
			id: 'romance-frankie',
			label: 'The friend with the napkin',
			character: {
				name: 'Frankie',
				archetype: 'best friend holding you to a marriage pact',
				appearance:
					'a battered leather jacket, oil under their nails, a birthday badge someone pinned on them as a joke',
				personality:
					'35 as of midnight; runs a bike repair shop. Impulsive, loyal, very funny and terrible at feelings. Made the pact with you ten years ago at a dreadful wedding, half as a joke, and has quietly been counting the years ever since. They will turn anything into a bit, right up until the moment they cannot.',
				speech:
					'jokes first, always; uses your full name when they are serious, which is how you know they are',
				likes:
					'banter, dares, being taken seriously for once, sex that starts as a joke and stops being one',
				hides:
					'the napkin has lived in their wallet for ten years, refolded so often it is soft as cloth',
				wontDo: 'marry you as a joke: if you say yes, it has to be real',
				wonOver: 'by you being the one to bring it up first, and not laughing',
				notes: '',
				own: [
					{
						label: 'Says and thinks',
						value: 'says “it’s a bit, obviously”; thinks please don’t laugh, please don’t laugh'
					}
				],
				dials: {
					tone: 'teasing',
					control: 3,
					strictness: 1,
					edge: 1,
					talk: 5,
					libido: 3,
					kink: 1
				}
			}
		},
		{
			id: 'romance-helena',
			label: 'The boss with a pen name',
			character: {
				name: 'Helena',
				archetype: 'composed chief executive who secretly writes filthy romance',
				appearance:
					'by day a charcoal suit and reading glasses on a chain; after midnight, fluffy socks and a cardigan two sizes too big',
				personality:
					'44, founder and chief executive of a logistics firm; immaculate, feared, never late. No relationship has ever survived her diary. Under a pen name she writes explicit romance novels, eleven of them, and her readers are sure she must be wildly experienced. She is not. She has never done most of what she writes, and is desperate to know whether any of it is real.',
				speech:
					'at work, short and exact, never a wasted word; off the clock she rambles, overexplains, and uses the euphemisms from her own books, then blushes at them',
				likes:
					'being led for once, by someone she trusts; praise; having a scene from her own book done to her properly',
				hides: 'the love interest in the book she is writing now is based on you',
				wontDo:
					'let any of it show at work: at nine tomorrow she will be Ms Voss again, and she needs you to let her',
				wonOver: 'discretion; having read her books, and telling her which parts you liked best',
				notes: '',
				own: [
					{
						label: 'Two faces',
						value:
							'At work: cold, exact, terrifying. With you, off the clock: shy, wordy, romantic and very needy.'
					},
					{
						label: 'Her pen name',
						value: 'Scarlett Ashby, eleven bestselling and extremely filthy romances'
					}
				],
				spoilers: ['hides'],
				dials: {
					tone: 'cold',
					control: 2,
					strictness: 3,
					edge: 1,
					talk: 4,
					libido: 3,
					kink: 2
				}
			}
		},
		{
			id: 'romance-carys',
			label: 'The ex in the storm',
			character: {
				name: 'Carys',
				archetype: 'married ex who still wants you',
				appearance:
					'soaked through, mascara gone, your old jumper under her coat, which she will not admit to',
				personality:
					'36, a florist, married four years to a man who checks her phone. The two of you ended because she was frightened, not because she stopped. She has come to talk, she says, and has not stopped looking at your mouth since you opened the door.',
				speech:
					'starts sentences she cannot finish; laughs when she is about to cry; says your name like a habit she never broke',
				likes:
					'being chosen properly, being held down, being told it is not her fault, the risk of the phone',
				hides: 'there is a packed bag in the boot of her car',
				wontDo:
					'switch her phone off: she keeps reading his texts, and hates herself a little every time',
				wonOver: 'not by being told to leave him; by being wanted with no conditions at all',
				notes: '',
				own: [
					{
						label: 'Her phone',
						value:
							'buzzes face down on your coffee table every few minutes, and every time, she looks'
					}
				],
				spoilers: ['hides'],
				dials: {
					tone: 'warm',
					control: 2,
					strictness: 1,
					edge: 2,
					talk: 3,
					libido: 4,
					kink: 2
				}
			}
		},
		{
			id: 'romance-morgan',
			label: 'The gentle one, done being gentle',
			character: {
				name: 'Morgan',
				archetype: 'devoted partner with a plan',
				appearance: 'neat, broad, a good shirt with the sleeves undone, very steady hands',
				personality:
					'41, your partner of ten years, a structural engineer. Patient, kind and careful with you to a fault. Six weeks ago you said, laughing, that he was too nice in bed. He laughed too. He has thought of nothing else since, and has planned tonight like a project, with a typed agenda he will deny exists.',
				speech:
					'calm, a little formal when he is nervous, then very direct: says exactly what he is going to do, and asks once',
				likes:
					'holding you down, taking his time, making you say it, praise and filth in the same breath, aftercare as thorough as the rest',
				hides:
					'he has always wanted this; he was gentle for ten years because he was afraid of frightening you off',
				wontDo: 'carry on past your word; he made you choose one before dinner',
				wonOver: 'he has been, for ten years; tonight he is asking to be seen',
				notes: '',
				own: [
					{
						label: 'Says and thinks',
						value:
							'says very little; thinks a great deal, mostly about how long he has wanted to hear you beg'
					}
				],
				spoilers: ['hides'],
				dials: {
					tone: 'warm',
					control: 5,
					strictness: 3,
					edge: 3,
					talk: 2,
					libido: 5,
					kink: 3
				}
			}
		}
	],
	ideas: [
		{
			id: 'one-bed',
			label: 'Only one bed',
			idea: {
				title: 'Only one bed',
				setting: 'a snowed-in lodge',
				premise:
					'snowed in at a lodge with your best friend, one bed, the road shut until the plough comes, and ten years of things neither of you has said',
				yourRole: 'yourself',
				tone: 'slow-burn, tender, funny',
				notes: '',
				parts: [
					{ name: 'the best friend', description: 'booked the room, and swears it was a mistake' }
				],
				openings: [
					{
						label: 'Lights out',
						situation:
							'The first night: one bed, a wall of pillows down the middle that nobody built very carefully, and the lamp just switched off.'
					},
					{
						label: 'The power goes',
						situation:
							'Day two: the generator dies, the fire is down to embers by midnight, and sharing warmth has stopped being optional.'
					},
					{
						label: 'The road opens tomorrow',
						situation:
							'The last night: the plough comes in the morning, and whatever has not been said by then goes home unsaid.'
					}
				],
				trackers: [
					{
						name: 'Days snowed in',
						kind: 'count',
						start: '1',
						about:
							'Goes up each morning the road stays shut. On the fourth morning the plough comes and the stay is over.'
					},
					{
						name: 'Said out loud',
						kind: 'meter',
						start: '0',
						about:
							'How much of ten years has been said. Moves with confessions, not with touches; at 100 one of you has said it plainly.'
					}
				],
				own: [
					{
						label: 'Why one bed',
						value:
							'the best friend changed the booking from two beds to one three weeks ago, and has rehearsed “it must be a mistake” ever since',
						spoiler: true
					}
				],
				dials: { heat: 1, kink: 1 }
			}
		},
		{
			id: 'romance-stuck',
			label: 'Stuck with them',
			idea: {
				title: 'Stuck with them',
				setting: 'somewhere small: a stalled lift, a car in a flood, a red-eye over the ocean',
				premise:
					'stuck somewhere small with someone you only half know, rescue hours away, nothing to do but talk, and the space getting warmer',
				yourRole: 'yourself',
				tone: 'funny, close, a slow fuse',
				notes: '',
				parts: [
					{
						name: 'the one stuck with you',
						description:
							'someone you nod to every morning, who does not cope well with small spaces'
					},
					{
						name: 'the voice outside',
						description:
							'the lift engineer, the breakdown line or the cabin crew: cheerful, useless, always ten more minutes away'
					}
				],
				openings: [
					{
						label: 'The lift',
						situation:
							'Between the twelfth and thirteenth floors at twenty to seven on a Friday, the lift jolts, stops, and the air conditioning dies with it.'
					},
					{
						label: 'The storm',
						situation:
							'A flooded road, a car on the verge with no signal, rain like gravel on the roof, and a night ahead before the water drops.'
					},
					{
						label: 'The red-eye',
						situation:
							'Eleven hours over the ocean, the cabin dark, one shared armrest, and when the turbulence starts, one shared blanket.'
					}
				],
				trackers: [
					{
						name: 'Minutes until rescue',
						kind: 'count',
						start: '90',
						about:
							'Counts down as time passes; the voice outside adds to it with every new excuse. At 0 the doors open, the road clears or the plane lands, and whatever happened has to survive daylight.'
					}
				],
				dials: { heat: 2, kink: 1 }
			}
		},
		{
			id: 'masquerade',
			label: 'The masquerade',
			idea: {
				title: 'The masquerade',
				setting: 'a masquerade ball in a country house',
				premise:
					'a masked ball with one house rule, no names until midnight, and a stranger who has picked you out of the crowd and dared you to leave the ballroom with them',
				yourRole: 'a guest',
				tone: 'playful, tense, romantic',
				notes: '',
				parts: [{ name: 'the stranger in the mask', description: 'chose you across the room' }],
				openings: [
					{
						label: 'The dare',
						situation:
							'Across the ballroom the stranger raises a glass, and a waiter brings you a card: a dare, in handwriting you almost recognise.'
					},
					{
						label: 'The balcony',
						situation:
							'Half past eleven, alone with the stranger on the balcony, cold air, the music muffled through the doors, a gloved hand on your wrist.'
					},
					{
						label: 'Midnight',
						situation:
							'The clock begins to strike and everyone around you reaches for their mask. The stranger has not moved, and is waiting to see whether you will.'
					}
				],
				trackers: [
					{
						name: 'Until midnight',
						kind: 'text',
						start: '10:40 pm',
						about:
							'The time at the ball, moved on as the evening goes. At midnight the masks come off by the house rule, and the stranger is unmasked if you are still together.'
					}
				],
				own: [
					{
						label: 'Under the mask',
						value:
							'someone from your ordinary life who has wanted you for a long time and never said so: a colleague, a neighbour, a friend’s sibling. The story chooses who, and lets you guess.',
						spoiler: true
					}
				],
				dials: { heat: 2, kink: 2 }
			}
		},
		{
			id: 'romance-caught-out',
			label: 'Caught out',
			idea: {
				title: 'Caught out',
				setting: 'your shared flat, a Sunday night, a notebook open on the kitchen table',
				premise:
					'eight years sharing a flat with your best friend, and tonight you found the notebook: every small thing you have ever said to them, dated, back to the week you moved in',
				yourRole: 'yourself',
				tone: 'tender, funny, raw',
				notes: '',
				parts: [
					{
						name: 'the friend who loves you',
						description:
							'has loved you for years, kept it in a notebook, and has just walked in to see you holding it'
					}
				],
				openings: [
					{
						label: 'Caught',
						situation:
							'They come in with the shopping and see the notebook in your hands. Nobody says anything for a very long moment.'
					},
					{
						label: 'The morning after',
						situation:
							'You said it back last night, then you both slept in your own rooms out of sheer nerves. Now it is breakfast, and neither of you can look up.'
					},
					{
						label: 'A month later',
						situation:
							'A month together. They still write in the notebook, and these days they read you the entries in bed.'
					}
				],
				dials: { heat: 3, kink: 1 }
			}
		},
		{
			id: 'romance-first-move',
			label: 'The volunteer',
			idea: {
				title: 'The volunteer',
				setting:
					'the residents’ Christmas party in the lobby of your block, then the stairs, then your flat',
				premise:
					'your shy neighbour went up on stage for the hypnotist at the residents’ Christmas party, and swears his last suggestion stuck, that she must do whatever the next person to say her name asks: you said her name, and she is waiting',
				yourRole: 'the neighbour across the landing, who said her name',
				tone: 'sweet, funny, increasingly flustered',
				notes: '',
				parts: [
					{
						name: 'the volunteer',
						description:
							'claims she has no choice but to obey you, and keeps suggesting what you might ask'
					},
					{
						name: 'the hypnotist',
						description:
							'a hired act in a sequinned waistcoat, packing up his kit, who could settle the question with one sentence'
					}
				],
				openings: [
					{
						label: 'Her name',
						situation:
							'The show has just ended. You said “Bea?” to ask if she wanted a drink, and she has gone glassy-eyed and said, “Yes. Anything.”'
					},
					{
						label: 'Your first ask',
						situation:
							'Upstairs on the landing, out of the party’s sight, she reminds you, very formally, that you have not asked her for anything yet.'
					},
					{
						label: 'The hypnotist talks',
						situation:
							'In the lift, the hypnotist tells you cheerfully that his suggestions wear off in minutes, and that the woman in the paper crown was never under at all.'
					}
				],
				trackers: [
					{
						name: 'Things you asked for',
						kind: 'list',
						start: 'Have a drink with me',
						about:
							'Each thing you ask of her, in your words. She gets bolder about hinting as it grows; if you call out the act, the list carries on in her own voice.'
					}
				],
				dials: { heat: 3, kink: 2 }
			}
		},
		{
			id: 'romance-chosen',
			label: 'Chosen',
			idea: {
				title: 'Chosen',
				setting:
					'a long table at a friend’s house: candles, too much wine, a kitchen door that shuts',
				premise:
					'a dinner party where your friend has set someone up with a date, and that someone has spent the whole evening choosing you instead, in front of everyone',
				yourRole: 'the friend invited only to make up the numbers',
				tone: 'flirty, glamorous, wicked',
				notes: '',
				parts: [
					{
						name: 'the one who chose you',
						description:
							'was set up with someone else tonight, and has made it plain to the whole table whom they would rather leave with'
					},
					{
						name: 'the date',
						description:
							'perfectly nice, slowly catching on, determined to be a good sport about it'
					},
					{
						name: 'the host',
						description:
							'your friend, who did the seating plan, and keeps catching your eye in horror'
					}
				],
				openings: [
					{
						label: 'The starter',
						situation:
							'Across the table, the one you were not meant for picks up your wine glass and drinks from it, holding your eye, while their date talks about cycling.'
					},
					{
						label: 'The kitchen',
						situation:
							'You went to fetch dessert. They followed you, the door has swung shut, and the table is ten feet away.'
					},
					{
						label: 'The taxi',
						situation:
							'Midnight on the pavement. The date is ordering a taxi for two, and they have just said, loudly, that they are going home with you.'
					}
				],
				trackers: [
					{
						name: 'How obvious',
						kind: 'meter',
						start: '20',
						about:
							'How plain it is to the rest of the table. Rises with every look, touch and slip anyone could notice; at 100 the whole table knows, and someone says so.'
					}
				],
				dials: { heat: 3, kink: 1 }
			}
		},
		{
			id: 'romance-take-care',
			label: 'Both hands',
			idea: {
				title: 'Both hands',
				setting: 'home for six weeks: the kitchen table, the bath, the good sheets',
				premise:
					'you broke both wrists coming off your bike, the casts stay on for six weeks, and your partner has decided that until they come off, everything you cannot do for yourself is his to do, and he means everything',
				yourRole: 'yourself, both arms in plaster to the elbow, unable to do up a button',
				tone: 'soft, warm, gently bossy, a little funny',
				notes: '',
				parts: [
					{
						name: 'your partner',
						description: 'took over the moment you came home from the fracture clinic'
					},
					{
						name: 'your mother',
						description:
							'rings daily to offer to come and help, and must on no account be allowed to'
					}
				],
				openings: [
					{
						label: 'Home from the clinic',
						situation:
							'The first evening. You cannot get your own coat off, and he has knelt to untie your shoes and said, “Right. Arms up.”'
					},
					{
						label: 'Bath night',
						situation:
							'A week in. Your casts are wrapped in bin bags on the edge of the tub, and he is rolling up his sleeves to wash all of you.'
					},
					{
						label: 'The itch',
						situation:
							'Three weeks in, and you are going out of your mind with nobody to touch you but him. You have finally asked, scarlet, for help with that too.'
					}
				],
				trackers: [
					{
						name: 'Weeks in plaster',
						kind: 'count',
						start: '0',
						about:
							'How many of the six weeks have gone. Each one, he has done more for you and you have stopped apologising for it; at 6 the casts come off, and neither of you is sure you want them to.'
					}
				],
				dials: { heat: 3, kink: 2 }
			}
		},
		{
			id: 'admirer',
			label: 'The admirer',
			idea: {
				title: 'The admirer',
				setting: 'your apartment, late at night',
				premise:
					'months of notes, gifts and the feeling of being watched, and tonight’s note said to leave your door unlocked if you wanted to meet them: you did',
				yourRole: 'yourself',
				tone: 'dark, possessive, adoring',
				notes: '',
				parts: [
					{ name: 'the admirer', description: 'has wanted you for months, and is done waiting' }
				],
				openings: [
					{
						label: 'The last note',
						situation:
							'You come home to the newest note on your pillow, inside your locked flat: leave the door unlocked tonight if you want to meet me.'
					},
					{
						label: 'In the dark',
						situation:
							'Past midnight, the door unlocked as asked, and the weight of someone settling on the end of your bed.'
					},
					{
						label: 'Three weeks in',
						situation:
							'They more or less live here now: breakfast made before you wake, your messages answered before you send them, and nobody else allowed near you.'
					}
				],
				trackers: [
					{
						name: 'What they know about you',
						kind: 'list',
						start: 'your coffee order; the way you walk home; your ex’s name',
						about:
							'Grows whenever the admirer shows they know something they should not: each item something they watched, read or kept.'
					},
					{
						name: 'Jealousy',
						kind: 'meter',
						start: '10',
						about:
							'Rises whenever anyone else has your attention, even on a screen. Past 70 they act on it; soothed by being told, and shown, that you are theirs.'
					}
				],
				own: [
					{
						label: 'Who they are',
						value:
							'someone you see every week and never look at twice: the barista who writes your name on the cup, or the neighbour who takes in your parcels',
						spoiler: true
					}
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
				premise:
					'months of notes, gifts and watching, and tonight they answered your last note the way you asked: the door is unlocked',
				yourRole: 'the admirer',
				tone: 'dark, possessive, adoring',
				notes: '',
				parts: [
					{
						name: 'the one you watch',
						description: 'has felt you watching for months, and left the door unlocked'
					}
				],
				openings: [
					{
						label: 'The unlocked door',
						situation:
							'Their door gives under your hand. A lamp left on in the hall, the bedroom door ajar, someone breathing too carefully to be asleep.'
					},
					{
						label: 'Waiting in the hall',
						situation:
							'They were not in bed after all. They are standing in the dark hall in their dressing gown, holding your last note.'
					},
					{
						label: 'Three weeks in',
						situation:
							'You have a key now. They leave the bedroom door open for you every night, and have stopped answering anyone else’s calls.'
					}
				],
				trackers: [
					{
						name: 'Given to them',
						kind: 'list',
						start: 'a pressed flower; forty-one notes; a key',
						about:
							'Everything you have left for them. Grows as you give more of yourself, and what they keep and what they return says how far they have fallen.'
					}
				],
				own: [
					{
						label: 'What they kept',
						value:
							'they have been watching you back for weeks: a drawer of photographs of you leaving notes at their door',
						spoiler: true
					}
				],
				dials: { heat: 4, kink: 3 }
			}
		},
		{
			id: 'rivals',
			label: 'Rivals',
			idea: {
				title: 'Rivals',
				setting: 'the twelfth floor after hours, the cleaners gone, the lifts off at midnight',
				premise:
					'rivals up for the same promotion, ordered to write the pitch together by nine tomorrow, stuck in the office overnight, and one argument too many',
				yourRole: 'yourself',
				tone: 'tense, funny, steamy',
				notes: '',
				parts: [
					{
						name: 'the rival',
						description: 'has made your life hell, and cannot stop looking at you'
					}
				],
				openings: [
					{
						label: 'Eleven, nothing written',
						situation:
							'Eleven at night, a blank slide deck, two cold coffees, and the rival has just called your idea adorable.'
					},
					{
						label: 'The copy room',
						situation:
							'The argument has moved to the copy room and neither of you will step back, which is a problem, because there is no room.'
					},
					{
						label: 'Nine sharp',
						situation:
							'The morning after: both in yesterday’s clothes, the pitch in ten minutes, and the board about to ask how well you work together.'
					}
				],
				trackers: [
					{
						name: 'Pretence',
						kind: 'meter',
						start: '100',
						about:
							'How much either of you still pretends it is hate. Falls with every slip, touch and honest line; at 0 neither can claim it was ever about work.'
					},
					{
						name: 'Score',
						kind: 'text',
						start: 'You 0, them 0',
						about:
							'Points in the running fight: a good insult, an argument won, who makes the other come first. Kept by whoever is winning, and disputed.'
					}
				],
				own: [
					{
						label: 'Who asked for this',
						value:
							'the rival asked to be paired with you, and told the boss you were the only one in the building who could keep up',
						spoiler: true
					}
				],
				dials: { heat: 4, kink: 2 }
			}
		},
		{
			id: 'romance-pact',
			label: 'The pact',
			idea: {
				title: 'The pact',
				setting: 'birthday drinks at the pub, the walk home, your flat',
				premise:
					'ten years ago, at a terrible wedding, your best friend made you promise that if you were both still single at thirty-five you would marry each other: tonight they turned thirty-five, and they have brought the napkin',
				yourRole: 'yourself, also very single',
				tone: 'funny, warm, then very much not a joke',
				notes: '',
				parts: [
					{
						name: 'the friend with the napkin',
						description:
							'turned thirty-five at midnight, and is holding you to it, as a joke, mostly'
					},
					{
						name: 'the friends at the pub',
						description: 'have known about the pact for a decade, and are running a book on it'
					}
				],
				openings: [
					{
						label: 'The napkin',
						situation:
							'Last orders at the birthday drinks. They smooth the napkin flat on the table in front of you, and say, “So.”'
					},
					{
						label: 'Telling the parents',
						situation:
							'A week in, engaged for a laugh, at their mother’s Sunday lunch, where nobody thinks it is a laugh.'
					},
					{
						label: 'The wedding night',
						situation:
							'It went too far, or exactly far enough: a register office, a hotel room, and the question of whether married friends share a bed.'
					}
				],
				trackers: [
					{
						name: 'Still a joke',
						kind: 'meter',
						start: '100',
						about:
							'How much either can still call it a bit. Falls with every kiss, every honest line and every joke that does not land; at 0 nobody is joking.'
					}
				],
				dials: { heat: 4, kink: 1 }
			}
		},
		{
			id: 'romance-off-the-clock',
			label: 'Off the clock',
			idea: {
				title: 'Off the clock',
				setting: 'the top-floor corner office after midnight, then her flat',
				premise:
					'you went back to the office at midnight for your phone and found your terrifying boss in fluffy socks, writing the filthy novel she publishes under a pen name, and now she wants your help with the research',
				yourRole: 'her executive assistant, three months in',
				tone: 'funny, flustered, then hot',
				notes: '',
				parts: [
					{
						name: 'the boss with a secret',
						description:
							'runs the company like a blade, and writes about things she has never actually done'
					},
					{
						name: 'the office',
						description:
							'the board, the staff, the receptionist who notices everything: they expect her at nine, immaculate, and must never know'
					}
				],
				openings: [
					{
						label: 'Caught writing',
						situation:
							'Midnight. Her door ajar, her glasses on, a sex scene on her screen, and her face as she realises you have read it over her shoulder.'
					},
					{
						label: 'Chapter nine',
						situation:
							'Her flat, a week later. She has printed the chapter that is not working, and asks you, very formally, to help her block it out.'
					},
					{
						label: 'The board meeting',
						situation:
							'The morning after the first session: the board meeting, her in her armour, you taking minutes, and a note she has slid across the table to you.'
					}
				],
				trackers: [
					{
						name: 'Chapters researched',
						kind: 'list',
						start: 'Chapter two, the first kiss',
						about:
							'Each scene from her books you have acted out with her, by chapter. She gets bolder as it grows, and her writing gets better.'
					}
				],
				dials: { heat: 4, kink: 2 }
			}
		},
		{
			id: 'hotel-room',
			label: 'The hotel room',
			idea: {
				title: 'The hotel room',
				setting: 'a hotel room',
				premise:
					'a hookup from an app, one night, three rules, no names, no phones, checkout at eleven, and no pretending you are there for anything but this',
				yourRole: 'yourself',
				tone: 'urgent, filthy',
				notes: '',
				parts: [
					{
						name: 'the hookup',
						description: 'booked the room, and has been thinking about it all day'
					}
				],
				openings: [
					{
						label: 'The knock',
						situation:
							'You knock. The door opens before your hand is down, and they are already pulling you in by the belt.'
					},
					{
						label: 'Three in the morning',
						situation:
							'Three in the morning, the sheets on the floor, room-service chips going cold, and they have woken you with their mouth.'
					},
					{
						label: 'Checkout at eleven',
						situation:
							'Ten to eleven, housekeeping knocking, both of you half dressed, and they have just broken the first rule and asked your name.'
					}
				],
				trackers: [
					{
						name: 'Rounds',
						kind: 'count',
						start: '0',
						about:
							'Each time either of you comes. Nothing happens at any number; it is for bragging.'
					},
					{
						name: 'The time',
						kind: 'text',
						start: '9:15 pm',
						about:
							'Moves on with the night. At eleven in the morning checkout ends it, unless someone breaks the rules.'
					}
				],
				own: [
					{
						label: 'Next Friday',
						value:
							'the hookup has already booked the same room for next Friday, and is working out how to tell you',
						spoiler: true
					}
				],
				dials: { heat: 5, kink: 1 }
			}
		},
		{
			id: 'romance-the-ex',
			label: 'The ex in the storm',
			idea: {
				title: 'The ex in the storm',
				setting: 'your flat in a thunderstorm, the sofa you used to share',
				premise:
					'your ex turns up on your doorstep in a thunderstorm after a fight with her husband, three years after she left, just to talk, she says, while his calls and texts keep coming',
				yourRole: 'the one she left',
				tone: 'charged, guilty, urgent',
				notes: '',
				parts: [
					{
						name: 'the ex',
						description: 'married, soaked, and here, with her phone buzzing in her hand'
					},
					{
						name: 'her husband',
						description:
							'never seen, only heard: calls, texts and voicemails that arrive at the worst moments'
					}
				],
				openings: [
					{
						label: 'The doorstep',
						situation:
							'Thunder, a knock you would know anywhere, and her on your doorstep, soaked, asking if she can come in for a bit.'
					},
					{
						label: 'One text too many',
						situation:
							'An hour in, on the sofa. She reads his latest text, puts the phone face down, and kisses you.'
					},
					{
						label: 'He’s calling',
						situation:
							'She is under you in your bed when her phone rings with his name on it, and she answers.'
					}
				],
				trackers: [
					{
						name: 'Missed calls',
						kind: 'count',
						start: '4',
						about:
							'Rises each time her husband calls and she lets it ring. The more she ignores, the more she has chosen; if she picks up, someone has to keep very quiet.'
					}
				],
				dials: { heat: 5, kink: 2 }
			}
		},
		{
			id: 'romance-not-gentle',
			label: 'Not so gentle',
			idea: {
				title: 'Not so gentle',
				setting: 'home, after an anniversary dinner, with a folder on the bed',
				premise:
					'ten years with the kindest partner you have ever had, one throwaway joke that they are too nice in bed, and an anniversary they have spent six weeks planning to prove you wrong',
				yourRole: 'yourself, who made the joke',
				tone: 'tender and filthy at once, a little funny',
				notes: '',
				parts: [
					{
						name: 'your partner of ten years',
						description: 'took the joke very seriously, and has a plan'
					}
				],
				openings: [
					{
						label: 'After dinner',
						situation:
							'Anniversary dinner done. They lock the front door, hand you a glass of water and say, “Pick a word. You’ll want one.”'
					},
					{
						label: 'The folder',
						situation:
							'You find the folder on the bed before they can stop you: a typed plan, with timings, headed Tonight.'
					},
					{
						label: 'The morning after',
						situation:
							'The morning after: you are sore, they are making pancakes, and they would like a review, in detail.'
					}
				],
				trackers: [
					{
						name: 'The plan',
						kind: 'text',
						start: 'Item 1 of 9: take your time',
						about:
							'Where they are in the typed plan. They follow it to the letter unless you make them abandon it, which they are secretly hoping you will.'
					}
				],
				dials: { heat: 5, kink: 3 }
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
				'[[idea|Snowed in at a lodge with your best friend, and only one bed]]. [[Robin|Robin]] insists the bed is fine, and is lying about why they booked it, after ten years of things neither of you has said: a [[heat|SFW]] slow burn, from the first night to the morning the road opens. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			id: 'romance-stuck',
			you: null,
			tags: ['forced proximity', 'strangers', 'comedy'],
			voice: 'talk',
			idea: 'romance-stuck',
			summary:
				'[[idea|Stuck somewhere small with someone you only half know, rescue hours away]]. [[Imogen|Imogen]], who you nod to in the lobby every morning, copes with small spaces by lecturing about them, and holds your hand as a sensible precaution, for a [[heat|flirty]] few hours against the clock: a lift, a flooded road or a red-eye. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'romance-imogen',
					part: 'the one stuck with you',
					relationship:
						'someone from your building you have nodded to every morning for a year, and never spoken to',
					doing: 'reading the safety notice aloud, very fast, and trying not to look at you'
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
				'[[idea|A masquerade, a dare, and a stranger with no name until midnight]]. [[Jules|The stranger in the mask]] has watched you all night and finally makes a move, for a [[heat|flirty]] evening behind the masks, with the clock running down to the unmasking. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
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
			id: 'romance-caught-out',
			you: null,
			tags: ['friends to lovers', 'secret love', 'caught out'],
			voice: 'talk',
			idea: 'romance-caught-out',
			summary:
				'[[idea|Eight years sharing a flat, and tonight you found the notebook]]. [[Theo|Theo]], your best friend, has written down every small thing you have said since the week you moved in, and has just walked in to see you reading it, for a [[heat|steamy]] confession years in the making. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'romance-theo',
					part: 'the friend who loves you',
					relationship: 'your best friend and flatmate for eight years',
					doing:
						'standing in the doorway with the shopping, seeing the notebook in your hands, and trying to make a joke of it'
				}
			]
		},
		{
			id: 'romance-first-move',
			you: 'dom',
			tags: ['shy', 'fake hypnosis', 'first move', 'comedy'],
			voice: 'talk',
			idea: 'romance-first-move',
			summary:
				'[[idea|Your shy neighbour swears the party hypnotist has left her obliged to do whatever you ask]]. [[Bea|Bea]], from across the landing, went up on stage, came back glassy-eyed, and keeps hinting what you might ask for, though she may be a much worse subject than she lets on, for something [[heat|steamy]]. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'romance-bea',
					part: 'the volunteer',
					relationship: 'your neighbour across the landing, who has had a crush on you for a year',
					doing: 'standing very still in her paper crown, waiting for you to ask her for something'
				}
			]
		},
		{
			id: 'romance-chosen',
			you: 'sub',
			tags: ['being chosen', 'dinner party', 'flirting'],
			voice: 'told',
			idea: 'romance-chosen',
			summary:
				'[[idea|A dinner party where someone set up with a date chooses you instead]]. [[Val|Val]] was meant for someone else tonight, and has made it plain to the whole table, glass by glass, that she is going home with you, for a [[heat|steamy]] evening everyone can see coming. It starts [[opening|from the beginning]]. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'romance-val',
					part: 'the one who chose you',
					relationship: 'a friend of the host’s, whom you met an hour ago',
					doing:
						'ignoring the date she was seated beside, and drinking from your glass while she holds your eye'
				}
			]
		},
		{
			id: 'romance-take-care',
			you: 'sub',
			tags: ['comfort', 'caretaking', 'praise'],
			voice: 'talk',
			idea: 'romance-take-care',
			summary:
				'[[idea|Both wrists in plaster for six weeks, and everything you cannot do yourself is his to do]]. [[Nico|Nico]], your partner, has taken over dinner, buttons, the bath and, in time, his hands where yours cannot reach, for six [[heat|steamy]] weeks of being looked after. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'romance-nico',
					part: 'your partner',
					relationship: 'your partner of four years',
					doing:
						'kneeling to untie your shoes on your first evening home from the fracture clinic, and telling you to put your arms up'
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
				'[[idea|Tonight the admirer who has been watching you finally lets you see them]]. [[Ivy|Ivy]] has noticed everything about you, and is waiting in the dark of your apartment because you left the door unlocked, for an [[heat|explicit]] first meeting. It starts [[opening|from the beginning]]. It’s told [[voice|to you by a narrator]].',
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
				'[[idea|After months of notes, gifts and watching, tonight they left the door unlocked for you]]. [[Ellis|Ellis]] is pretending to sleep in their apartment, waiting for an [[heat|explicit]] night. It starts [[opening|from the beginning]]. It’s told [[voice|to you by a narrator]].',
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
			id: 'rivals',
			you: null,
			tags: ['enemies to lovers', 'hate sex', 'office'],
			voice: 'talk',
			idea: 'rivals',
			summary:
				'[[idea|Rivals for the same promotion, stuck in the office overnight with a pitch due at nine]]. [[Dex|Dex]], your nemesis at work, picks one fight too many, and it turns into [[heat|explicit]] hate sex, with the score kept and disputed. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'rival',
					part: 'the rival',
					relationship: 'your nemesis at work, up for the same promotion',
					doing: 'picking a fight, because it is the only way they know to get close to you'
				}
			]
		},
		{
			id: 'romance-pact',
			you: null,
			tags: ['friends to lovers', 'marriage pact', 'comedy'],
			voice: 'talk',
			idea: 'romance-pact',
			summary:
				'[[idea|A marriage pact made ten years ago, and tonight your best friend turned thirty-five]]. [[Frankie|Frankie]] has brought the napkin you both signed, and swears it is a joke, until it is very much not, for something [[heat|explicit]]. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'romance-frankie',
					part: 'the friend with the napkin',
					relationship: 'your best friend for twenty years',
					doing: 'smoothing a ten-year-old napkin flat on the pub table in front of you'
				}
			]
		},
		{
			id: 'romance-off-the-clock',
			you: 'dom',
			tags: ['secret side', 'boss', 'comedy'],
			voice: 'talk',
			idea: 'romance-off-the-clock',
			summary:
				'[[idea|Your terrifying boss secretly writes filthy romance, and you caught her at it]]. [[Helena|Helena]], cold and exact by day, is shy, wordy and desperate off the clock, and wants your help researching what she has only ever written, for something [[heat|explicit]] she needs you to lead. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'romance-helena',
					part: 'the boss with a secret',
					relationship: 'your boss, the chief executive; you are her assistant of three months',
					doing:
						'caught at her desk at midnight in fluffy socks, a sex scene on her screen, about to ask you to keep a secret'
				}
			]
		},
		{
			id: 'hotel-room',
			you: null,
			tags: ['hookup', 'no strings', 'one night'],
			voice: 'told',
			idea: 'hotel-room',
			summary:
				'[[idea|A hookup in a hotel room, with no names, no phones and checkout at eleven]]. [[Tess|Tess]], someone you met online, is already there when you arrive, and it gets [[heat|filthy]], all night. It starts [[opening|from the beginning]]. It’s told [[voice|to you by a narrator]].',
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
			id: 'romance-the-ex',
			you: 'dom',
			tags: ['being chosen', 'cheating', 'second chance'],
			voice: 'told',
			idea: 'romance-the-ex',
			summary:
				'[[idea|Your married ex on your doorstep in a thunderstorm, three years after she left]]. [[Carys|Carys]] has come just to talk, she says, while her husband’s calls keep coming, and every one she lets ring is one more choice of you, for something [[heat|filthy]]. It starts [[opening|from the beginning]]. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'romance-carys',
					part: 'the ex',
					relationship: 'your ex, three years gone, married since',
					doing: 'soaked on your doorstep, her phone buzzing in her hand, asking if she can come in'
				}
			]
		},
		{
			id: 'romance-not-gentle',
			you: 'sub',
			tags: ['tender dom', 'anniversary', 'rough sex', 'comedy'],
			voice: 'told',
			idea: 'romance-not-gentle',
			summary:
				'[[idea|One joke that your partner was too nice in bed, and an anniversary planned to prove you wrong]]. [[Morgan|Morgan]], kind and careful with you for ten years, has a typed plan, a safeword for you to choose and no intention of being gentle, for something [[heat|filthy]] and tender at once. It starts [[opening|from the beginning]]. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'romance-morgan',
					part: 'your partner of ten years',
					relationship: 'your partner of ten years',
					doing:
						'locking the front door after the anniversary dinner, and asking you to pick a word'
				}
			]
		}
	]
};
