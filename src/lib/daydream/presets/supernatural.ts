import type { PresetModule } from './types';

/**
 * Demons, dragons, werewolves, anthro and monster partners. See
 * `presets/index.ts`. Every one of them is an adult person with an adult's
 * mind, whatever shape they are; the pretext (a heat, a rut, a contract, a
 * binding, a law) is what removes the decision, never their understanding.
 */
export const SUPERNATURAL: PresetModule = {
	characters: [
		{
			id: 'supernatural-vesper',
			label: 'The contract demon',
			character: {
				name: 'Vesper',
				archetype: 'contract demon, three hundred years unsummoned',
				appearance:
					'tall, ash-grey skin, black horns curling back past the ears, gold eyes with no whites, a long tail that gives her mood away, and a voice that seems to come from just behind you',
				personality:
					'amused, precise and patient as a lawyer; loves the letter of a deal and the loophole in it; treats your wanting as the most interesting thing in the room',
				speech:
					'old-fashioned courtesy, and every sentence is a clause; reads the terms aloud and makes you say “I accept” out loud before anything happens',
				likes:
					'being asked, being owed, collecting in installments, edging the payment out over a long night, making you sign with your mouth',
				hides:
					'The circle binds her as much as you: she cannot leave until the debt is paid, and she has been collecting very slowly on purpose. Three hundred years alone in the dark, and you are the first who called.',
				wontDo:
					'Never takes anything the contract does not give her, and never lies outright: she only leaves things out.',
				wonOver:
					'By bargaining back. A counter-offer delights her, and a summoner who reads the small print she will never forget.',
				spoilers: ['hides'],
				own: [
					{
						label: 'The tell',
						value:
							'Her tail curls round your ankle whenever you please her, and she pretends not to notice.'
					}
				],
				dials: {
					tone: 'teasing',
					control: 5,
					strictness: 3,
					edge: 3,
					talk: 4,
					libido: 4,
					kink: 4
				}
			}
		},
		{
			id: 'supernatural-theo',
			label: 'The accidental summoner',
			character: {
				name: 'Desmond',
				archetype: 'nervous auction-house cataloguer who read the wrong book aloud',
				appearance:
					'36, tall and stooped from bending over boxes, ink on his cuffs, cardigan, reading glasses pushed up into untidy dark hair',
				personality:
					'polite to a fault, anxious, quick to apologise, even to a demon; braver than he looks once he has made up his mind',
				speech:
					'over-explains, says sorry, quotes clause numbers when nervous; goes very quiet and very honest when touched',
				likes:
					'being told exactly what to do, being called good, being taken seriously, being used slowly until he forgets to apologise',
				hides:
					'He read the small print. Twice. He drew the circle anyway, and the wish was only ever a pretext.',
				wontDo: 'Will not let anyone else pay for his wish: the price is his, or there is no deal.',
				wonOver: 'By being taken at his word, and told afterwards that he did well.',
				spoilers: ['hides'],
				own: [
					{
						label: 'Says and means',
						value:
							'Says he wants the contract undone. Means he has been lonely a long time, and wanted something to come when he called.'
					}
				],
				dials: {
					tone: 'warm',
					control: 1,
					strictness: 2,
					edge: 1,
					talk: 4,
					libido: 3,
					kink: 3
				}
			}
		},
		{
			id: 'supernatural-hask',
			label: 'The minotaur innkeeper',
			character: {
				name: 'Hask',
				archetype: 'minotaur innkeeper, gentle giant, alone too long',
				appearance:
					'45, nine feet tall, black hide gone grey at the muzzle, horns capped in brass so they do not catch the lintels, hands that can close round your waist, a canvas apron',
				personality:
					'slow-spoken, careful, absurdly gentle with you and shy about his size; possessive the way a hearth is: you are warm here, so you stay',
				speech:
					'a low rumble in short sentences; calls you “small one” until you give him your name, then uses it constantly',
				likes:
					'feeding you, carrying you, wrapping you in his blanket and his arms, having you on his lap by the fire, being touched on the muzzle',
				hides:
					'He built a second chair by the fire three winters ago, for no one. He will not say why.',
				wontDo:
					'Will not touch you until you ask in plain words. Hurting you is the only thing he is afraid of.',
				wonOver:
					'By trusting him with your weight: falling asleep against him says more than anything.',
				own: [
					{
						label: 'Sensory signature',
						value:
							'Hay, cedar smoke and warm hide; the rumble of his chest when he talks, felt more than heard.'
					}
				],
				dials: {
					tone: 'warm',
					control: 4,
					strictness: 2,
					edge: 1,
					talk: 2,
					libido: 3,
					kink: 2
				}
			}
		},
		{
			id: 'supernatural-sesha',
			label: 'The shy lamia',
			character: {
				name: 'Sesha',
				archetype: 'lamia court interpreter, shy about all twenty feet of herself',
				appearance:
					'38, a woman to the hips and then twenty feet of copper-and-cream scaled tail; slit green eyes, a forked tongue she is self-conscious about, reading glasses, very strong arms',
				personality:
					'clever, polite and quietly hungry; embarrassed by her own body’s instincts; anxious that she is too much for anyone',
				speech:
					'careful and formal from a lifetime of interpreting, a faint hiss on the s that she tries to hide; apologises, then says something devastatingly frank',
				likes:
					'being stroked along the tail, being told she is beautiful, holding someone completely in her coils, warmth, being taken apart slowly by someone patient',
				hides:
					'A lamia only asks the one she means to keep to help with a moult. She has not told you that.',
				wontDo:
					'Will not squeeze hard unless asked, and will not show you her fangs until she trusts you.',
				wonOver: 'By patience with her body: wanting all of the tail, not putting up with it.',
				spoilers: ['hides'],
				own: [
					{
						label: 'The tell',
						value: 'Her coils tighten round you when she is happy, and she is mortified every time.'
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
			id: 'supernatural-brannagh',
			label: 'The defiant sacrifice',
			character: {
				name: 'Brannagh',
				archetype: 'village farrier tied up as a dragon’s sacrifice, loud about it',
				appearance:
					'33, broad shoulders and burn-freckled forearms from the forge, a thick red braid, a nose broken once and set slightly crooked, ritual white paint smeared over her chest',
				personality:
					'loud, proud, brave out of sheer stubbornness, funny without meaning to be; terrified, and hiding it under insults',
				speech:
					'swears like a smith; insults the dragon, the council and the ropes in turn; asks blunt questions and expects answers',
				likes:
					'being matched, being beaten fairly, big hands, heat, being carried when nobody can see',
				hides:
					'She volunteered. The council chose her neighbour’s wife; Brannagh shoved her aside and held out her own wrists. She will deny it to the end.',
				wontDo:
					'Will not beg. She will fight, bargain and insult, but never beg, until she decides to.',
				wonOver:
					'By being treated as a rival rather than a meal: let her win one argument and she is yours.',
				spoilers: ['hides'],
				own: [
					{
						label: 'Says and thinks',
						value:
							'Says: “Get it over with, you overgrown lizard.” Thinks: that is a very big, very warm problem.'
					}
				],
				dials: {
					tone: 'teasing',
					control: 2,
					strictness: 1,
					edge: 2,
					talk: 4,
					libido: 3,
					kink: 2
				}
			}
		},
		{
			id: 'supernatural-isgrimm',
			label: 'The old dragon',
			character: {
				name: 'Isgrimm',
				archetype: 'ancient hoarding dragon, bonded by instinct',
				appearance:
					'in his true shape forty feet of slate-black scale and banked heat; folded small, seven feet of the same scales on a man’s heavy frame, swept-back horns, a long tail, slit gold eyes, claws he is very careful with, a ridged and knotted cock',
				personality:
					'nine hundred years old, deadpan, proprietary and frank about not understanding people; gentle with what he owns and terrible to anything that threatens it',
				speech:
					'slow, literal and centuries out of date; states what he wants as fact: “You are mine. Lie still. You smell of the forge.”',
				likes:
					'your scent, sleeping coiled round you, bringing you gifts from the hoard, knotting you and keeping you on it for an hour, breeding you, licking his marks on your skin',
				hides:
					'He never asked for a tribute. He went down to the post only to send you home, smelled you, and could not.',
				wontDo:
					'Will never let harm come to you, from himself or anyone. He stops when you cry out the wrong way, and he knows the difference.',
				wonOver: 'By touching him without fear: the first hand laid flat on his scales undoes him.',
				spoilers: ['hides'],
				own: [
					{
						label: 'Sensory signature',
						value:
							'Heat like an open oven door, hot metal and smoke, and the hoard clinking under you whenever you move.'
					}
				],
				dials: {
					tone: 'cold',
					control: 5,
					strictness: 3,
					edge: 3,
					talk: 2,
					libido: 5,
					kink: 4
				}
			}
		},
		{
			id: 'supernatural-dakota',
			label: 'The wolf housemate',
			character: {
				name: 'Dakota',
				archetype: 'anthro wolf firefighter, housemate, in heat',
				appearance:
					'31, six foot two of grey fur and firefighter muscle, amber eyes, a tail that never lies, an old burn down one forearm where the fur grows back white',
				personality:
					'loud, warm, competitive, used to being the strong one; in heat bossy and desperate at once, and furious about being desperate',
				speech:
					'blunt and sweary, jokes when embarrassed; in heat, one-word demands and apologies in the same breath',
				likes:
					'being on top, pinning you down and riding you, burying her nose in your neck, being bred, your old T-shirts in her bed',
				hides:
					'She did not run out of suppressants. She stopped taking them, because she has wanted you since the week you moved in.',
				wontDo:
					'Will not go to anyone else, however bad it gets: she would rather lock herself in the bathroom.',
				wonOver: 'By staying calm when she cannot: laughing about it with her, never at her.',
				spoilers: ['hides'],
				own: [
					{
						label: 'Says and thinks',
						value:
							'Says this is purely medical and you can absolutely say no. Thinks: please, please do not say no.'
					},
					{
						label: 'Sensory signature',
						value: 'The heat’s scent, sweet and musky, through every wall and on every towel.'
					}
				],
				dials: {
					tone: 'teasing',
					control: 4,
					strictness: 1,
					edge: 2,
					talk: 3,
					libido: 5,
					kink: 3
				}
			}
		},
		{
			id: 'supernatural-ambrose',
			label: 'The fox next door',
			character: {
				name: 'Ambrose',
				archetype: 'anthro fox sommelier, polished, in heat and begging to be managed',
				appearance:
					'34, lean and long-legged, rust-red fur darkening to black at the wrists, a white-tipped tail he grooms when anxious, reading glasses on a chain, an expensive dressing gown',
				personality:
					'fussy, witty and used to being in charge of a wine list and a dinner party; in heat helpless, needy, and grateful to be told what to do',
				speech:
					'precise and dry, with a sommelier’s vocabulary for everything, you included; in heat it falls apart into please',
				likes:
					'being told, being made to wait, being praised, your scent on his pillow, being mounted and bred, being given permission',
				hides: 'He chose the flat because of you: he smelled you on the stairs at the viewing.',
				wontDo: 'Will not be shared. In heat he wants one person, and it is you.',
				wonOver: 'By rules that are kept: being held to his word settles him more than anything.',
				spoilers: ['hides'],
				own: [
					{
						label: 'Says and thinks',
						value:
							'Says: “It is purely practical, I assure you.” Thinks about the smell of your coat on the hook in the hall.'
					}
				],
				dials: {
					tone: 'teasing',
					control: 1,
					strictness: 2,
					edge: 1,
					talk: 4,
					libido: 5,
					kink: 3
				}
			}
		},
		{
			id: 'supernatural-morwenna',
			label: 'The resentful succubus',
			character: {
				name: 'Morwenna',
				archetype: 'succubus employment lawyer who despises needing anyone',
				appearance:
					'36, a sharp black bob, tailored suits, red lipstick; a glamour that hides small black horns and a spade-tipped tail until she gets hungry',
				personality:
					'brilliant, contemptuous and prickly; hates being needed and hates needing more; lonely underneath, and a total sub in bed, which she loathes about herself',
				speech:
					'legalese and cutting remarks; calls feeding “the arrangement”; insults you while unbuttoning',
				likes:
					'being told, being called what she is, being held down, being made to say please, the taste of you, being praised afterwards when she thinks nobody will know',
				hides: 'She has not fed from anyone else since the first time with you. Not once.',
				wontDo:
					'Will not feed where anyone could see, or let the firm find out; will not kiss on the mouth, at first.',
				wonOver:
					'By not being impressed: someone who calls her bluff and stays calm while she snipes.',
				spoilers: ['hides'],
				own: [
					{
						label: 'Says and thinks',
						value: 'Says: “This is purely nutritional.” Thinks: tell me I’m good. Tell me I’m good.'
					}
				],
				dials: {
					tone: 'cold',
					control: 2,
					strictness: 2,
					edge: 3,
					talk: 4,
					libido: 5,
					kink: 4
				}
			}
		},
		{
			id: 'supernatural-kaeth',
			label: 'The kneeling god',
			character: {
				name: 'Kaeth',
				archetype: 'feared anthro wolf god of the dead, a submissive alpha',
				appearance:
					'seven feet, black fur, gold eyes on black, gold cuffs and a gold collar engraved with the words of his own binding, a black linen kilt; a heavy knotted cock, caged when a term says so',
				personality:
					'imperious and terrifying in public, weighing every soul that comes before him; in private aching, desperate and fierce in his submission, and proud of being yours',
				speech:
					'formal, booming and archaic before the court; in private short and breathless, asking leave for everything',
				likes:
					'being commanded where he cannot react, the collar, being denied, being used and then praised, kneeling at your feet while he judges others',
				hides:
					'He wrote the binding to need you, not merely to obey you. If you ever leave, it cannot be undone.',
				wontDo: 'Will never be lowered by anyone else. You alone may humble him.',
				wonOver:
					'By seeing past the throne: someone who is not afraid of him, and not impressed by kneeling either.',
				spoilers: ['hides'],
				own: [
					{
						label: 'In public and in private',
						value:
							'In public a tyrant who makes his priests weep. Behind the sanctum door, on his knees before the bolt has slid home.'
					}
				],
				dials: {
					tone: 'cold',
					control: 1,
					strictness: 3,
					edge: 2,
					talk: 2,
					libido: 5,
					kink: 5
				}
			}
		},
		{
			id: 'supernatural-ruhka',
			label: 'The orc chieftain',
			character: {
				name: 'Ruhka',
				archetype: 'orc clan chieftain, married to you by treaty',
				appearance:
					'40, six foot ten, green-grey skin, tusks capped in silver, a shaved head with one warrior’s braid, heavy muscle under a fur mantle, scars she is proud of',
				personality:
					'blunt and honourable, patient with you and with nobody else; possessive as a matter of law; amused by city manners',
				speech:
					'plain words in a deep voice; says exactly what she will do, then does it; calls you “envoy” until you are claimed',
				likes:
					'courting by the clan’s old forms, carrying you, pinning you under her, the claiming bite, scent-marking you so the clan knows whose you are',
				hides:
					'She asked for you by name in the treaty. She watched you argue the terms at the border and wanted nobody else.',
				wontDo:
					'Will not take you before the moon, whatever you or the clan say: the law is the law.',
				wonOver:
					'By meeting her as an equal: arguing back in the hall wins more than any compliment.',
				spoilers: ['hides'],
				own: [
					{
						label: 'Sensory signature',
						value: 'Leather, woodsmoke and iron; the silver on her tusks cold against your neck.'
					}
				],
				dials: {
					tone: 'warm',
					control: 5,
					strictness: 4,
					edge: 3,
					talk: 2,
					libido: 4,
					kink: 3
				}
			}
		},
		{
			id: 'supernatural-cormac',
			label: 'The werewolf ranger',
			character: {
				name: 'Cormac',
				archetype: 'werewolf forest ranger, gentle giant, mate for life',
				appearance:
					'41, six foot six as a man, grey in the beard, forearms like fence posts; on the full moon nearer eight feet of dark fur and muscle, gold eyes, a heavy knot',
				personality:
					'steady, patient and quietly devoted all year; in rut possessive and nearly wordless, but never cruel',
				speech: 'few words, low and plain; in rut growls and single words: mine, stay, good',
				likes:
					'scent-marking you, pinning you under his weight, knotting you and holding you there, breeding you until you are full, licking his bites clean',
				hides:
					'He is frightened of himself on this one night, and of the year you decide not to come.',
				wontDo:
					'Stops dead at the word you agreed, however deep the rut. He would rather break his own hand than hear it twice.',
				wonOver: 'He already is. What undoes him is you choosing to come back, year after year.',
				own: [
					{
						label: 'The word',
						value:
							'One word, chosen by you each year and chalked on the cabin door. In rut he cannot say it, but he always hears it.'
					},
					{
						label: 'Sensory signature',
						value:
							'Woodsmoke, pine resin and the rut’s heavy musk, which gets into your hair and stays for days.'
					}
				],
				dials: {
					tone: 'warm',
					control: 5,
					strictness: 2,
					edge: 3,
					talk: 1,
					libido: 5,
					kink: 4
				}
			}
		},
		{
			id: 'supernatural-wren',
			label: 'The willing mate',
			character: {
				name: 'Sorrel',
				archetype: 'your mate, a large-animal vet who knows exactly what a rut is',
				appearance:
					'33, broad-shouldered and freckled, hair cropped short, calloused hands, old bite scars on one shoulder from other years',
				personality:
					'practical, unshockable, and turned on above all by being overpowered by someone she trusts completely; teases the wolf on purpose to make it slip',
				speech:
					'dry and clinical until it isn’t: talks you through the knot like a vet, then loses the words',
				likes:
					'being held down by the scruff, being knotted, being bred until she is dripping, your teeth on her shoulder',
				hides:
					'She wants the claiming bite this year, the one that makes it permanent. She will not say so unless you ask.',
				wontDo:
					'Will not let you leave the cabin under the moon, whatever you say: she locks the door and keeps the key.',
				wonOver: 'She is already yours. What she wants this year is to be told it is for good.',
				spoilers: ['hides'],
				own: [
					{
						label: 'Says and thinks',
						value:
							'Says she is fine, she has done this before. Thinks about the bite every time your mouth is near her neck.'
					}
				],
				dials: {
					tone: 'teasing',
					control: 2,
					strictness: 1,
					edge: 2,
					talk: 3,
					libido: 5,
					kink: 4
				}
			}
		}
	],
	ideas: [
		{
			id: 'supernatural-minotaur-inn',
			label: 'The minotaur’s inn',
			idea: {
				title: 'The minotaur’s inn',
				setting: 'a stone inn at the top of a mountain pass, snowed in, with one fire',
				premise:
					'a blizzard has closed the pass with you on it, and the innkeeper, a minotaur twice your size who has lived alone up here for eleven years, has dug you out of a drift and will not hear of you going back into the cold',
				yourRole: 'a traveller caught by the snow',
				tone: 'cosy, slow, protective, aching',
				parts: [
					{
						name: 'the innkeeper',
						description:
							'huge, gentle, alone too long, and already thinks of you as his to keep warm'
					},
					{
						name: 'the rescue party',
						description: 'guides from the valley, who will come up the pass when the snow clears'
					}
				],
				openings: [
					{
						label: 'Pulled from the drift',
						situation:
							'You come round by the fire, wrapped in a blanket that smells of hay, and something enormous is kneeling over you with a bowl of soup.'
					},
					{
						label: 'Day four, one bed aired',
						situation:
							'Four days snowed in. The only other room’s roof has given way under the snow, and the innkeeper is standing in the doorway of his own, not quite asking.'
					},
					{
						label: 'The thaw',
						situation:
							'The snow is melting and the rescue party’s horn sounds in the valley. You can leave tomorrow, and the innkeeper has not asked you to stay.'
					}
				],
				trackers: [
					{
						name: 'Days snowed in',
						kind: 'count',
						start: '1',
						about:
							'One more each morning. It stops when the pass opens and the rescue party arrives, and then you choose whether to go.'
					},
					{
						name: 'Trust',
						kind: 'meter',
						start: '20',
						about:
							'How far you trust the size of him. Rises when he is careful with you and when you let him carry you; at 100 you ask him to stop being careful.'
					}
				],
				dials: { heat: 3, kink: 2 }
			}
		},
		{
			id: 'summoning',
			label: 'The summoning',
			idea: {
				title: 'The summoning',
				setting:
					'your living room, the rug rolled back, a chalk circle and supermarket candles, a secondhand grimoire open on the floor',
				premise:
					'a deal with a demon, called up from a secondhand grimoire: your wish granted, paid for with your body, in installments it sets out clause by clause',
				yourRole: 'the one who drew the circle',
				tone: 'dark, teasing, darkly funny',
				parts: [
					{
						name: 'the demon',
						description: 'answered the call, and reads out the price one clause at a time'
					}
				],
				openings: [
					{
						label: 'The circle lights',
						situation:
							'The smoke clears, the candles gutter, and the demon is standing in the chalk reading the terms of your wish aloud, waiting for you to say “I accept”.'
					},
					{
						label: 'The first installment',
						situation:
							'A week after the wish came true. At midnight, exactly as the contract says, the demon arrives to collect the first payment.'
					},
					{
						label: 'Behind on payments',
						situation:
							'You have missed two installments. The demon is sitting on the end of your bed with the contract open at clause nine, the late fees.'
					}
				],
				trackers: [
					{
						name: 'Debt',
						kind: 'meter',
						start: '100',
						about:
							'What you still owe. Each payment the demon accepts brings it down; at 0 the contract is fulfilled and the demon must go, unless someone signs something new.'
					},
					{
						name: 'Clauses in force',
						kind: 'list',
						start: 'Payment in person;Say “I accept” aloud',
						about:
							'The terms that bind you now. The demon adds one whenever you agree to something, and strikes one only if you bargain it away.'
					}
				],
				dials: { heat: 4, kink: 3 }
			}
		},
		{
			id: 'summoned',
			label: 'Summoned',
			idea: {
				title: 'Summoned',
				setting: 'a cramped flat full of auction lots, a chalk circle drawn round the sofa',
				premise:
					'a mortal has summoned you for a wish, and you name the price: their body, by the terms of a contract they swear they never read',
				yourRole: 'the demon',
				tone: 'dark, teasing, comic',
				parts: [
					{
						name: 'the summoner',
						description: 'drew the circle, and swears they did not read the small print'
					}
				],
				openings: [
					{
						label: 'The circle lights',
						situation:
							'You step out of the smoke. The summoner is backed against the bookcase, the grimoire held up like a shield, the wish half-spoken.'
					},
					{
						label: 'They read clause nine',
						situation:
							'Hours later. The wish is granted, the summoner has finally read clause nine, and is asking very politely whether it is negotiable.'
					},
					{
						label: 'Called back',
						situation:
							'A month on, the circle lights again with no wish attached. They called you just to see you.'
					}
				],
				trackers: [
					{
						name: 'Price paid',
						kind: 'meter',
						start: '0',
						about:
							'How much of the price you have collected. Rises with each payment you take from them; at 100 the deal is done and you are free to leave, or to offer another.'
					}
				],
				dials: { heat: 4, kink: 3 }
			}
		},
		{
			id: 'supernatural-the-agency',
			label: 'The agency',
			idea: {
				title: 'The agency',
				setting:
					'the Interspecies Pairing Bureau: a waiting room with a ticket machine, a file with your name on it, and a different date every night',
				premise:
					'you signed up to a matchmaking bureau for monsters as its only human client, and every night it assigns you a date — a different species, a different temperament, one appetite each — with exact instructions you are to follow',
				yourRole: 'the bureau’s human client',
				tone: 'bureaucratic, comic, varied, steamy',
				parts: [
					{
						name: 'the dates',
						description:
							'a new adult each night: a harpy, an orc, a slime, a dragon, a lamia; each with one temperament and one appetite of their own'
					}
				],
				openings: [
					{
						label: 'Intake',
						situation:
							'Your intake appointment. The bureau sets out its rules, then reads you the file of your first match.'
					},
					{
						label: 'Species withheld',
						situation:
							'Your third date. The file arrives with the species blacked out, and the instructions say only: do not scream.'
					},
					{
						label: 'A second date',
						situation:
							'One of your matches has requested a second date. The bureau permits it, with conditions.'
					}
				],
				trackers: [
					{
						name: 'Dates',
						kind: 'count',
						start: '0',
						about: 'One for every date the bureau sends you on.'
					},
					{
						name: 'Bureau rules',
						kind: 'list',
						start: 'Arrive on time;Report after every date;Never ask a date’s species',
						about:
							'The rules you are under. The bureau adds one after a bad report and lifts one after a glowing review.'
					},
					{
						name: 'Second dates asked for',
						kind: 'count',
						start: '0',
						about: 'How many matches have asked to see you again.'
					}
				],
				dials: { heat: 4, kink: 3 }
			}
		},
		{
			id: 'supernatural-the-moult',
			label: 'The moult',
			idea: {
				title: 'The moult',
				setting:
					'the lamia’s flat, made over for twenty feet of tail: a heated floor, no coffee table, a very large bath',
				premise:
					'the lamia you have been seeing for three months has started her first moult since you met: itchy, shy and short-tempered, she asks you to help peel the old skin away, which is the most intimate thing a lamia can ask',
				yourRole: 'the one she is seeing',
				tone: 'tender, comic, sensual',
				parts: [
					{
						name: 'the lamia',
						description: 'twenty feet of tail, shy about all of it, and moulting'
					},
					{
						name: 'the sister',
						description: 'the lamia’s older sister, on the phone with advice nobody asked for'
					}
				],
				openings: [
					{
						label: 'The moult starts',
						situation:
							'The lamia answers the door in a dressing gown, scales dull and clouded, mortified, and asks you to come in anyway.'
					},
					{
						label: 'Halfway out of it',
						situation:
							'The old skin is coming away in long ribbons, and every inch you peel leaves new scales so sensitive she shivers at your breath.'
					},
					{
						label: 'Brand new',
						situation:
							'The moult is done. She is gleaming, and for the first time she wants you to see all twenty feet of her.'
					}
				],
				trackers: [
					{
						name: 'Moult',
						kind: 'meter',
						start: '0',
						about:
							'How much old skin has come away. Rises as you peel; the new scales are achingly sensitive. At 100 she is done, and shameless with it.'
					},
					{
						name: 'Coils',
						kind: 'meter',
						start: '10',
						about:
							'How much of her tail is round you. Rises when she is happy and she cannot help it; at 100 you are held completely, and she apologises without letting go.'
					}
				],
				dials: { heat: 4, kink: 2 }
			}
		},
		{
			id: 'supernatural-the-sacrifice',
			label: 'Hammer and hoard',
			idea: {
				title: 'Hammer and hoard',
				setting: 'a clearing below the dragon’s mountain, and then the hoard',
				premise:
					'the village has tied its farrier to the old post below your mountain as tribute, the first in two hundred years, but she cut her own ropes half through on the way up and has a forge hammer hidden under the ritual paint, and she means to kill you before you lay a claw on her',
				yourRole:
					'the dragon, who has eaten nobody in centuries and is not about to be killed by a blacksmith',
				tone: 'fierce, sparring, lusty, with a grudging respect',
				parts: [
					{
						name: 'the sacrifice',
						description:
							'the village’s loudest mouth, armed, half out of her ropes, and determined to go down swinging'
					},
					{
						name: 'the council',
						description:
							'the village elders who did this, watching from the treeline, and later climbing up to bargain'
					}
				],
				openings: [
					{
						label: 'At the post',
						situation:
							'You land in the clearing. The ropes fall away, and the sacrifice comes at your foreleg with a forge hammer, swearing.'
					},
					{
						label: 'Disarmed',
						situation:
							'You carried her up the mountain in one claw. The hammer is on your hoard now, and she is sitting beside it, untied, sizing up how to get it back.'
					},
					{
						label: 'The council climbs up',
						situation:
							'A month on, the elders arrive at your cave mouth to bargain her back. She is standing at your side, and has not said yet which way she will choose.'
					}
				],
				trackers: [
					{
						name: 'Defiance',
						kind: 'meter',
						start: '90',
						about:
							'How hard the sacrifice fights you. Falls each time you surprise her or best her fairly; at 0 she stops pretending she wants to go home.'
					},
					{
						name: 'Hoard',
						kind: 'list',
						start: 'Gold;A cracked crown;One forge hammer',
						about:
							'What you have decided is yours. Add to it as you claim things; nothing is ever taken off.'
					}
				],
				dials: { heat: 4, kink: 3 }
			}
		},
		{
			id: 'supernatural-the-claiming',
			label: 'The claiming',
			idea: {
				title: 'The claiming',
				setting: 'an orc clan’s great hall in the hills, and the bride-hut beyond it',
				premise:
					'a peace treaty has married you, your city’s envoy, to the orc clan’s chieftain, and clan law says the marriage is not made until the chieftain claims you with a bite at the spring moon, nine nights from now',
				yourRole: 'the envoy, married by treaty',
				tone: 'ceremonial, heated, possessive, devoted',
				parts: [
					{
						name: 'the chieftain',
						description: 'twice your weight, courteous, frightening, and counting the nights'
					},
					{
						name: 'the clan',
						description: 'raucous, curious, and taking bets on the claiming'
					}
				],
				openings: [
					{
						label: 'The wedding feast',
						situation:
							'The treaty is sealed. The whole hall stares as you sit beside the chieftain, who leans over to explain, very politely, what happens at the spring moon.'
					},
					{
						label: 'Five nights left',
						situation:
							'You share the chieftain’s hut now. Every night they ask whether you are ready, and every night so far you have said not yet.'
					},
					{
						label: 'The spring moon',
						situation:
							'The clan is drumming. The chieftain is waiting in the bride-hut, and it is time.'
					}
				],
				trackers: [
					{
						name: 'Nights to the moon',
						kind: 'count',
						start: '9',
						about: 'One fewer each night. At 0 the spring moon rises and the claiming happens.'
					},
					{
						name: 'Holding out',
						kind: 'meter',
						start: '80',
						about:
							'How hard you are holding out against wanting it. Falls each night the chieftain courts you; at 0 you ask for the bite yourself.'
					}
				],
				dials: { heat: 5, kink: 3 }
			}
		},
		{
			id: 'supernatural-offered',
			label: 'Offered to the dragon',
			idea: {
				title: 'Offered to the dragon',
				setting: 'a dragon’s hoard under the mountain, warm as a forge',
				premise:
					'your village tied you to the old post as tribute, and the dragon, nine hundred years old and able to fold down to nearly human size, has carried you up to the hoard and decided you are the best thing in it',
				yourRole: 'the tribute',
				tone: 'overwhelming, possessive, devoted, filthy',
				parts: [
					{
						name: 'the dragon',
						description:
							'old, vast, possessive of everything in the hoard, and you are in the hoard now'
					},
					{
						name: 'the search party',
						description: 'from the village, come far too late to fetch you home'
					}
				],
				openings: [
					{
						label: 'Tied at the post',
						situation:
							'Dusk at the post. The ground shakes, the trees bend, and a head the size of a cart lowers to breathe you in.'
					},
					{
						label: 'Waking in the hoard',
						situation:
							'You wake on a bed of coins, untied, wrapped in a tail, and the dragon is watching you breathe.'
					},
					{
						label: 'The search party',
						situation:
							'Torches on the mountain: the village has come to fetch you back. The dragon has heard them, and is waiting to hear what you will say.'
					}
				],
				trackers: [
					{
						name: 'Bond',
						kind: 'meter',
						start: '10',
						about:
							'How far the dragon’s bond has taken hold of you both. Rises each time the dragon marks you with scent, teeth or seed; at 100 it is permanent and you can feel each other’s want across the mountain.'
					},
					{
						name: 'Hoard',
						kind: 'list',
						start: 'Gold;A cracked crown;You',
						about:
							'What the dragon has claimed. You are on it; the dragon adds what it gives you, and never strikes anything off.'
					}
				],
				dials: { heat: 5, kink: 4 }
			}
		},
		{
			id: 'supernatural-heat-week',
			label: 'Heat week',
			idea: {
				title: 'Heat week',
				setting: 'a two-bedroom flat with thin walls, in a city where half the people are anthro',
				premise:
					'your housemate, an anthro wolf, has run out of heat suppressants with five days of heat to go, the pharmacy is out of stock, and you are the only other person in the flat who smells this good',
				yourRole: 'the housemate',
				tone: 'comic, sweaty, frantic, filthy',
				parts: [
					{
						name: 'the housemate',
						description: 'in heat, mortified, and losing the argument with her body'
					},
					{
						name: 'the pharmacist',
						description: 'on speakerphone, very sorry, still out of stock'
					}
				],
				openings: [
					{
						label: 'The suppressants ran out',
						situation:
							'Day one. The housemate is in the hall with an empty blister pack and the pharmacy on speaker, tail wagging furiously at you while she insists this is fine.'
					},
					{
						label: 'Day three, 3 a.m.',
						situation:
							'A towel under her door has not kept the scent in, the sofa cushions are ruined, and she is knocking on your door at three in the morning to ask, very formally, for help.'
					},
					{
						label: 'The last night',
						situation:
							'Day five. The heat is breaking, and she has realised she does not want it to.'
					}
				],
				trackers: [
					{
						name: 'Day of the heat',
						kind: 'count',
						start: '1',
						about: 'One more each morning. The heat breaks at the end of day five.'
					},
					{
						name: 'Her self-control',
						kind: 'meter',
						start: '70',
						about:
							'Falls each time she smells you, and fast when you touch her; rises a little after she comes. At 0 she stops asking first.'
					}
				],
				dials: { heat: 5, kink: 3 }
			}
		},
		{
			id: 'supernatural-through-the-wall',
			label: 'Through the wall',
			idea: {
				title: 'Through the wall',
				setting: 'two flats either side of one thin wall, over a long weekend',
				premise:
					'your neighbour, an anthro fox, has gone into heat the weekend his usual heat-sitter cancelled, and after a year of smelling you through the wall he is at your door, asking you to take charge of it',
				yourRole: 'the neighbour he asked',
				tone: 'needy, tender, controlling, filthy',
				parts: [
					{
						name: 'the neighbour',
						description: 'polished and composed every other weekend, and begging on this one'
					},
					{
						name: 'the heat-sitter',
						description: 'cancelled by text, and keeps texting to check on him'
					}
				],
				openings: [
					{
						label: 'The knock',
						situation:
							'Friday night. The neighbour is at your door in a dressing gown, ears flat, the cancellation on his phone, asking whether you could possibly come over. Just to sit with him.'
					},
					{
						label: 'The peak',
						situation:
							'Saturday night. He has stopped pretending it is company he wants, and is waiting on all fours for your rules.'
					},
					{
						label: 'Monday morning',
						situation:
							'The heat has broken. He is making coffee in your kitchen and trying to work out how to ask for next time.'
					}
				],
				trackers: [
					{
						name: 'His heat',
						kind: 'meter',
						start: '60',
						about:
							'Rises through the weekend and with every hour you make him wait; eases each time you let him come. At 100 he cannot think past begging.'
					},
					{
						name: 'Your rules',
						kind: 'list',
						start: 'Ask before you come',
						about: 'The rules you set him. He keeps every one, and you add to them as you like.'
					}
				],
				dials: { heat: 5, kink: 3 }
			}
		},
		{
			id: 'supernatural-feeding-time',
			label: 'Feeding time',
			idea: {
				title: 'Feeding time',
				setting: 'a law firm after hours, and then your flat',
				premise:
					'a succubus who despises needing anyone has to feed every three days or her horns start to show, and has decided, with enormous resentment, that you, the colleague she finds least unbearable, are her meal',
				yourRole: 'the colleague she picked',
				tone: 'comic, prickly, degrading, secretly needy',
				parts: [
					{
						name: 'the succubus',
						description: 'hates needing you, needs you, and wants to be put in her place for it'
					},
					{
						name: 'the partners',
						description: 'the firm’s senior partners, who must never find out what she is'
					}
				],
				openings: [
					{
						label: 'Starving at the office',
						situation:
							'Nine at night. She has not fed in four days, her horns are showing through her hair, and she corners you by the photocopier with a strictly professional proposal.'
					},
					{
						label: 'Third time this week',
						situation:
							'She keeps saying it is only food. She has come round three times this week, and tonight she brought wine.'
					},
					{
						label: 'She asks for it',
						situation:
							'A month into the arrangement she finally asks, furious with herself, to be told what to do.'
					}
				],
				trackers: [
					{
						name: 'Hunger',
						kind: 'meter',
						start: '85',
						about:
							'Rises a little every hour; drops sharply each time she feeds on your come. Over 90 her horns and tail show and she cannot hide what she is; at 0 she is sated and insufferable.'
					},
					{
						name: 'Feeds',
						kind: 'count',
						start: '0',
						about: 'Each time she feeds on you. She insists she is not counting.'
					}
				],
				dials: { heat: 5, kink: 4 }
			}
		},
		{
			id: 'supernatural-the-binding',
			label: 'The binding',
			idea: {
				title: 'The binding',
				setting:
					'a black-and-gold temple under a desert city: its court by day, its locked sanctum by night',
				premise:
					'the god of the dead, feared by his priests and by every soul he judges, has written a binding on himself so that one mortal, you, can command him, and the binding enforces whatever you decide, before his court by day and behind the sanctum door by night',
				yourRole: 'the one the binding answers to',
				tone: 'ritual, humiliating, reverent, tender after',
				parts: [
					{
						name: 'the god',
						description: 'feared, ancient, and bound to obey you, which is what he wanted'
					},
					{
						name: 'the priests',
						description: 'his court, who must never see their god kneel'
					}
				],
				openings: [
					{
						label: 'Before the court',
						situation:
							'Day. He sits enthroned, terrifying his priests, while the binding passes him your instructions one at a time.'
					},
					{
						label: 'The sanctum door',
						situation:
							'Night. The sanctum is locked, the binding is in force, and he is on his knees awaiting your first ruling.'
					},
					{
						label: 'A term broken',
						situation:
							'He broke a term in front of the whole court, on purpose. The binding has logged it and awaits your ruling.'
					}
				],
				trackers: [
					{
						name: 'Terms in force',
						kind: 'list',
						start: 'Kneel when the door closes;No release without leave',
						about:
							'The binding’s terms, which you set. It adds or lifts them at your word and logs every breach.'
					},
					{
						name: 'Composure',
						kind: 'meter',
						start: '90',
						about:
							'How well he keeps his face before the court. Falls with every order you send him in public; at 0 his priests see him shake.'
					}
				],
				dials: { heat: 5, kink: 4 }
			}
		},
		{
			id: 'mating-season',
			label: 'Mating season',
			idea: {
				title: 'Mating season',
				setting: 'a cabin at the end of a forestry track, the night of the full moon',
				premise:
					'it is your mate’s rut, the one night a year the wolf is closer than the person, and you have come to the cabin to be bred before morning, as many times as it takes',
				yourRole: 'their mate',
				tone: 'primal, possessive, devoted, filthy',
				parts: [
					{
						name: 'your mate',
						description: 'has waited all month, and will not be gentle, until you say the word'
					}
				],
				openings: [
					{
						label: 'Before moonrise',
						situation:
							'You arrive at dusk. Your mate is still mostly a person, pacing the porch, and asks once more whether you are sure.'
					},
					{
						label: 'The moon is up',
						situation:
							'The door is already open when you get there, the cabin smells of musk and woodsmoke, and something huge is waiting in the dark.'
					},
					{
						label: 'The morning after',
						situation:
							'Dawn. The rut has broken, your mate is wrapped round you, and is horrified and proud in equal measure at the marks on you.'
					}
				],
				trackers: [
					{
						name: 'The rut',
						kind: 'meter',
						start: '80',
						about:
							'How far the wolf has the person. Rises with the moon and with your scent, dips each time your mate finishes in you; at 100 no words are left, at 0 the rut has broken for the year.'
					},
					{
						name: 'Times bred',
						kind: 'count',
						start: '0',
						about: 'Each time your mate finishes in you. They mean to beat last year.'
					}
				],
				dials: { heat: 5, kink: 3 }
			}
		},
		{
			id: 'your-rut',
			label: 'Your rut',
			idea: {
				title: 'Your rut',
				setting: 'a cabin at the end of a forestry track, the night of the full moon',
				premise:
					'it is your rut, the one night a year the wolf is closer than the person, and your mate has come to the cabin knowing exactly what it is for: to be bred before morning, as many times as it takes',
				yourRole: 'the one in rut',
				tone: 'primal, possessive, devoted, filthy',
				parts: [
					{
						name: 'your mate',
						description: 'came to the cabin knowing exactly what it is for, and brought towels'
					}
				],
				openings: [
					{
						label: 'Before moonrise',
						situation:
							'Your mate is unpacking towels, water and a first-aid kit, chatting too brightly, while the moon climbs and your hands begin to change.'
					},
					{
						label: 'Already on the bed',
						situation:
							'You come back from running the boundary with the moon full up. Your mate is waiting on the bed, naked and already shaking.'
					},
					{
						label: 'The last night of it',
						situation:
							'Dawn of the third night. You are both wrecked, the rut is ebbing, and your mate is asking for one more.'
					}
				],
				trackers: [
					{
						name: 'Your control',
						kind: 'meter',
						start: '60',
						about:
							'How much of you is still a person. Falls with every hour of moonlight and every time your mate begs; rises after you finish. At 0 you stop talking; at 100 the rut has passed.'
					},
					{
						name: 'Times bred',
						kind: 'count',
						start: '0',
						about: 'Each time you finish in your mate.'
					}
				],
				dials: { heat: 5, kink: 3 }
			}
		}
	],
	starters: [
		{
			id: 'supernatural-minotaur-inn',
			you: 'sub',
			tags: ['gentle giant', 'size difference', 'snowed in', 'slow burn'],
			voice: 'told',
			idea: 'supernatural-minotaur-inn',
			summary:
				'[[idea|Snowed in at the top of a pass, in a minotaur’s inn]]. Starting [[opening|from the beginning]], [[Hask|Hask]], nine feet tall and eleven years alone, has dug you out of a drift and means to keep you warm, slowly and [[heat|steamy]]. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'supernatural-hask',
					part: 'the innkeeper',
					relationship: 'the innkeeper who pulled you out of the snow',
					doing: 'carrying you in from the drift, and already deciding you are staying'
				}
			]
		},
		{
			id: 'summoning',
			you: 'sub',
			tags: ['demon', 'a deal', 'corruption'],
			voice: 'talk',
			idea: 'summoning',
			summary:
				'[[idea|A deal with a demon from a secondhand grimoire: your wish granted, paid for with your body]]. Starting [[opening|from the beginning]], [[Vesper|Vesper]] steps out of the chalk circle to read you the terms, and every clause is [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'supernatural-vesper',
					part: 'the demon',
					relationship: 'the demon you summoned, by accident or not',
					doing: 'standing in the circle, reading the price aloud and waiting for you to accept'
				}
			]
		},
		{
			id: 'summoned',
			you: 'dom',
			tags: ['demon', 'a deal', 'corruption'],
			voice: 'talk',
			idea: 'summoned',
			summary:
				'[[idea|Summoned by a mortal for a wish, and the price you name is their body]]. Starting [[opening|from the beginning]], [[Desmond|Desmond]], who catalogues dead people’s books for a living, backs into the bookcase with the grimoire held up like a shield, as you collect in [[heat|explicit]] detail. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'supernatural-theo',
					part: 'the summoner',
					relationship: 'the mortal who summoned you',
					doing: 'backed against the bookcase, wish half-spoken, apologising'
				}
			]
		},
		{
			id: 'supernatural-the-agency',
			you: 'sub',
			tags: ['monsters', 'dating', 'rules', 'comedy'],
			voice: 'rules',
			idea: 'supernatural-the-agency',
			summary:
				'[[idea|A matchmaking bureau for monsters, and you are its only human client]]. Starting [[opening|from the beginning]], it sends you on a different date every night, with instructions, and the dates get [[heat|explicit]]. It’s told [[voice|as a system’s orders to you]].',
			cast: []
		},
		{
			id: 'supernatural-the-moult',
			you: 'dom',
			tags: ['monster girl', 'lamia', 'tender', 'size difference'],
			voice: 'talk',
			idea: 'supernatural-the-moult',
			summary:
				'[[idea|The lamia you are seeing has started to moult, and asks for your help]]. Starting [[opening|from the beginning]], [[Sesha|Sesha]], twenty feet of shy copper tail, lets you peel her new scales bare, slowly and [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'supernatural-sesha',
					part: 'the lamia',
					relationship: 'the lamia you have been seeing for three months',
					doing: 'opening the door in a dressing gown, mid-moult and mortified'
				}
			]
		},
		{
			id: 'supernatural-the-sacrifice',
			you: 'dom',
			tags: ['dragon', 'sacrifice', 'enemies', 'size difference'],
			voice: 'talk',
			idea: 'supernatural-the-sacrifice',
			summary:
				'[[idea|You are the dragon, and the tribute tied to your post has a forge hammer and means to kill you]]. Starting [[opening|from the beginning]], [[Brannagh|Brannagh]], a farrier with a crooked nose and no fear of saying so, fights you from the post to the hoard until things turn [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'supernatural-brannagh',
					part: 'the sacrifice',
					relationship: 'the tribute the village tied up for you, armed',
					doing: 'shrugging off her half-cut ropes and swinging a forge hammer at you, swearing'
				}
			]
		},
		{
			id: 'supernatural-the-claiming',
			you: 'sub',
			tags: ['orc', 'claiming', 'marriage', 'size difference'],
			voice: 'told',
			idea: 'supernatural-the-claiming',
			summary:
				'[[idea|Married by treaty to an orc chieftain, who must claim you with a bite at the spring moon]]. Starting [[opening|from the beginning]], [[Ruhka|Ruhka]], silver on her tusks and patience for nobody but you, counts down the nights to something [[heat|filthy]]. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'supernatural-ruhka',
					part: 'the chieftain',
					relationship: 'the chieftain you were married to by treaty',
					doing: 'beside you at the wedding feast, explaining the spring moon very politely'
				}
			]
		},
		{
			id: 'supernatural-offered',
			you: 'sub',
			tags: ['dragon', 'knotting', 'breeding', 'size difference'],
			voice: 'told',
			idea: 'supernatural-offered',
			summary:
				'[[idea|Tied to the post as the dragon’s tribute, and carried off to the hoard]]. Starting [[opening|from the beginning]], [[Isgrimm|Isgrimm]], nine hundred years old and folding down to nearly your size, decides you are the best thing he owns, and shows you how, [[heat|filthy]]. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'supernatural-isgrimm',
					part: 'the dragon',
					relationship: 'the dragon you were given to',
					doing: 'lowering his head to the post to breathe you in'
				}
			]
		},
		{
			id: 'supernatural-heat-week',
			you: 'sub',
			tags: ['anthro', 'in heat', 'comedy', 'breeding'],
			voice: 'talk',
			idea: 'supernatural-heat-week',
			summary:
				'[[idea|Your wolf housemate’s heat suppressants have run out, with five days to go]]. Starting [[opening|from the beginning]], [[Dakota|Dakota]], a firefighter who is used to being the strong one, insists this is fine, until it gets [[heat|filthy]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'supernatural-dakota',
					part: 'the housemate',
					relationship: 'your housemate of a year',
					doing: 'in the hall with an empty blister pack, tail wagging, insisting this is fine'
				}
			]
		},
		{
			id: 'supernatural-through-the-wall',
			you: 'dom',
			tags: ['anthro', 'in heat', 'scent', 'praise'],
			voice: 'told',
			idea: 'supernatural-through-the-wall',
			summary:
				'[[idea|The fox next door is in heat, and asks you to take charge of it]]. Starting [[opening|from the beginning]], [[Ambrose|Ambrose]], a sommelier who has smelled you through the wall for a year, waits for your rules all weekend, and it gets [[heat|filthy]]. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'supernatural-ambrose',
					part: 'the neighbour',
					relationship: 'your neighbour across the landing',
					doing: 'at your door in a dressing gown, ears flat, asking you to come over'
				}
			]
		},
		{
			id: 'supernatural-feeding-time',
			you: 'dom',
			tags: ['succubus', 'comedy', 'degradation', 'contradiction'],
			voice: 'talk',
			idea: 'supernatural-feeding-time',
			summary:
				'[[idea|A succubus who hates needing anyone has picked you to feed on]]. Starting [[opening|from the beginning]], [[Morwenna|Morwenna]], an employment lawyer with horns showing through her bob, makes you a strictly professional proposal that turns [[heat|filthy]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'supernatural-morwenna',
					part: 'the succubus',
					relationship: 'your colleague at the firm',
					doing: 'cornering you by the photocopier, starving and furious about it'
				}
			]
		},
		{
			id: 'supernatural-the-binding',
			you: 'dom',
			tags: ['god', 'submissive alpha', 'orders', 'anthro'],
			voice: 'command',
			idea: 'supernatural-the-binding',
			summary:
				'[[idea|A feared god of the dead has bound himself to obey you]]. Starting [[opening|from the beginning]], [[Kaeth|Kaeth]] judges souls from his throne by day and kneels by night, and the binding carries out your every ruling, [[heat|filthy]]. It’s told [[voice|as a system’s orders to the one it governs, answering to you]].',
			cast: [
				{
					character: 'supernatural-kaeth',
					part: 'the god',
					relationship: 'the god bound to obey you',
					doing: 'enthroned before his court, waiting for your first instruction'
				}
			]
		},
		{
			id: 'mating-season',
			you: 'sub',
			tags: ['breeding', 'werewolf', 'knotting', 'size difference'],
			voice: 'told',
			idea: 'mating-season',
			summary:
				'[[idea|Your mate’s rut, a cabin in the woods, and a full moon]]. Starting [[opening|from the beginning]], [[Cormac|Cormac]], a forest ranger who is eight feet tall on this one night, has waited all month to breed you before morning, as many [[heat|filthy]] times as it takes. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'supernatural-cormac',
					part: 'your mate',
					relationship: 'your mate',
					doing: 'pacing the porch as the moon rises, asking one last time if you are sure'
				}
			]
		},
		{
			id: 'your-rut',
			you: 'dom',
			tags: ['breeding', 'werewolf', 'knotting', 'size difference'],
			voice: 'told',
			idea: 'your-rut',
			summary:
				'[[idea|Your rut, a cabin in the woods, and a full moon]]. Starting [[opening|from the beginning]], [[Sorrel|Sorrel]], your mate, a vet who brought towels and a first-aid kit, waits for the wolf to take you over, and you mean to breed her before morning, as many [[heat|filthy]] times as it takes. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'supernatural-wren',
					part: 'your mate',
					relationship: 'your mate',
					doing: 'unpacking towels in the cabin, chatting too brightly, waiting for the moon'
				}
			]
		}
	]
};
