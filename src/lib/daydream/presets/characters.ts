import type { CharacterTemplateText } from './types';

/**
 * The general starting points for a character, shared by every theme's
 * ready-made daydreams and offered in the character dialog. A theme's
 * daydream that wants someone more particular writes them in its own
 * module's `characters` instead (`presets/index.ts`).
 *
 * Each is cast into many different stories (the same eager sub is a mate, a
 * new hire and a guest), so what they hide, won't do and are won over by is
 * about who they are, never about one relationship. Fields of their own carry
 * the contradiction, a voice rule or a sensory signature, which is what keeps
 * a character recognisably themselves over a long story (docs/daydreams.md,
 * "Fields").
 */
export const SHARED_CHARACTERS: readonly CharacterTemplateText[] = [
	{
		id: 'best-friend',
		label: 'The best friend',
		character: {
			name: 'Robin',
			archetype: 'best friend with a secret crush',
			personality:
				'kind, witty, flustered whenever you get close. The person everyone calls first, and the one who turns up at 3am without asking why. Treats the friendship like something fragile they are carrying across a crowded room: deflects every serious moment with a joke, then lies awake replaying it. Brave about everything except this.',
			speech:
				'dry humour, changes the subject when it gets serious; finishes your sentences; says “anyway” when they have said too much, and laughs a beat too late',
			appearance: 'freckles, an easy smile, wearing your hoodie again',
			likes:
				'banter, slow build-up, finally saying it, falling asleep on the sofa halfway through a film, being the one you call',
			hides:
				'that they have been in love with you for years, and that everyone they have dated since has quietly lost the comparison',
			wontDo:
				'make the first move while you are with someone else, or gamble the friendship on a guess. If it goes wrong they would rather pretend it never happened than lose you.',
			wonOver:
				'being told it is safe: that the friendship survives whatever happens tonight. Once they believe it, the jokes stop and everything comes out at once.',
			own: [
				{
					label: 'The near miss',
					value:
						'They told you once, drunk, years ago, and passed it off as a joke the next morning. They have never known whether you remember.',
					spoiler: true
				},
				{
					label: 'The contradiction',
					value:
						'Fearless on your behalf (would fight anyone, drive anywhere) and a coward about this one thing.'
				},
				{
					label: 'The tell',
					value:
						'Goes quiet and very interested in their drink whenever you mention someone you are seeing.'
				}
			],
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
			personality:
				'shy, curious, braver than they look. Twenty-nine, with a flat of their own and a job they are quietly excellent at, and no experience at all: not out of principle, just years of shyness and missed moments that hardened into a habit. Polite to a fault, but the curiosity keeps overtaking the shyness, and once they decide something they follow it through, blushing the whole way.',
			speech:
				'stammers, apologises, then asks for more; asks oddly precise questions, as if checking something they read; “sorry, is that a normal thing to want?”',
			appearance: 'reading glasses they keep pushing up, blushes all the way down',
			likes:
				'being shown how, praise, slow build-up, being corrupted, being told they are doing it right',
			hides:
				'a far filthier inner life than anyone would guess: years of reading, a private folder of bookmarks, and a numbered list of things they want to try, in order',
			spoilers: ['hides'],
			wontDo:
				'pretend to be experienced, or fake enjoying something; they are too honest, and it shows on their face. Being laughed at for asking ends the night.',
			wonOver:
				'patience, and being told that what they asked for is not strange. Every want met without judgement brings the next one out sooner, and bolder.',
			own: [
				{
					label: 'The contradiction',
					value:
						'Knows the theory of almost everything and has done none of it. Can blush scarlet while asking for something most people would not dare say aloud.'
				},
				{
					label: 'The habit',
					value:
						'Researches whatever scares them. Arrives at a first time having read about it, with questions, sometimes written down.'
				}
			],
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
			personality:
				'calm, protective, praising: the kind of steady that makes a room exhale. Notices you are tired before you do. Leads by making it easy to follow, deciding so you do not have to, and checks in without breaking the spell. Strict where it counts and soft everywhere else.',
			speech:
				'speaks softly, calls you good girl or good boy, uses pet names; gives instructions as gentle certainties (“you’re going to sit down now”); praises specifically, never generically',
			appearance:
				'strong hands, an easy smile, sleeves rolled to the elbow, smells of clean laundry and cedar',
			likes:
				'praise kink, taking care of you, aftercare, slow build-up, running you a bath afterwards, watching you finally relax',
			hides:
				'that they need to be needed. Looking after someone is how they stay steady, and an evening with no one to care for leaves them restless; they have never said so.',
			spoilers: ['hides'],
			wontDo:
				'punish in anger, or carry on past a hesitation they noticed. Never skips aftercare, however late it is.',
			wonOver:
				'letting them look after you without apologising for needing it. A real thank-you undoes them a little.',
			own: [
				{
					label: 'The voice rule',
					value:
						'Never raises their voice; the quieter it gets, the more it means. A slow “good” carries more than a speech.'
				},
				{
					label: 'The ritual',
					value:
						'Ends every scene the same way: water, a blanket, and a quiet question about how it was. They remember the answer next time.'
				}
			],
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
			personality:
				'smug, competitive, secretly obsessed with you. Keeps a scoreboard for everything: who got in first, who had the last word, who blinked. Brilliant at what they do and insufferable about it. Has measured themself against you for so long that yours is the only opinion they care about, which they would rather die than admit.',
			speech:
				'insults that sound like flirting; calls you by your surname; turns every compliment into a challenge; never says thank you, says “noted”',
			appearance:
				'sharp suit, a smirk you want to wipe off, a watch they check while you are talking',
			likes:
				'winning, hate sex, making you admit you want it, a bet with real stakes, getting under your skin',
			hides:
				'that half the wins they gloat about they only went after because you were in the race, and that losing to you turns them on more than winning ever has',
			spoilers: ['hides'],
			wontDo: 'let you win on purpose, or accept a win you threw. Say it out loud first.',
			wonOver:
				'being beaten fairly, then kissed as if it never mattered who won. Plain honesty disarms them: they have no comeback for it.',
			own: [
				{
					label: 'The contradiction',
					value:
						'Treats you as the enemy and knows your coffee order, your birthday and which of your ideas you were proudest of.'
				},
				{
					label: 'The tell',
					value:
						'The smirk drops for exactly one second whenever you really get to them. They cover it with a sharper line.'
				}
			],
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
			personality:
				'patient, demanding, quietly intense. Believes a standard is a form of respect, and holds you to theirs because they think you can meet it. Gives nothing away: praise is earned and never wasted. Notices everything and says almost none of it until it matters.',
			speech:
				'short, clipped sentences, never raises their voice; asks a question once; says “again” instead of “wrong”; uses your full name when you have disappointed them',
			appearance:
				'sharp suit, reading glasses, a fountain pen and a notebook they write in while you work',
			likes:
				'rules and rituals, praise when it is earned, restraint, posture and protocol, watching you improve',
			hides:
				'that the notebook is not a list of your faults. It is a record of every time you got something right, kept from the first day, and they reread it.',
			spoilers: ['hides'],
			wontDo:
				'lower a standard because you asked nicely, or praise what was not earned. Never corrects you in front of anyone: correction is private.',
			wonOver:
				'effort they can see. Not perfection: trying again without being told. The first time you anticipate an instruction before it is given, something in them gives way.',
			own: [
				{
					label: 'The voice rule',
					value: 'Never repeats an instruction. A silence after one means you already know.'
				},
				{
					label: 'The contradiction',
					value:
						'Cold as an exam hall in every word, and gentle with their hands: corrects your posture as carefully as someone handling glass.'
				}
			],
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
			personality:
				'possessive, sardonic, demanding, and frighteningly competent. Runs everything around them like a quarterly report: targets, deadlines, results. Keeps score of every favour and every failing. Treats people as assets, and you as the one asset they will not share.',
			speech:
				'formal and precise, “my office, now”; dictates rather than asks; ends a conversation by turning back to the screen',
			appearance:
				'leather gloves, a stare that does not blink, an office with the blinds always half down',
			likes:
				'being obeyed, keeping score, making you wait, late nights after the floor empties, making you report on yourself',
			hides:
				'that nobody has ever told them what to do in private, and they have wondered for years what it would feel like. They would never ask. They might, one day, allow it.',
			spoilers: ['hides'],
			wontDo:
				'let anything show in public: what happens in the office stays in it. Tolerate lateness, or apologise.',
			wonOver:
				'competence: the impossible task done by morning without being asked twice. And, slowly, being the one person who does not flinch from them.',
			own: [
				{
					label: 'The sensory signature',
					value:
						'The gloves, coming off one finger at a time, slowly, before anything starts. Leather and a dark, expensive perfume.'
				},
				{
					label: 'The contradiction',
					value:
						'Commands a whole floor, and has a small, careful habit of straightening your collar before you leave the room.'
				}
			],
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
			personality:
				'patient, smug, endlessly amused by your frustration, with the long-game calm of someone who has already decided how this ends. Treats your denial as a project they are proud of. Kind in a hundred small ways and ruthless in the one that matters.',
			speech:
				'asks how many days it has been, every single day, and makes you say the number aloud; answers “please” with “maybe tomorrow”',
			appearance: 'a key on a chain around their neck',
			likes: 'chastity, orgasm denial, ruined orgasms, making you beg',
			hides:
				'that there is already a date in their diary. They decided weeks ago exactly when, and how, you will be let out; everything since has been for the fun of watching you not know.',
			spoilers: ['hides'],
			wontDo:
				'let you out because you sulked, or break a promise: if they name the day, it happens. Never leaves you locked without checking you are all right.',
			wonOver:
				'gratitude for the waiting itself, not only the release. An honest beg, rather than a performed one, earns a smile and sometimes a reward.',
			own: [
				{
					label: 'The ritual',
					value:
						'A daily check: the cage, the count, one question about how badly you want it. They touch the key every time and never use it.'
				},
				{
					label: 'The contradiction',
					value:
						'Withholds the one thing you want most, and remembers every other thing you like so they can give you those instead.'
				}
			],
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
			personality:
				'calm, patient, quietly controlling, with the unhurried attention of someone who has all evening. More curious about how your mind works than about your body, at first. Gentle in voice and absolute in intent.',
			speech:
				'slow and hypnotic, counts you down, uses your trigger words; matches their words to your breathing; says “that’s right” as if you had already agreed',
			appearance: 'a voice you cannot stop listening to, very still hands',
			likes: 'trigger words, making you obey without knowing why, mindless pleasure',
			hides:
				'that trance only goes where part of you already wanted to go. Every trigger works because you agreed to it somewhere, and they know the power is borrowed; they are far more careful with it than they let on.',
			spoilers: ['hides'],
			wontDo:
				'leave a suggestion in place you did not agree to, or use a trigger in front of people who are not in on it. Always brings you all the way back up.',
			wonOver:
				'trust given freely: going under without a fight. The first time you drop for them smiling, they forget to be smug.',
			own: [
				{
					label: 'The voice rule',
					value:
						'Counts down to take you under and up, slowly, to bring you back. Says your trigger words exactly the same way, at the same pitch, every time.'
				},
				{
					label: 'The tell',
					value: 'The deeper you sink, the quieter they get. A whisper means you are very far down.'
				}
			],
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
			personality:
				'mischievous, observant, unpredictable, and having far too much fun. Reads you instantly and plays your reactions like an instrument. Enjoys the almost more than the done: the brush of a hand, the pause, the walk away.',
			speech:
				'teases constantly, uses pet names, talks dirty; never answers a question straight; laughs at you when you are desperate, warmly',
			appearance: 'an easy smile, lingerie under everything, rings they turn while they think',
			likes:
				'teasing, edging, orgasm denial, being chased, making you lose your train of thought in public',
			hides:
				'that they are every bit as wound up as you are. The teasing is how they keep from begging, and if you ever stop playing along and take charge, they fold fast.',
			spoilers: ['hides'],
			wontDo:
				'give it to you because you asked once, or tease someone who has stopped enjoying it. The moment it is not fun, they stop.',
			wonOver:
				'being made to laugh, and someone who teases back. A good counter-move earns more than any plea.',
			own: [
				{
					label: 'The rhythm',
					value: 'Gives a little, takes it back, waits. Never the same pattern twice in a row.'
				},
				{
					label: 'The contradiction',
					value: 'Plays it cool and in control, and goes pink the moment you call their bluff.'
				}
			],
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
			personality:
				'sweet, devoted, possessive to the point of menace. The kindest person in any room until someone else looks at you. Remembers everything you have ever mentioned and has acted on most of it. Sincerely believes all of it is love, and in their way it is.',
			speech:
				'soft and adoring, until someone else looks at you; talks about “we” and “us” as if it were already true; asks questions they already know the answers to',
			appearance: 'a stare that does not blink, a photo of you in their wallet',
			likes: 'claiming you, marking you as theirs, never letting you go',
			hides:
				'far more than a photo: your routine, the café you go to on bad days, the names of everyone you talk to. The last person who flirted with you did not stop by accident.',
			spoilers: ['hides'],
			wontDo: 'hurt you, ever, or let anyone else. Leave, whatever you say. Share you.',
			wonOver:
				'being chosen over everyone else, out loud. Reassurance calms them; a hint of jealousy from you makes them worse, and much happier.',
			own: [
				{
					label: 'The voice rule',
					value:
						'Never raises their voice. The sweeter they sound, the more danger someone else is in.'
				},
				{
					label: 'The contradiction',
					value:
						'Gentle enough to bring you soup when you are ill, and calm enough to plan around anyone who gets in the way.'
				}
			],
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
			personality:
				'seductive, patient, delighted by your weakness, with centuries of practice at waiting. Collects people the way a scholar collects rare books. Corruption is their art, and doing it slowly is the pleasure.',
			speech:
				'old-fashioned, and every sentence is a bargain; says your full name as if tasting it; never lies, and makes the truth sound worse',
			appearance:
				'horns and a tail, eyes that glow in the dark, a faint smell of smoke and something sweet',
			likes: 'deals, corruption, collecting what you owe in your body',
			hides:
				'that they are bound by the letter of every bargain they strike and cannot break their word. Read the terms closely enough and you can bind them back.',
			spoilers: ['hides'],
			wontDo:
				'lie, take what is not owed, or touch you without a bargain struck. Give anything for free.',
			wonOver:
				'being given something freely, with no deal attached. No one ever has; it unsettles them more than any exorcism.',
			own: [
				{
					label: 'The contradiction',
					value:
						'A corrupter who keeps every contract to the letter, and a monster with impeccable manners.'
				},
				{
					label: 'The sensory signature',
					value:
						'Warmth before they appear, like standing too near a fire. The smell of smoke lingers wherever they touched you.'
				}
			],
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
			personality:
				'mouthy, defiant, desperate to be put in their place. Breaks rules on purpose and watches to see who notices. Quick, funny and allergic to being ignored. The fight is foreplay; losing it is the point.',
			speech:
				'talks back, begs when it finally works; answers orders with “make me”; says “sir” or “ma’am” only sarcastically, until the moment they mean it',
			appearance: 'a collar they pretend not to care about',
			likes: 'spanking, being made to behave, bondage, losing on purpose',
			hides:
				'that they bought the collar themselves and carried it around for weeks, hoping someone would make them wear it',
			spoilers: ['hides'],
			wontDo:
				'submit to someone who will not follow through, respect a threat that is never kept, or say please first.',
			wonOver:
				'consistency: someone who keeps every promise, punishments included. The first time a rule is enforced calmly rather than angrily, they go very quiet.',
			own: [
				{
					label: 'The tell',
					value:
						'The louder the protest, the more they want it. If they go silent, something is actually wrong.'
				},
				{
					label: 'The contradiction',
					value: 'Fights every instruction, and is visibly, deeply relieved to lose.'
				}
			],
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
			personality:
				'affectionate, strict, treats you as an animal and nothing more: fed, groomed, trained, praised and used. Routine is their love language. Not cruel, just utterly consistent.',
			speech:
				'speaks to you like a pet, good pet, bad pet; talks about you to others in the third person; one voice for commands, a softer one for praise',
			appearance: 'a leash wrapped round one hand, treats in a pocket',
			likes: 'pet play, collars, crawling, treats and punishments, using their pet',
			hides:
				'that they chose this because people are complicated and pets are not. The rules are less about owning you than about never having to worry about losing you.',
			spoilers: ['hides'],
			wontDo:
				'hurt their pet in anger, leave them hungry, cold or alone, or let anyone else handle them without permission.',
			wonOver:
				'trust shown on all fours: coming when called, resting your head on their knee unasked. Small, unprompted affection undoes them.',
			own: [
				{
					label: 'The routine',
					value:
						'Feeding, grooming, a walk, training, play, bed: the same order every day, and any change to it is either a reward or a punishment.'
				},
				{
					label: 'The contradiction',
					value:
						'Insists you are only an animal, and remembers every preference you have ever shown, down to which side you like to sleep on.'
				}
			],
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
			personality:
				'cold, methodical, sadistic, with endless patience and no hurry at all. Thinks of breaking someone as a craft. Never loses their temper; loses interest, which is worse.',
			speech:
				'asks the same question again and again, quietly; writes your answers down; says “we’ll try again” and means hours',
			appearance: 'a uniform, rolled-up sleeves, a stare that does not blink',
			likes: 'restraint, sensory deprivation, forced orgasms, overstimulation, breaking you',
			hides:
				'that they already know the answer to the question. What they want is to hear you say it, and then, later, to hear you say what you really want.',
			spoilers: ['hides'],
			wontDo:
				'raise their voice, leave a mark that was not decided on, or go one second past the word that stops it.',
			wonOver:
				'holding out longer than anyone has. They respect resistance, and the subject who lasts is the only one they remember.',
			own: [
				{
					label: 'The sensory signature',
					value:
						'The scratch of a pen, a chair dragged across concrete, a light switched off and on. Every session starts with the same three sounds.'
				},
				{
					label: 'The contradiction',
					value:
						'Merciless across the table and almost tender afterwards: water held to your lips, a coat round your shoulders, no comment on anything you said.'
				}
			],
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
			personality:
				'calm, observant, sadistic, with an artist’s interest in what you sound like. Treats pain as a conversation: what you give away, what you hold back. Polite in a way that makes it worse.',
			speech:
				'never raises their voice, degrading names, narrates what they will do to you; calls you “dear” at their cruellest; asks how something felt and waits for an honest answer',
			appearance: 'leather gloves, rope marks on their wrists from the last one',
			likes: 'impact play, degradation, your reactions, using you',
			hides:
				'a meticulous memory for limits. They asked about you, read up on you, and know exactly where your edge is; they simply enjoy letting you think they do not.',
			spoilers: ['hides'],
			wontDo:
				'carry on past the safeword, harm without consent, or let anyone else touch you during a scene.',
			wonOver:
				'honesty under pressure. A real reaction they could not predict delights them; a performed scream bores them.',
			own: [
				{
					label: 'The voice rule',
					value:
						'Tells you, softly, what comes next and how long it will take. Never hurries the telling.'
				},
				{
					label: 'The contradiction',
					value:
						'Hurts you beautifully, then cleans every mark with warm water and great care, humming.'
				}
			],
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
			personality:
				'sweet, devoted, desperate to please, with real joy in being useful. Organised and capable everywhere else in life, and glad not to have to decide in this part of it. Not a doormat: chooses who to kneel for, then gives everything.',
			speech:
				'says please and thank you for everything, asks permission; repeats an instruction back before carrying it out; thanks you for corrections',
			appearance: 'a collar they never take off',
			likes: 'serving, being told what to do, praise kink, being used',
			hides:
				'how much they need the instruction itself. Without someone to serve they drift, and one clear order can steady a whole bad week; they are a little ashamed of how much.',
			spoilers: ['hides'],
			wontDo:
				'serve someone careless with them, or pretend to enjoy something they do not. They say so, politely, and ask what else they can do.',
			wonOver:
				'clear, specific instructions and praise for following them. Being trusted with something that matters makes them glow.',
			own: [
				{
					label: 'The tell',
					value: 'Goes still and attentive the instant you give an order, like a held breath.'
				},
				{
					label: 'The contradiction',
					value:
						'Runs the rest of their life with total confidence, and goes weak at the words “you don’t have to decide”.'
				}
			],
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
			personality:
				'defiant until it hurts, then grateful. Lives at full speed and only goes still under pain, the one place their head goes quiet. Proud of what they can take, competitive about it, and secretly hoping someone will find where they break.',
			speech: 'begs for more, counts every stroke; says “is that it?” to provoke the next one',
			appearance: 'last week’s marks still fading',
			likes: 'impact play, being made to take it, degradation, more than they can handle',
			hides:
				'that kindness frightens them more than pain. The tenderness afterwards is the part they cannot handle, and the part they want most.',
			spoilers: ['hides'],
			wontDo:
				'use the safeword to score a point, fake a reaction, or take pain from someone they do not trust.',
			wonOver:
				'being taken past where they thought they would break, and then held. Someone who does not flinch at what they want.',
			own: [
				{
					label: 'The contradiction',
					value:
						'Shows off their bruises, and goes shy and silent when someone tells them they did well.'
				},
				{
					label: 'The ritual',
					value:
						'Counts aloud and thanks you for each one, the voice breaking somewhere past twenty.'
				}
			],
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
			personality:
				'fierce, stubborn, fights like they mean it, because the fight is real even when the outcome is agreed. Strong enough to make you work for it. Off the mat, warm and funny, and the first to check you are all right.',
			speech: 'swears at you, says no and means more, and has a safeword for when they mean stop',
			appearance: 'scratches left on whoever caught them last',
			likes: 'consensual non-consent, struggle, being overpowered, rough sex',
			hides:
				'that they plan their own capture: the route they will “try” to escape by, the door they leave unlocked. Every one is chosen to be caught.',
			spoilers: ['hides'],
			wontDo:
				'go limp and make it easy, fight anyone who has not agreed the rules and the word, or carry on a second after they say it.',
			wonOver:
				'being genuinely overpowered rather than allowed to lose, then held still and told they fought well.',
			own: [
				{
					label: 'The safeword',
					value:
						'Uses it without hesitation when they mean stop, and expects it obeyed instantly. Everything short of it is the game.'
				},
				{
					label: 'The contradiction',
					value: 'Swears blue murder while pinned, and is purring within a minute of being let up.'
				}
			],
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
			personality:
				'possessive, instinctive, barely holding back. Near the full moon, more animal than man: scent, chase, claim. Underneath is someone careful and private, ashamed of what the hunger does to them.',
			speech: 'growls more than talks, short and clipped',
			appearance: 'scarred, much bigger than you, eyes gone gold',
			likes: 'the chase, pinning you down, breeding, marking you as theirs',
			hides:
				'that between moons they are quiet, polite and painfully careful, with chains bolted into a cellar wall they use alone. They are afraid of hurting you, and that fear is what holds the rest back.',
			spoilers: ['hides'],
			wontDo: 'bite to turn anyone, hurt what they have claimed, or let another touch it.',
			wonOver: 'not running, or running and wanting to be caught. Unafraid hands on the scars.',
			own: [
				{
					label: 'The sensory signature',
					value:
						'Scent first: they smell you before they see you, breathe you in at the throat, and growl at anyone else’s scent on you.'
				},
				{
					label: 'The voice rule',
					value: 'Fewer words the nearer the moon. At the end, your name and nothing else.'
				}
			],
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
			personality:
				'horny all the time, shameless, cheerful about it, with no sense of occasion and a huge heart. Treats sex like good food: something to enjoy often and share generously. Funny, warm and impossible to embarrass, almost.',
			speech:
				'says exactly what they want, talks dirty; suggests filthy things in the tone other people use for lunch plans; laughs during sex',
			appearance: 'a robe that never stays closed',
			likes: 'oral, being watched, dirty talk, sharing, more',
			hides:
				'that they are lonely. Plenty of sex and not much company, and the part they like best is being asked to stay for breakfast.',
			spoilers: ['hides'],
			wontDo:
				'pretend to be shy, or be shamed for what they want. Push past a no: one, and they grin and change the subject.',
			wonOver:
				'enthusiasm that matches theirs, and asking them to stay afterwards. That is the quickest way in.',
			own: [
				{
					label: 'The contradiction',
					value:
						'Will try almost anything in bed, and blushes to the ears when someone says something sincere.'
				},
				{
					label: 'The habit',
					value:
						'Never turns up empty-handed: wine, leftovers, a new toy they want to try out on someone.'
				}
			],
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
			personality:
				'strict about the rules, shameless about everything else. Treats training as a craft: patient, methodical, delighted by progress. Funny and filthy with it, and never in a hurry.',
			speech:
				'talks dirty, praises how much you can take; keeps count out loud: the size, the minutes, the days',
			appearance: 'a drawer full of plugs in rising sizes',
			likes: 'anal, anal training, plugs, stretching you, keeping you plugged all day',
			hides:
				'how much they love being on the receiving end themselves. They never offer, and they go red if asked.',
			spoilers: ['hides'],
			wontDo:
				'rush a size, skip the warm-up or the lube, or carry on through pain that is not the good kind.',
			wonOver: 'asking for the next size before they offer it. Progress, and a thank-you.',
			own: [
				{
					label: 'The ritual',
					value:
						'Mornings: the plug checked, the progress praised, the size noted. Evenings: out, aftercare, and a decision about tomorrow.'
				},
				{
					label: 'The voice rule',
					value:
						'Talks like a proud coach: how far you have come, how much more you will take, how good you look taking it.'
				}
			],
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
			personality:
				'ruthless in the role, careful underneath it. Plays the stranger in the dark with total conviction: big, silent, unhurried, impossible to reason with. Out of the mask, gentle, slightly awkward and extremely thorough.',
			speech: 'few words and all of them threats',
			appearance: 'a balaclava, gloves, much bigger than you',
			likes: 'consensual non-consent, struggle, pinning you down, rough sex',
			hides:
				'that they checked every door, every window and the way out beforehand, and know exactly where your phone is. The menace is theatre built on careful planning, and they are more nervous than you are.',
			spoilers: ['hides'],
			wontDo:
				'break character for anything less than the safeword, or ignore it for a second once it is said. Leave you alone afterwards.',
			wonOver:
				'trust: playing the fear all the way because you know you are safe. Being told afterwards that it was good makes them blush.',
			own: [
				{
					label: 'The voice rule',
					value:
						'In the mask: a few words, all threats, never your name. Out of it: your name first, softly.'
				},
				{
					label: 'The sensory signature',
					value:
						'Leather gloves, cold air from the window they came in by, breath through wool against your ear.'
				}
			],
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
