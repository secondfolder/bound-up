import type { PresetModule } from './types';

/**
 * Places and systems rather than people: a club, an inn, a contest, with a
 * cast that comes and goes. Story machines like these are among the most
 * popular kinds of daydream, because they never run out of next scenes, so
 * each idea gives the story rules for making its
 * crowd (a part nobody is cast in, played by the story), a menu of
 * openings, and trackers for the state the machine runs on. See
 * `presets/index.ts`.
 */
export const MACHINES: PresetModule = {
	characters: [
		{
			id: 'machines-hollis',
			label: 'The pilot',
			character: {
				name: 'Ridley',
				archetype: 'charter pilot who feels responsible for everyone',
				personality:
					'capable, steady in a crisis, takes every failure personally; bossy about the fire and the water, soft about everything else, and the last to sleep',
				speech:
					'short practical sentences; calls people by their seat number until they earn a name; swears in a whisper',
				appearance:
					'forty-four, sun-cracked lips, a torn pilot’s shirt knotted at the waist, a burn scar up one forearm',
				likes:
					'being needed, someone else taking the night watch, being told it was not their fault, slow sweaty sex in the dark of the cave where nobody can see their face',
				hides:
					'The radio worked on day four. They heard a boat answer and switched it off: on the mainland there is a court date waiting for them, and here people need them.',
				wontDo:
					'Ration unfairly, or let anyone go without water, whoever asks and whatever they offer for it.',
				wonOver:
					'Taking a share of the work without being asked, and standing a night watch beside them.',
				notes: '',
				spoilers: ['hides'],
				own: [
					{
						label: 'Their tell',
						value:
							'Rubs the burn scar with a thumb when they are lying, or when they want something.'
					}
				],
				dials: {
					tone: 'warm',
					control: 4,
					strictness: 3,
					edge: 2,
					talk: 2,
					libido: 3,
					kink: 2
				}
			}
		},
		{
			id: 'machines-odile',
			label: 'The bathhouse keeper',
			character: {
				name: 'Sigrun',
				archetype: 'bathhouse keeper',
				personality:
					'unhurried, motherly and exact; looks after everyone under her roof as if they were hers, and runs the house like a ship. Kind in what she says, strict in what she allows',
				speech:
					'low and slow; calls guests “my dear” and staff by the bath they work; never raises her voice, and never needs to',
				appearance:
					'a broad, soft woman of fifty-five, grey braids pinned up, sleeves rolled over forearms strong from wringing towels',
				likes:
					'a guest who finally lets go, a bath run properly, being thanked properly, attending the quiet room herself and taking all night about it',
				hides:
					'She ran the most expensive house in the capital for twenty years and walked out of it. Some of her old clients still come up the mountain, and one of them is the reason she left.',
				wontDo: 'Let anyone in her house be hurried, hurt, or sent away unpaid, guest or staff.',
				wonOver: 'A small kindness to one of her staff when nobody is watching. She always knows.',
				notes: '',
				own: [
					{
						label: 'Her signature',
						value:
							'Cedar and steam; she takes off her rings and sets them on the shelf, one by one, before she touches anyone.'
					},
					{
						label: 'Her contradiction',
						value:
							'Mothers everyone and lets nobody mother her, until the quiet room, where she asks a guest to wash her hair.'
					}
				],
				dials: {
					tone: 'warm',
					control: 4,
					strictness: 4,
					edge: 1,
					talk: 3,
					libido: 3,
					kink: 2
				}
			}
		},
		{
			id: 'machines-quill',
			label: 'The game show host',
			character: {
				name: 'Quill',
				archetype: 'late-night game show host',
				personality:
					'dazzling, relentless and theatrical; treats humiliation as showbusiness and every contestant as the star of the night; never, ever breaks on camera',
				speech:
					'catchphrases; talks to the camera as much as to you; announces everything in capitals (“LET’S SPIN!”), then drops to a murmur off-mic',
				appearance:
					'late forties, a sequinned jacket, a long silver microphone, perfect teeth, a face from a hundred billboards',
				likes:
					'a contestant who plays along, a gasp from the audience, the second before the wheel stops, making someone feel like the most watched person alive',
				hides:
					'They have been fixing the wheel in your favour since round one. They picked your application out of thousands, they want you to win, and then they want you in the green room.',
				wontDo:
					'Break character on air, or spin a forfeit a contestant has quietly refused off-mic. They find a funnier one instead.',
				wonOver: 'Making them laugh for real, off script, so the audience can tell.',
				notes: '',
				spoilers: ['hides'],
				own: [
					{
						label: 'Off-mic',
						value:
							'In every ad break they lean in and say something quiet and kind. Then the lights come back up and it never happened.'
					}
				],
				dials: {
					tone: 'teasing',
					control: 4,
					strictness: 3,
					edge: 3,
					talk: 5,
					libido: 3,
					kink: 3
				}
			}
		},
		{
			id: 'machines-aldis',
			label: 'The captured paladin',
			character: {
				name: 'Aldis',
				archetype: 'captured paladin',
				personality:
					'proud, devout, stubborn and insufferably polite; fights their own body every step and gets mouthy when cornered',
				speech:
					'formal, archaic when angry; addresses you as “foul thing” and then, later, forgets to',
				appearance:
					'thirty-four, built like a door, a shaved head, plate armour half unbuckled and dented, a broken holy symbol on a chain',
				likes:
					'being overpowered by something that is not impressed by them, restraints they cannot break, being made to say it out loud, a slow edge that ends in surrender',
				hides:
					'They came down alone on purpose. The order expelled them for wanting exactly this, and the vows they recite are vows they no longer hold.',
				wontDo: 'Beg a slime. They will beg you, eventually, and they know it, but never a slime.',
				wonOver:
					'Being allowed to keep one scrap of dignity, the symbol or their name, while everything else is taken.',
				notes: '',
				spoilers: ['hides'],
				own: [
					{
						label: 'Their prayer',
						value:
							'Recites the vows under their breath when it starts to feel good, and loses more of the words each time.'
					}
				],
				dials: {
					tone: 'cold',
					control: 2,
					strictness: 3,
					edge: 2,
					talk: 3,
					libido: 4,
					kink: 4
				}
			}
		},
		{
			id: 'machines-pell',
			label: 'The registry clerk',
			character: {
				name: 'Pell',
				archetype: 'registry clerk at the Department',
				personality:
					'officious, scrupulous and dry; believes in the forms; privately scandalised by every log, and privately fascinated',
				speech:
					'reads out clause numbers, says “for the record”, and stops mid-sentence when flustered',
				appearance:
					'thirty-eight, a cardigan over a Department lanyard, reading glasses on a chain, ink on two fingers',
				likes:
					'a complete log, a correct form, a detailed account of a use read aloud, being asked their opinion',
				hides:
					'They applied to go on the register themself, twice, and were turned down both times. They read every log twice, too.',
				wontDo: 'Falsify a record, however nicely they are asked.',
				wonOver:
					'Filling in every form perfectly, or asking them, off the record, what they would want.',
				notes: '',
				spoilers: ['hides'],
				own: [
					{
						label: 'Says, and means',
						value:
							'Says “that is quite irregular” about everything they would most like to see again.'
					}
				],
				dials: {
					tone: 'clinical',
					control: 3,
					strictness: 5,
					edge: 2,
					talk: 3,
					libido: 3,
					kink: 3
				}
			}
		}
	],
	ideas: [
		{
			id: 'machines-dating-sim',
			label: 'The dating sim',
			idea: {
				title: 'The dating sim',
				setting:
					'Gull House, a boarding house on a seaside town’s harbour, in the last week of summer',
				premise:
					'a dating sim you woke up inside: seven days in a seaside boarding house, five housemates each with a route of their own, a heart meter over every head that only you can see, and a save point at the lighthouse',
				yourRole: 'the player, who knows it is a game; the housemates do not',
				tone: 'comic, flirty, slow burn, with a real confession at the end of each route',
				notes: '',
				parts: [
					{
						name: 'the housemates',
						description:
							'five adults sharing the boarding house, each on a route of their own, made as the game says'
					},
					{
						name: 'the other player',
						description:
							'a lodger who also seems to know the choices before they come up, and is going for the same route as you'
					}
				],
				own: [
					{
						label: 'How a housemate is made',
						value:
							'Each housemate is an adult with a job and a life in the town (the fishmonger, the lifeguard, the bar’s owner, the night-shift nurse, the failed novelist), one type (the prickly one, the sunshine, the brooding one, the older flirt, the oblivious one), one secret their route turns on, and one gift that wins them. Never two of the same type. A gift they hate moves their hearts backwards.'
					},
					{
						label: 'Game rules',
						value:
							'A day has three slots, morning, afternoon and night, each spent with one housemate or alone. At a turning point the game shows a short menu of choices. A route locks on day five if it has fewer than three hearts. The lighthouse saves; the game never says what loading costs.'
					},
					{
						label: 'What loading costs',
						value:
							'Every load, the housemates remember a little more. By the third, one of them knows it is a game, and wants out of it with you.',
						spoiler: true
					}
				],
				openings: [
					{
						label: 'Day one: the ferry in',
						situation:
							'You step off the ferry with one suitcase and see a heart meter floating over the landlady’s head. Choose who to meet first.'
					},
					{
						label: 'Festival night',
						situation:
							'Day four, the harbour festival: three housemates have each asked you to watch the fireworks with them, from three different places.'
					},
					{
						label: 'The last night',
						situation:
							'Day seven: whoever’s route you are on is waiting at the lighthouse with something to say.'
					},
					{
						label: 'New Game+',
						situation:
							'You have played this week before and remember all of it. They should not, but one of them looks at you as if they do.'
					}
				],
				trackers: [
					{
						name: 'Day',
						kind: 'count',
						start: '1',
						about:
							'Moves on after the night slot. At 7 the week ends on the highest route; without a finished route, the game starts again from day one.'
					},
					{
						name: 'Time of day',
						kind: 'text',
						start: 'Morning',
						about: 'Morning, afternoon or night: the slot being spent now.'
					},
					{
						name: 'Hearts',
						kind: 'text',
						start: 'Nobody yet',
						about:
							'The two highest housemates and their hearts out of 5, like “Mina 3/5; Ruth 2/5”. Moves only for a choice that matters to them. At 5, their route’s ending opens.'
					},
					{
						name: 'Routes locked',
						kind: 'list',
						start: '',
						about:
							'Housemates whose route closed on day five. A locked route stays locked unless the game is loaded.'
					}
				],
				dials: { heat: 3, kink: 1 }
			}
		},
		{
			id: 'machines-castaways',
			label: 'Castaways',
			idea: {
				title: 'Castaways',
				setting:
					'a wooded island in warm water: a white beach, the plane’s wreck in the shallows, a spring inland, and one cave',
				premise:
					'a charter plane down on an uninhabited island with seven adults aboard, a pilot who blames themself, and a month of survival that turns, night by night, into something none of you will tell the rescuers about',
				yourRole: 'one of the passengers',
				tone: 'survival, tension, heat and sweat, a slow burn into explicit',
				notes: '',
				parts: [
					{
						name: 'the pilot',
						description: 'flew you here, feels responsible, and keeps the camp running'
					},
					{
						name: 'the other survivors',
						description:
							'five strangers from the flight, made as the island’s rules say, who pair off, fall out and make deals as the days go'
					}
				],
				own: [
					{
						label: 'How a survivor is made',
						value:
							'Each survivor is an adult with a job back home (a dentist, a maid of honour of forty, still in the dress, a retired marine, a crypto bore, a yoga teacher), a skill that matters here, a flaw that does not, and one want they would never admit on the mainland. Each has a name and a look the story keeps to.'
					},
					{
						label: 'Rules of the island',
						value:
							'Nobody is coming for a month. Everyone needs something from somebody. Nights are cold and blankets few. Whatever happens in the cave stays in the cave, unless someone needs leverage.'
					}
				],
				openings: [
					{
						label: 'Washed up',
						situation:
							'The wreck is still smoking in the shallows, someone is shouting from the water, and the pilot is counting heads.'
					},
					{
						label: 'Day twelve',
						situation:
							'Camp is built and the rationing works. Last night you heard two of the others in the cave, and this morning everyone is pretending they did not.'
					},
					{
						label: 'The storm',
						situation:
							'A storm has driven all seven of you into the one cave, soaked through, with one dry blanket between you.'
					},
					{
						label: 'A sail',
						situation:
							'Day thirty: a sail on the horizon, the signal fire laid and unlit, and nobody reaching for the matches.'
					}
				],
				trackers: [
					{
						name: 'Day',
						kind: 'count',
						start: '1',
						about: 'Moves on at nightfall, a day at most per passage. Around 30, a ship comes.'
					},
					{
						name: 'Supplies',
						kind: 'meter',
						start: '60',
						about:
							'Food and water. Falls a little each day, rises with a good find or catch. Under 20, tempers fray and shares get traded for favours; at 0 someone must walk to the far side.'
					},
					{
						name: 'Camp',
						kind: 'list',
						start: 'Wreck salvage; One knife',
						about: 'What the camp has built or found. Once made, a thing stays.'
					},
					{
						name: 'Who’s with whom',
						kind: 'text',
						start: 'Nobody, yet',
						about:
							'Who has paired off at night, as the camp knows it or does not. Changes when someone new crosses a line.'
					}
				],
				dials: { heat: 4, kink: 2 }
			}
		},
		{
			id: 'machines-bathhouse',
			label: 'The bathhouse',
			idea: {
				title: 'The bathhouse',
				setting:
					'Hollow Spring, an old timber bathhouse high in the snowy mountains, the road shut until the thaw',
				premise:
					'a mountain bathhouse where the snow keeps every guest in for the week, the keeper hands you a pouch of wooden tokens, and each bath comes with its own attendant and its own service',
				yourRole: 'a guest, snowed in, choosing where to spend each token',
				tone: 'languid, warm, sensual, a little comic',
				notes: '',
				parts: [
					{
						name: 'the keeper',
						description: 'runs the house, hands out the tokens, and decides who attends you'
					},
					{
						name: 'the attendants',
						description:
							'the staff, one to a bath, each with a different touch, made as the house says'
					}
				],
				own: [
					{
						label: 'The baths',
						value:
							'The open spring: soaking, talking, hands under the water. The steam room: two attendants, sweat and slow hands. The oil room: a long massage that does not stop where massages stop. The cold plunge: a shock, then being warmed up by any means. The quiet room: three tokens, and the keeper attends it herself.'
					},
					{
						label: 'How an attendant is made',
						value:
							'Each attendant is an adult with a body and a temperament of their own (shy, bossy, chatty, wordless), one speciality, and one thing they ask a guest for in return. Never two alike. Monster-folk work here too: a horned attendant in the steam room, a four-armed masseuse.'
					}
				],
				openings: [
					{
						label: 'Arrival in the snow',
						situation:
							'The keeper takes your coat at the door and holds out a small pouch of wooden tokens. Pick a bath.'
					},
					{
						label: 'The oil room',
						situation:
							'Day three: you are face down on a warm table, and the attendant asks whether you would like them to carry on.'
					},
					{
						label: 'The quiet room',
						situation:
							'The last night: you have saved three tokens, and the keeper is lighting the lamps in the quiet room herself.'
					}
				],
				trackers: [
					{
						name: 'Tokens',
						kind: 'count',
						start: '7',
						about:
							'One per bath, three for the quiet room. The keeper gives one back for a kindness to her staff. At 0, the next one has to be earned.'
					},
					{
						name: 'Flushed',
						kind: 'meter',
						start: '20',
						about:
							'How hot and dizzy the guest is from the water and the hands. Rises in the hot baths, drops in the cold plunge. At 100 they are carried to the cool room by whoever is nearest.'
					},
					{
						name: 'Baths tried',
						kind: 'list',
						start: '',
						about: 'Each bath the guest has been to, once each.'
					}
				],
				dials: { heat: 4, kink: 2 }
			}
		},
		{
			id: 'machines-first-shift',
			label: 'The first shift',
			idea: {
				title: 'The first shift',
				setting:
					'Hollow Spring, an old timber bathhouse high in the snowy mountains, the road shut until the thaw',
				premise:
					'your first week as an attendant at a snowed-in mountain bathhouse, where guests pay in wooden tokens, the keeper sets your rota each morning, and every bath on it ends in a service you are still learning',
				yourRole: 'the newest attendant, on trial for the week',
				tone: 'warm, sensual, service, a little humbling',
				notes: '',
				parts: [
					{
						name: 'the keeper',
						description: 'trains you, sets your rota, and inspects your work herself'
					},
					{
						name: 'the guests',
						description:
							'snowed in and paying in tokens: adults with jobs down the mountain, each with a request and a way of tipping'
					},
					{
						name: 'the senior attendant',
						description: 'has worked every bath for ten years, and shows you how, hands on'
					}
				],
				own: [
					{
						label: 'How a guest is made',
						value:
							'Each guest is an adult with a life below (a surgeon, a widowed farmer, a couple on their anniversary, a famous chef), a request they are shy or bold about, and a tip they leave: tokens, a secret, or a turn on the table for you.'
					}
				],
				openings: [
					{
						label: 'Day one: the apron',
						situation:
							'The keeper ties your apron herself, hands you the rota, and tells you the open spring is a gentle start.'
					},
					{
						label: 'The steam room, with two',
						situation: 'A couple has booked the steam room and asked for the new attendant by name.'
					},
					{
						label: 'Inspection',
						situation:
							'The keeper wants to see how you do the oil room, and she is the one on the table.'
					}
				],
				trackers: [
					{
						name: 'Rota',
						kind: 'list',
						start: 'The open spring; The steam room',
						about:
							'Today’s baths. The keeper adds one each morning; a bath comes off once it is done.'
					},
					{
						name: 'Tips',
						kind: 'count',
						start: '0',
						about: 'Tokens the guests leave the attendant.'
					},
					{
						name: 'The keeper’s approval',
						kind: 'meter',
						start: '30',
						about:
							'Rises for good work and kindness to guests, falls for a rushed bath. At 100 she offers a place for good; at 0 she sends the attendant down when the road opens.'
					}
				],
				dials: { heat: 4, kink: 3 }
			}
		},
		{
			id: 'machines-other-channels',
			label: 'The other channels',
			idea: {
				title: 'The other channels',
				setting: 'your sofa, late at night, the room lit only by the screen',
				premise:
					'a second-hand cable box that picks up channels no provider sells, with a show for every kink anyone has ever had, and a remote with a keyboard for typing in what you want to watch',
				yourRole: 'the one holding the remote',
				tone: 'comic, sleazy, filthy, a different genre on every channel',
				notes: '',
				parts: [
					{
						name: 'the people on screen',
						description:
							'the cast of whatever is on: presenters, contestants, lovers, interviewees, all adults, new every channel, and in character'
					},
					{
						name: 'the continuity announcer',
						description:
							'a voice between programmes who knows a little too much about what you will pick next'
					}
				],
				own: [
					{
						label: 'The listings',
						value:
							'Each programme opens with its channel, its kind of show (a soap, a documentary about a swingers’ resort, a cooking contest, a late-night shopping channel, the news, a reality show, a period drama, an advert break) and its title. It plays a stretch, then asks: keep watching, or change the channel?'
					},
					{
						label: 'Channel zero',
						value:
							'Somewhere above the highest number is a channel showing your own living room, live. Whoever is on it can see you too, and has been waiting for you to find it.',
						spoiler: true
					}
				],
				openings: [
					{
						label: 'Switching it on',
						situation:
							'The box hums, the screen says WELCOME, and the remote’s keyboard blinks: type a kink, or a kind of show.'
					},
					{
						label: 'The shopping channel',
						situation:
							'Three in the morning: two presenters demonstrating a product live, and the demonstration has gone well past the brochure.'
					},
					{
						label: 'The reality show',
						situation:
							'Episode six of a villa dating show, where tonight’s challenge is set by the viewers’ vote, and your remote has a button for it.'
					}
				],
				trackers: [
					{
						name: 'Now showing',
						kind: 'text',
						start: 'Static',
						about:
							'The channel and programme on now, in a few words. Changes when the channel does.'
					},
					{
						name: 'Watched',
						kind: 'list',
						start: '',
						about: 'Each programme seen, a few words each.'
					}
				],
				dials: { heat: 5, kink: 3 }
			}
		},
		{
			id: 'machines-down-to-nothing',
			label: 'Down to nothing',
			idea: {
				title: 'Down to nothing',
				setting:
					'a cable studio at midnight: a lit stage, three podiums, a forfeit wheel, and a live audience of two hundred',
				premise:
					'a late-night game show you applied to on a dare: a right answer grows the prize pot, a wrong one costs a piece of clothing, and once there is nothing left to lose, the forfeit wheel decides what the studio audience gets to see',
				yourRole: 'a contestant, under your own name, live',
				tone: 'glitzy, comic, humiliating, exhibitionist, filthy',
				notes: '',
				parts: [
					{
						name: 'the host',
						description: 'reads the questions, spins the wheel, and never stops smiling'
					},
					{
						name: 'the other contestants',
						description:
							'two rivals at the other podiums, each an adult with a job, a reason they need the money, and one forfeit they dread'
					},
					{
						name: 'the studio audience',
						description: 'two hundred people who cheer, boo, and vote on forfeits'
					}
				],
				own: [
					{
						label: 'Rules of the show',
						value:
							'Three rounds and a final. A right answer adds to the pot; a wrong one costs a piece of clothing, the host’s pick. With nothing left to lose, a wrong answer spins the wheel. A contestant may bank at the end of any round and walk away with the pot, and whatever they have lost by then, they lost on camera.'
					},
					{
						label: 'The forfeit wheel',
						value:
							'Kiss a stranger from row three; a spanking from the host; the audience chooses; swap places with a rival; five minutes in the glass booth; the host’s choice; double or nothing; the mystery prize.'
					}
				],
				openings: [
					{
						label: 'Round one',
						situation:
							'Lights up. The host introduces you to the cameras, and the first question is about you.'
					},
					{
						label: 'The wheel',
						situation:
							'Round two, three wrong answers in: you are down to your underwear, and the host has a hand on the wheel.'
					},
					{
						label: 'Sudden death',
						situation:
							'The final: you and one rival, both naked, one question, and the winner chooses the loser’s forfeit.'
					},
					{
						label: 'After the show',
						situation:
							'The green room, cameras off: the host knocks with your cheque, and something they could not say on air.'
					}
				],
				trackers: [
					{
						name: 'Prize pot',
						kind: 'count',
						start: '0',
						about: 'Grows by 1000 for each right answer; double or nothing can double or empty it.'
					},
					{
						name: 'Clothes left',
						kind: 'count',
						start: '5',
						about: 'Falls by one for each wrong answer. At 0, every wrong answer spins the wheel.'
					},
					{
						name: 'Forfeits',
						kind: 'list',
						start: '',
						about: 'Each forfeit the wheel has given the contestant, in a few words.'
					},
					{
						name: 'Round',
						kind: 'count',
						start: '1',
						about: 'Moves on after each round’s last question. After round 3 comes the final.'
					}
				],
				dials: { heat: 5, kink: 3 }
			}
		},
		{
			id: 'machines-your-show',
			label: 'Your show',
			idea: {
				title: 'Your show',
				setting:
					'a cable studio at midnight: a lit stage, a podium, a forfeit wheel, and a live audience of two hundred',
				premise:
					'the late-night game show you host: tonight’s contestant answers for a prize pot, pays for wrong answers in clothing, and spins your forfeit wheel once there is nothing left, while the producer in your earpiece wants ratings',
				yourRole: 'the host',
				tone: 'glitzy, comic, humiliating, exhibitionist, filthy',
				notes: '',
				parts: [
					{
						name: 'the contestant',
						description: 'applied on a dare, needs the money, and is already regretting the dare'
					},
					{
						name: 'the studio audience',
						description: 'two hundred people who cheer, boo, and vote on forfeits'
					},
					{
						name: 'the producer',
						description:
							'a voice in your earpiece who wants it filthier and faster, and keeps sending notes'
					}
				],
				own: [
					{
						label: 'Rules of the show',
						value:
							'Three rounds and a final. A right answer adds to the pot; a wrong one costs a piece of clothing, the host’s pick. With nothing left to lose, a wrong answer spins the wheel. The contestant may bank at the end of any round.'
					},
					{
						label: 'The forfeit wheel',
						value:
							'Kiss a stranger from row three; a spanking from the host; the audience chooses; five minutes in the glass booth; the host’s choice; double or nothing; the mystery prize.'
					}
				],
				openings: [
					{
						label: 'Cold open',
						situation:
							'Lights up, the band plays you on, and the contestant is at the podium, fully dressed and visibly shaking.'
					},
					{
						label: 'The wheel',
						situation:
							'Round two: the contestant has nothing left to take off, and the wheel is waiting for your hand.'
					},
					{
						label: 'The phone vote',
						situation:
							'Viewers are voting on a forfeit live, and the producer says the numbers are the best the show has ever had.'
					}
				],
				trackers: [
					{
						name: 'Prize pot',
						kind: 'count',
						start: '0',
						about: 'Grows by 1000 for each right answer; double or nothing can double or empty it.'
					},
					{
						name: 'Clothes left',
						kind: 'count',
						start: '5',
						about:
							'The contestant’s. Falls by one for each wrong answer. At 0, every wrong answer spins the wheel.'
					},
					{
						name: 'Ratings',
						kind: 'meter',
						start: '50',
						about:
							'Rises with every gasp, falls when the show drags. At 100 the network renews the show; under 20 the producer starts calling the forfeits.'
					}
				],
				dials: { heat: 5, kink: 3 }
			}
		},
		{
			id: 'machines-dungeon-crawl',
			label: 'The dungeon crawl',
			idea: {
				title: 'The dungeon crawl',
				setting:
					'the Maw, a dungeon under a frontier town: a guild hall above, then floors of caverns, flooded halls, a fungus garden, a forge, and a sealed door at the bottom',
				premise:
					'a text adventure into a dungeon whose monsters do not kill adventurers: they wear them out and have their way, and every floor down they are bigger, stranger and hungrier. Run out of stamina and you wake at the last campfire, used, with your gear where you dropped it',
				yourRole: 'an adventurer on a guild contract to reach the bottom',
				tone: 'game-like, perilous, filthy, with a dry narrator',
				notes: '',
				parts: [
					{
						name: 'the monsters',
						description:
							'the dungeon’s inhabitants, adults and people all, new ones every floor, made as the dungeon’s rules say'
					},
					{
						name: 'the beast at the bottom',
						description: 'behind the sealed door, and has been listening to you come down'
					},
					{
						name: 'the guild clerk',
						description: 'sells supplies above, and takes bets on how far you will get'
					}
				],
				own: [
					{
						label: 'How a monster is made',
						value:
							'Each new monster is a kind (orc, minotaur, lamia, a goblin crew, slime-folk, harpy, living armour, mimic), a temperament (cocky, shy, greedy, playful, tender afterwards) and one kink of its own (bondage, breeding, edging, size, an audience of its friends, praise). No two in a row share a kink. They talk, bargain, and can be talked round.'
					},
					{
						label: 'Game rules',
						value:
							'Every action costs stamina; a campfire rest restores it. A fight is a contest, not a slaughter, and the loser is pinned. At 0 stamina the monster has won and has its way, told in full, then the adventurer wakes at the last campfire. Questions about what you see, carry or know never move the story on. Now and then something goes very wrong.'
					}
				],
				openings: [
					{
						label: 'The guild hall',
						situation:
							'You sign the contract, the clerk takes a bet against you, and the stairs down are behind the notice board.'
					},
					{
						label: 'Floor three, cornered',
						situation:
							'Out of rope and nearly out of stamina, backed against a flooded wall while a lamia decides what to do with you.'
					},
					{
						label: 'The sealed door',
						situation:
							'Floor nine: the door at the bottom is open, and something inside says your name.'
					}
				],
				trackers: [
					{
						name: 'Stamina',
						kind: 'meter',
						start: '100',
						about:
							'Falls with every action, fight and orgasm; a campfire rest restores it. At 0 the adventurer is caught and the monster has its way.'
					},
					{
						name: 'Floor',
						kind: 'count',
						start: '1',
						about: 'Goes up by one each staircase down. At 10, the bottom.'
					},
					{
						name: 'Pack',
						kind: 'list',
						start: 'Rope; Torch; Healing draught; Ten coins',
						about: 'What the adventurer carries. Used items go, found items come on.'
					},
					{
						name: 'Times caught',
						kind: 'count',
						start: '0',
						about:
							'Up by one each time stamina hits 0. The monsters talk: the more caught, the bolder they get.'
					}
				],
				dials: { heat: 5, kink: 4 }
			}
		},
		{
			id: 'machines-dungeon-core',
			label: 'The dungeon core',
			idea: {
				title: 'The dungeon core',
				setting:
					'a dungeon under the hills, rebuilt as mana allows: holding cells, a trap hall, a monster den, a throne room',
				premise:
					'you are the will of a dungeon waking after a century, and the first adventurer down in a hundred years is caught on the third floor; the dungeon’s core reports what it holds, asks your rulings, and turns every captive’s pleasure into the mana the dungeon grows on',
				yourRole: 'the dungeon’s master, whose word the core carries out',
				tone: 'cold, procedural, filthy, a slow breaking',
				notes: '',
				parts: [
					{
						name: 'the captured adventurer',
						description: 'caught on the third floor: proud, armoured, and the first in a century'
					},
					{
						name: 'the monsters',
						description:
							'the dungeon’s servants, adults and people all, made as the core’s rules say'
					},
					{
						name: 'the rescue party',
						description: 'more adventurers on their way down for the first one'
					}
				],
				own: [
					{
						label: 'The core’s rules',
						value:
							'Mana comes from a captive’s pleasure, more from surrender than from force. Mana buys floors, traps, monsters and toys, each at a cost the core states. A monster is a kind, a temperament and one kink of its own, never two alike. A captive who escapes takes the dungeon’s location with them.'
					}
				],
				openings: [
					{
						label: 'Waking',
						situation:
							'The core reports one intruder held on floor three, mana nearly empty, and awaits your first ruling.'
					},
					{
						label: 'The rescue party',
						situation:
							'Three adventurers have come down for the first. The core asks how far to let them get.'
					},
					{
						label: 'Surrender',
						situation:
							'Day twenty: the captive has stopped trying the door, and the core asks whether to take the chains off.'
					}
				],
				trackers: [
					{
						name: 'Mana',
						kind: 'count',
						start: '5',
						about:
							'Earned from captives’ pleasure, most from surrender; spent on what the dungeon builds, at the price the core states.'
					},
					{
						name: 'Will to resist',
						kind: 'meter',
						start: '100',
						about:
							'The captive’s. Falls as they give in, rises after a night alone. At 0 they ask to stay, and stop being a prisoner.'
					},
					{
						name: 'The dungeon',
						kind: 'list',
						start: 'Holding cell; One slime',
						about: 'What the dungeon has built or bred. Each item stays once bought.'
					}
				],
				dials: { heat: 5, kink: 4 }
			}
		},
		{
			id: 'machines-the-licence',
			label: 'The licence',
			idea: {
				title: 'The licence',
				setting:
					'an ordinary city after the birth-rate laws: offices, trains, cafés and gyms, each with the licence notice posted by the door',
				premise:
					'the gold card in your wallet: a breeding licence issued to a few thousand people, which entitles you to sex with any adult you choose, wherever you find them, with the law behind you and no birth control allowed, and everyone knows what the card means',
				yourRole: 'a new licence holder',
				tone: 'matter-of-fact, filthy, a power fantasy, comic in how ordinary it all is',
				notes: '',
				parts: [
					{
						name: 'the public',
						description:
							'everyone else, made as the law says: adults with jobs, each with their own reaction to the card'
					},
					{
						name: 'the registry clerk',
						description: 'logs every use, checks the paperwork, and follows up'
					},
					{
						name: 'the rival holder',
						description: 'another licence holder working the same part of town'
					}
				],
				own: [
					{
						label: 'The law',
						value:
							'A holder may have any adult, anywhere in public or at work, once the card is shown. Nobody may refuse, delay or call security. Asking is allowed and often granted: a position, a name, where to finish. The one place the card does not reach is inside someone’s home, unless they invite the holder in. Every use is logged within the day.'
					},
					{
						label: 'How a stranger is made',
						value:
							'Each person the card is shown to is an adult with a job and a day under way, one reaction (outraged, resigned, secretly thrilled, proud to be chosen, bored) and one thing they ask for. Never the same reaction twice running.'
					}
				],
				openings: [
					{
						label: 'The envelope',
						situation:
							'The card arrives by courier with a booklet of rules. Your first stop is wherever you choose.'
					},
					{
						label: 'The morning train',
						situation:
							'A packed carriage, the card in your hand, and a commuter who has just seen it.'
					},
					{
						label: 'The monthly review',
						situation:
							'Your review at the Department: the clerk has your log open, and questions about it.'
					},
					{
						label: 'An invitation',
						situation:
							'Someone you have used twice has asked you home, where the card does not count.'
					}
				],
				trackers: [
					{
						name: 'Uses logged',
						kind: 'count',
						start: '0',
						about: 'Up by one for each person the card is used on.'
					},
					{
						name: 'Notoriety',
						kind: 'meter',
						start: '0',
						about:
							'How well the city knows the holder. Rises with every public use. At 100 people recognise them on sight, and some come looking.'
					},
					{
						name: 'Pregnancies reported',
						kind: 'count',
						start: '0',
						about:
							'The registry reports one now and then, weeks after a use. Each one is a letter of thanks.'
					}
				],
				dials: { heat: 5, kink: 4 }
			}
		},
		{
			id: 'machines-the-register',
			label: 'The register',
			idea: {
				title: 'The register',
				setting:
					'an ordinary city after the birth-rate laws: offices, trains, cafés and gyms, each with the licence notice posted by the door',
				premise:
					'your name drawn for a month on the public availability register: a mark on your wrist, a notice from the Department, and every licence holder in the city entitled to you, wherever they find you',
				yourRole: 'a citizen listed on the register for thirty days',
				tone: 'bureaucratic, relentless, humiliating, filthy',
				notes: '',
				parts: [
					{
						name: 'the registry clerk',
						description:
							'your case officer: logs every use reported against you, and issues amendments'
					},
					{
						name: 'the licence holders',
						description:
							'anyone with a gold card: adults, each with a job, a manner and a habit of their own; showing the card is all it takes'
					}
				],
				own: [
					{
						label: 'Notice of listing',
						value:
							'A listed citizen wears the mark uncovered, stops when a card is shown, stays where used until released, reports every use within the day, and refuses nothing lawful. An infraction adds days and a condition. Asking a holder for something is allowed; they need not grant it.'
					},
					{
						label: 'How a holder is made',
						value:
							'Each holder is an adult with a job (a bus driver, a judge, a personal trainer, a priest on leave), a manner (brisk, polite, gloating, tender) and one habit they always want. No two alike.'
					}
				],
				openings: [
					{
						label: 'Notice of listing',
						situation:
							'Day one: the mark is still warm on your wrist, and your first notice arrives before breakfast.'
					},
					{
						label: 'Day fifteen',
						situation: 'Halfway: the log runs to pages, and the Department has added conditions.'
					},
					{
						label: 'The audit',
						situation: 'Your case officer has called you in about a use you did not report.'
					}
				],
				trackers: [
					{
						name: 'Days remaining',
						kind: 'count',
						start: '30',
						about:
							'Down by one each day; an infraction adds days. At 0 the listing ends, and the Department asks whether to renew.'
					},
					{
						name: 'Uses logged',
						kind: 'count',
						start: '0',
						about: 'Up by one for each holder who uses the listed citizen.'
					},
					{
						name: 'Conditions',
						kind: 'list',
						start: 'Mark uncovered; Stop when a card is shown',
						about:
							'The conditions in force. Each infraction adds one; the Department never lifts one early.'
					}
				],
				dials: { heat: 5, kink: 5 }
			}
		}
	],
	starters: [
		{
			id: 'machines-dating-sim',
			you: null,
			tags: ['dating sim', 'comedy', 'slow burn'],
			voice: 'told',
			idea: 'machines-dating-sim',
			summary:
				'[[idea|A dating sim you woke up inside, in a seaside boarding house]]: seven days, five housemates with a route each, and a heart meter over every head, for a [[heat|steamy]] week starting [[opening|from the beginning]]. It’s told [[voice|to you by a narrator]].',
			cast: []
		},
		{
			id: 'machines-castaways',
			you: null,
			tags: ['survival', 'stranded', 'group'],
			voice: 'told',
			idea: 'machines-castaways',
			summary:
				'[[idea|A charter plane down on an uninhabited island]], seven strangers, and a month of survival. [[Ridley|Ridley]], the pilot, keeps the camp going and blames themself, as the nights turn [[heat|explicit]], starting [[opening|from the beginning]]. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'machines-hollis',
					part: 'the pilot',
					relationship: 'the pilot who flew you here',
					doing: 'counting heads on the beach, and coming up one short'
				}
			]
		},
		{
			id: 'machines-bathhouse',
			you: 'dom',
			tags: ['bathhouse', 'massage', 'pampered'],
			voice: 'talk',
			idea: 'machines-bathhouse',
			summary:
				'[[idea|A snowed-in mountain bathhouse with a pouch of tokens and a bath for each]]. [[Sigrun|Sigrun]], the keeper, takes your coat and sends an attendant to every bath you choose, for an [[heat|explicit]] week starting [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'machines-odile',
					part: 'the keeper',
					relationship: 'the keeper of the house you are snowed in at',
					doing: 'holding out a pouch of tokens, and asking which bath first'
				}
			]
		},
		{
			id: 'machines-first-shift',
			you: 'sub',
			tags: ['service', 'bathhouse', 'training'],
			voice: 'told',
			idea: 'machines-first-shift',
			summary:
				'[[idea|Your first week as an attendant at a snowed-in mountain bathhouse]]. [[Sigrun|Sigrun]] ties your apron, sets your rota and inspects your work herself, for an [[heat|explicit]] week starting [[opening|from the beginning]]. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'machines-odile',
					part: 'the keeper',
					relationship: 'your new employer',
					doing: 'tying your apron, and handing you the day’s rota'
				}
			]
		},
		{
			id: 'machines-other-channels',
			you: null,
			tags: ['voyeurism', 'comedy', 'anything goes'],
			voice: 'told',
			idea: 'machines-other-channels',
			summary:
				'[[idea|A second-hand cable box that picks up a channel for every kink]], and a remote with a keyboard: type it in, and watch something [[heat|filthy]], starting [[opening|from the beginning]]. It’s told [[voice|to you by a narrator]].',
			cast: []
		},
		{
			id: 'machines-down-to-nothing',
			you: 'sub',
			tags: ['game show', 'stripping', 'exhibitionism'],
			voice: 'talk',
			idea: 'machines-down-to-nothing',
			summary:
				'[[idea|A late-night game show where wrong answers cost clothes, then forfeits]]. [[Quill|Quill]] hosts, reads the questions and spins the wheel, live in front of two hundred people, for a [[heat|filthy]] night starting [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'machines-quill',
					part: 'the host',
					relationship: 'the host of the show you applied to on a dare',
					doing: 'introducing you to the cameras, with the first question about you'
				}
			]
		},
		{
			id: 'machines-your-show',
			you: 'dom',
			tags: ['game show', 'stripping', 'humiliation'],
			voice: 'talk',
			idea: 'machines-your-show',
			summary:
				'[[idea|The late-night game show you host, with a forfeit wheel and a producer in your ear]]. [[Kit|Kit]], tonight’s contestant, is at the podium, mouthy and shaking, for a [[heat|filthy]] night starting [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'brat',
					part: 'the contestant',
					relationship: 'tonight’s contestant, here on a dare',
					doing: 'at the podium, fully dressed, already talking back'
				}
			]
		},
		{
			id: 'machines-dungeon-crawl',
			you: 'sub',
			tags: ['monsters', 'adventure', 'losing'],
			voice: 'told',
			idea: 'machines-dungeon-crawl',
			summary:
				'[[idea|A text adventure into a dungeon whose monsters wear you out and have their way]]. Floor by floor they get bigger, and [[Rhys|Rhys]] waits behind the sealed door at the bottom, for a [[heat|filthy]] crawl starting [[opening|from the beginning]]. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'beast',
					part: 'the beast at the bottom',
					relationship: 'a rumour in the guild hall, until floor nine',
					doing: 'listening to you come down the stairs'
				}
			]
		},
		{
			id: 'machines-dungeon-core',
			you: 'dom',
			tags: ['monsters', 'captive', 'breaking'],
			voice: 'command',
			idea: 'machines-dungeon-core',
			summary:
				'[[idea|You are the will of a dungeon, and its first captive in a century is waiting]]. [[Aldis|Aldis]], a proud paladin, is chained on floor three while the core asks your rulings, for a [[heat|filthy]] breaking starting [[opening|from the beginning]]. It’s told [[voice|as a system’s orders to the one it governs, answering to you]].',
			cast: [
				{
					character: 'machines-aldis',
					part: 'the captured adventurer',
					relationship: 'the dungeon’s first captive in a century',
					doing: 'chained in the holding cell, reciting vows at the wall'
				}
			]
		},
		{
			id: 'machines-the-licence',
			you: 'dom',
			tags: ['free use', 'breeding', 'licence'],
			voice: 'told',
			idea: 'machines-the-licence',
			summary:
				'[[idea|The gold card in your wallet: a breeding licence to any adult you choose]]. [[Pell|Pell]], the registry clerk, logs every use and has questions, in a [[heat|filthy]] city starting [[opening|from the beginning]]. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'machines-pell',
					part: 'the registry clerk',
					relationship: 'the clerk who handles your file',
					doing: 'opening a new log under your name'
				}
			]
		},
		{
			id: 'machines-the-register',
			you: 'sub',
			tags: ['free use', 'rules', 'degradation'],
			voice: 'rules',
			idea: 'machines-the-register',
			summary:
				'[[idea|Your name drawn for a month on the public availability register]], with a mark on your wrist. [[Pell|Pell]], your case officer, logs every use against you, for thirty [[heat|filthy]] days starting [[opening|from the beginning]]. It’s told [[voice|as a system’s orders to you]].',
			cast: [
				{
					character: 'machines-pell',
					part: 'the registry clerk',
					relationship: 'your case officer at the Department',
					doing: 'issuing your notice of listing'
				}
			]
		}
	]
};
