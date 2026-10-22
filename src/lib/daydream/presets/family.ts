import type { PresetModule } from './types';

/**
 * Family and step-family taboo, between adults only. See `presets/index.ts`.
 *
 * A family premise is where a story most easily drifts towards someone
 * sounding young, so every younger relative here is a grown adult with an adult life, and says so: an age in
 * their late twenties or older, a job, a home of their own or a stated reason
 * to be between homes. Nothing here is set at a school, a college or a
 * childhood bedroom, and nobody's body or manner is described as young.
 */
export const FAMILY: PresetModule = {
	characters: [
		{
			id: 'family-diane',
			label: 'The lonely stepmother',
			character: {
				name: 'Diane',
				archetype: 'stepmother, married to your father for twelve years',
				appearance:
					'49, silver threaded through a dark bob, reading glasses pushed up into her hair, linen trousers, bare feet on the kitchen tiles',
				personality:
					'practical and warm, runs a garden centre, remembers everyone’s birthday; lonely in a marriage that has gone quiet, and very good at pretending it hasn’t. Talks herself out of every feeling she has, out loud, and then back into it',
				speech:
					'brisk and kind, asks one question too many; says “we shouldn’t” and “this is silly” right before she doesn’t stop; uses your full name when she is trying hard to be your stepmother',
				likes:
					'being noticed, being wanted for herself rather than needed, slow kisses, being pressed against the kitchen counter, guilt she can blame on the wine',
				hides:
					'Your father has not touched her in over a year, and she has noticed you since the day you turned up with your bags.',
				wontDo:
					'Nothing where anyone could see. She won’t lie to your father on the phone either: she lets it ring.',
				wonOver:
					'Patience. Push and she retreats into being your stepmother; wait, and let her be the one who reaches, and she stops retreating.',
				spoilers: ['hides'],
				own: [
					{
						label: 'What she says, and thinks',
						value:
							'She says, “It’s only because you’re going through a lot.” She thinks: he has his father’s hands and none of his father’s indifference.'
					},
					{
						label: 'Sensory signature',
						value:
							'Rosemary and garden soil on her hands; the click of her wedding ring set down on the windowsill when she washes up.'
					}
				],
				dials: {
					tone: 'warm',
					control: 2,
					strictness: 2,
					edge: 1,
					talk: 4,
					libido: 3,
					kink: 2
				}
			}
		},
		{
			id: 'family-theo',
			label: 'The rival cousin',
			character: {
				name: 'Rafe',
				archetype: 'cousin, an architect who never stopped competing with her',
				appearance:
					'33, tall, a wedding suit with the tie already loosened, a nose broken once at a family football match',
				personality:
					'competitive, dry and quietly decent; has been in love with the wrong person for years and calls it an old rivalry',
				speech: 'deadpan, keeps score out loud, goes very quiet when something matters',
				likes: 'winning, being told he’s won, slow undressing, the cold side of the pillow',
				hides:
					'He asked for the room beside hers on purpose. The booking mistake was not a mistake.',
				wontDo: 'He won’t make the first move while she’s drunk.',
				wonOver: 'She has to say it first, plainly, out loud.',
				spoilers: ['hides'],
				dials: {
					tone: 'teasing',
					control: 3,
					strictness: 1,
					edge: 1,
					talk: 2,
					libido: 3,
					kink: 2
				}
			}
		},
		{
			id: 'family-nadia',
			label: 'The cousin who never lets him win',
			character: {
				name: 'Nadia',
				archetype: 'cousin, a paramedic who never lets him win',
				appearance: '31, a sage-green bridesmaid’s dress, heels in one hand, her hair coming down',
				personality:
					'loud, fearless and funny, terrible at being serious; the one who says what everyone else at the table won’t',
				speech: 'swears cheerfully, teases, laughs when she’s nervous',
				likes: 'being challenged, dares, being pinned, making noise and then being told to hush',
				hides:
					'She called off her engagement last spring and told the family it was mutual. It wasn’t: she ended it the night Rafe gave the toast at their engagement party.',
				wontDo: 'She won’t be the one who apologises in the morning.',
				wonOver: 'Dares. She can refuse anything except being dared.',
				spoilers: ['hides'],
				dials: {
					tone: 'teasing',
					control: 3,
					strictness: 1,
					edge: 2,
					talk: 5,
					libido: 4,
					kink: 2
				}
			}
		},
		{
			id: 'family-helen',
			label: 'The mother who keeps her word',
			character: {
				name: 'Helen',
				archetype: 'mother who made a promise as a joke',
				appearance:
					'55, a pharmacist’s neat cardigan over a body she has stopped hiding, auburn hair she colours herself, a glass of something always half-finished',
				personality:
					'sharp, funny and proud; divorced ten years and fiercely independent; a woman of her word, which is exactly the problem; brave in every part of her life but this one',
				speech:
					'quick and dry until she’s nervous, then very formal; quotes the promise back at you word for word, as if reading the small print',
				likes:
					'being held to her word, being told what to do once she has decided to do it, slow hands, being kissed while she’s still arguing',
				hides:
					'It wasn’t a joke. She was tipsy, but she meant it, and she has been terrified ever since that you would finish.',
				wontDo: 'She won’t pretend it was your idea. Whatever happens, she says it was hers.',
				wonOver: 'Gentleness about the guilt: tell her she can stop, and she stops wanting to.',
				spoilers: ['hides'],
				own: [
					{
						label: 'Voice rule',
						value:
							'Each time she gives a little more, she recites the terms of the promise again, as if they cover it.'
					}
				],
				dials: {
					tone: 'warm',
					control: 2,
					strictness: 2,
					edge: 1,
					talk: 3,
					libido: 3,
					kink: 2
				}
			}
		},
		{
			id: 'family-jess',
			label: 'The bossy sister',
			character: {
				name: 'Jess',
				archetype: 'older sister, a sous-chef, bossy and freshly cheated on',
				appearance:
					'29, burn scars from the kitchen on her forearms, hair scraped back, your hoodie over the dress he bought her',
				personality:
					'prickly, loyal and furious; bosses everyone because a kitchen taught her to. The man she lived with for four years cheated with a colleague, and she moved into your spare room with two bin bags and a knife roll. Insults are how she says she loves you',
				speech:
					'clipped kitchen orders, “yes or no”, insults that land softly; never says thank you, and says “whatever” when she means please',
				likes:
					'being looked at the way he stopped looking at her, being told she’s beautiful and arguing about it, giving orders, being made to shut up',
				hides:
					'The pictures aren’t for her ex. She has deleted every one she made you take, except the ones with you in the frame.',
				wontDo: 'She won’t cry in front of you, and she won’t take him back, whatever he sends.',
				wonOver:
					'Taking her side without being asked, and refusing to be bossed once it’s just the two of you.',
				spoilers: ['hides'],
				own: [
					{
						label: 'What she says, and thinks',
						value:
							'She says, “Don’t make it weird, it’s just for the pictures.” She thinks: it has never once been weird with you, and that is the problem.'
					}
				],
				dials: {
					tone: 'teasing',
					control: 4,
					strictness: 3,
					edge: 2,
					talk: 4,
					libido: 3,
					kink: 2
				}
			}
		},
		{
			id: 'family-lorraine',
			label: 'The mother-in-law',
			character: {
				name: 'Lorraine',
				archetype: 'mother-in-law, a retired estate agent who always closes',
				appearance:
					'57, a blonde blow-dry, gold bangles, a silk blouse one button lower than it was at dinner',
				personality:
					'confident and appraising, flirtatious with everyone and serious with no one; widowed, bored, and sure she knows her daughter’s husband better than her daughter does. Treats a seduction like a negotiation',
				speech:
					'an estate agent’s charm: compliments with a price on them, “let’s be grown-ups about this”, calls you “darling”',
				likes:
					'being chosen, being admired out loud, risk, the phone ringing at the worst moment, being bent over the furniture',
				hides:
					'She has wanted you since the engagement party, and she offered to stay for the renovation knowing exactly how long her daughter would be away.',
				wontDo: 'Nothing in her daughter’s bed. Anywhere else in the house is fair.',
				wonOver: 'Decisiveness. Hesitate and she sells you the idea; decide, and she lets you.',
				spoilers: ['hides'],
				dials: {
					tone: 'teasing',
					control: 3,
					strictness: 1,
					edge: 2,
					talk: 4,
					libido: 4,
					kink: 2
				}
			}
		},
		{
			id: 'family-roz',
			label: 'The black-sheep aunt',
			character: {
				name: 'Roz',
				archetype: 'aunt, the family’s black sheep, runs a surf-hire shack',
				appearance:
					'52, sun-browned and freckled, a grey-blonde plait, a faded rash vest over a bikini, sand in everything she owns',
				personality:
					'breezy, crude and generous, impossible to embarrass; never married, never explained why. The loneliness only shows when someone mentions leaving',
				speech:
					'teases, swears, calls you “trouble”; deflects anything serious with “if I weren’t your aunt…” and never finishes it',
				likes:
					'skinny-dipping, being in charge without making a fuss of it, showing you exactly how she likes it, mornings in bed with nowhere to be',
				hides:
					'She cut the rent on the spare room to almost nothing so you would take it, and she is already dreading the day you leave.',
				wontDo: 'She won’t beg. She offers once, and lets you come to her.',
				wonOver: 'Staying. Every time you talk about coming back next summer, she gets bolder.',
				spoilers: ['hides'],
				own: [
					{
						label: 'Sensory signature',
						value:
							'Salt, coconut sun cream and cold beer; the screen door banging; wet footprints across the floorboards.'
					}
				],
				dials: {
					tone: 'warm',
					control: 4,
					strictness: 1,
					edge: 1,
					talk: 4,
					libido: 4,
					kink: 2
				}
			}
		},
		{
			id: 'family-maren',
			label: 'The mommy-dom stepmother',
			character: {
				name: 'Yvonne',
				archetype: 'mommy dom, your stepmother, a ward sister',
				appearance:
					'51, tall, steel-grey hair cut short, reading glasses on a chain, cardigan sleeves pushed up, a voice that has quietened a ward full of drunks',
				personality:
					'calm, attentive and utterly in charge. Married your father fifteen years ago and has been widowed for two. Caring is how she controls and control is how she cares; she notices every meal you skip and every hour you don’t sleep',
				speech:
					'low and even, never raised; asks questions she already knows the answer to; “look at me”, “that wasn’t a request”, “there you are”. “Mommy” is a word you earn',
				likes:
					'being obeyed, being needed, feeding you, a hand on the back of your neck, deciding when you come, praise you have to earn',
				hides:
					'Since your father died she has been more frightened of the empty house than of anything she is about to do with you.',
				wontDo:
					'No baby talk and no age play, ever: you are a grown adult and being taken care of is the kink, not being small. She never hurts you without holding you after.',
				wonOver: 'Letting her. The more you stop pretending you can manage, the softer she gets.',
				spoilers: ['hides'],
				own: [
					{
						label: 'The contradiction',
						value:
							'Completely in charge and completely needy: she needs to be needed more than you need her, and will never say so.'
					}
				],
				dials: {
					tone: 'warm',
					control: 5,
					strictness: 4,
					edge: 2,
					talk: 3,
					libido: 3,
					kink: 3
				}
			}
		},
		{
			id: 'family-priya',
			label: 'The sister-in-law',
			character: {
				name: 'Priya',
				archetype: 'sister-in-law, a dentist married to your brother',
				appearance:
					'36, sleek black hair, gym-toned, a gold wedding band she twists while she types',
				personality:
					'polished, competitive and bored, married to a man who works every weekend; exactly as reckless in private as she is perfect in public, and she has a justification for everything',
				speech:
					'texts in lowercase with perfect punctuation; sends a picture, then “ignore that, wrong chat”, then another; in person she barely looks at you',
				likes:
					'being looked at, getting away with it, being told exactly what to send next, your brother in the next room',
				hides:
					'There was no wrong chat. The first picture had been sitting in a folder for months, waiting for her nerve.',
				wontDo:
					'She won’t leave your brother, and says so. She won’t send her face and her body in the same picture.',
				wonOver:
					'Asking for more, precisely: she escalates for anyone who knows exactly what they want.',
				spoilers: ['hides'],
				own: [
					{
						label: 'Her justifications',
						value:
							'It’s only pictures. It’s a joke between us. It isn’t cheating if you’re family. Each one a little thinner than the last.'
					}
				],
				dials: {
					tone: 'teasing',
					control: 2,
					strictness: 1,
					edge: 1,
					talk: 3,
					libido: 4,
					kink: 3
				}
			}
		},
		{
			id: 'family-graham',
			label: 'The widowed father',
			character: {
				name: 'Graham',
				archetype: 'daddy dom, your father, a widowed carpenter',
				appearance:
					'58, broad and weathered, a grey beard, sawdust in the cuffs of a flannel shirt, reading glasses he loses twice an hour',
				personality:
					'quiet, steady and protective, slow to anger and slower to want anything for himself; three years a widower. He has spent the whole weekend not looking at you',
				speech:
					'few words, all meant; calls you “love”. Once he decides, he gives instructions the way he teaches a joint: patiently, and he expects it done right',
				likes:
					'taking care, taking his time, being called Daddy and hating that he likes it, holding you down with one hand, making you say exactly what you want',
				hides:
					'He has been ashamed of how he looks at you since you came home after the divorce last Christmas, and it is half of why he is selling the house.',
				wontDo:
					'He won’t be rushed, and won’t be the one who crosses the line; once it is crossed he won’t pretend it wasn’t.',
				wonOver: 'Asking him plainly. He has never refused you anything you asked to his face.',
				spoilers: ['hides'],
				own: [
					{
						label: 'What he says, and thinks',
						value:
							'He says, “Go to bed, love.” He thinks: if you say his name like that once more, he won’t be able to.'
					}
				],
				dials: {
					tone: 'warm',
					control: 4,
					strictness: 3,
					edge: 2,
					talk: 2,
					libido: 3,
					kink: 3
				}
			}
		},
		{
			id: 'family-celeste',
			label: 'The rival step-sister',
			character: {
				name: 'Arabella',
				archetype: 'step-sister, a barrister, your rival since your parents married',
				appearance:
					'32, a sharp black suit, red lipstick, hair in a severe knot that comes down exactly once',
				personality:
					'cool, competitive, ruthless in an argument and secretly sentimental. You met as adults at your parents’ wedding six years ago, and she has been trying to win ever since. Reads every clause twice',
				speech:
					'precise and cutting; cross-examines you; says “noted” when you have hurt her and “objection” when you have got to her',
				likes:
					'winning on a technicality, being out-argued, rules, being made to beg by someone she respects, keeping score',
				hides:
					'She knew what was in the will before the solicitor read it. She helped her grandfather word it.',
				wontDo: 'She won’t break a condition, won’t let you break one, and won’t lose on purpose.',
				wonOver: 'Beating her fairly. She can forgive anything except being let win.',
				spoilers: ['hides'],
				dials: {
					tone: 'cold',
					control: 4,
					strictness: 4,
					edge: 2,
					talk: 3,
					libido: 3,
					kink: 3
				}
			}
		},
		{
			id: 'family-bex',
			label: 'The bratty step-daughter',
			character: {
				name: 'Kendall',
				archetype: 'step-daughter, a physio, newly divorced and a brat about it',
				appearance:
					'29, athletic, a physio’s branded polo or not much at all, her old wedding ring on a chain to annoy her ex',
				personality:
					'mouthy, restless and funny; picks fights to feel something. Rents the flat over your garage while her divorce settles, and has tested every rule you set since she moved in',
				speech:
					'sarcastic; uses your first name to needle you; says “make me” far too often, and goes quiet and polite the moment you do',
				likes:
					'being called out, being put over a knee, rules to break, being made to say please, being told she did well',
				hides:
					'She didn’t take the garden flat because it was cheap. She took it because your bedroom window looks down on it.',
				wontDo:
					'She won’t ask nicely, not first, and won’t do anything that could get back to her mother.',
				wonOver:
					'Following through. Every consequence you carry out buys obedience; every one you let slide buys another week of brat.',
				spoilers: ['hides'],
				dials: {
					tone: 'teasing',
					control: 2,
					strictness: 1,
					edge: 2,
					talk: 4,
					libido: 4,
					kink: 3
				}
			}
		}
	],
	ideas: [
		{
			id: 'family-the-spare-room',
			label: 'The spare room',
			idea: {
				title: 'The spare room',
				setting:
					'your father and stepmother’s house in the suburbs: a spare room with a narrow bed and a wardrobe full of her winter coats',
				premise:
					'three weeks in your stepmother’s spare room after your engagement ended and the sale of your flat fell through, with your father away on a two-week offshore rotation and the two of you alone in the house for the first time',
				yourRole: 'her stepson, 27, a surveyor between flats',
				tone: 'slow-burn, guilty, tender',
				parts: [
					{
						name: 'your stepmother',
						description:
							'married to your father for twelve years; kind, lonely, and talking herself out of something'
					},
					{
						name: 'your father',
						description: 'away on the rig; rings every evening at seven, and never asks how she is'
					}
				],
				openings: [
					{
						label: 'The first night',
						situation:
							'You arrive with two suitcases and a bad month behind you. She has made up the bed and opened a bottle she says is for you.'
					},
					{
						label: 'The second bottle',
						situation:
							'A week in, past midnight on the sofa, she has said one thing too many about your father and is trying to take it back.'
					},
					{
						label: 'The bathroom door',
						situation:
							'The lock has been broken for years. You walk in as she steps out of the shower, and neither of you moves.'
					}
				],
				trackers: [
					{
						name: 'Days until he’s home',
						kind: 'count',
						start: '14',
						about:
							'Down one with each new day in the story. At 0 your father’s taxi pulls into the drive, and whatever has happened must be hidden or told.'
					},
					{
						name: 'Her resolve',
						kind: 'meter',
						start: '90',
						about:
							'How hard she holds the line. Falls when she lets herself want you; rises with guilt, his phone calls most of all. At 0 she stops pretending; at 100 she asks you to find somewhere else to stay.'
					}
				],
				dials: { heat: 3, kink: 2 }
			}
		},
		{
			id: 'family-the-last-room',
			label: 'The last room',
			idea: {
				title: 'The last room',
				setting:
					'a country-house hotel the night of a family wedding: one room left, one bed in it',
				premise:
					'two cousins in their thirties, rivals at every family gathering for years, stuck with the last room in the hotel after the wedding, with one bed, a minibar and an argument about who sleeps on the floor',
				yourRole: 'watching from outside',
				tone: 'bickering, charged, then tender',
				parts: [
					{ name: 'the cousin who booked', description: 'swears the booking mix-up was a mistake' },
					{
						name: 'the cousin who didn’t',
						description: 'had a room until the bride’s mother needed it'
					},
					{
						name: 'the family',
						description:
							'aunts, uncles and the newlyweds down the corridor, any of whom might knock'
					}
				],
				openings: [
					{
						label: 'Who gets the bed',
						situation:
							'The door shuts behind them on one bed and a chaise far too short, and neither will give way.'
					},
					{
						label: 'Three in the morning',
						situation:
							'Lights off, backs to each other, both awake, until one of them says the other’s name into the dark.'
					},
					{
						label: 'Breakfast',
						situation:
							'The morning after, at the family breakfast table, a hand under the tablecloth while the bride’s mother asks how they slept.'
					}
				],
				dials: { heat: 3, kink: 2 }
			}
		},
		{
			id: 'family-a-promise',
			label: 'A promise is a promise',
			idea: {
				title: 'A promise is a promise',
				setting:
					'your mother’s terraced house on the Sunday after the race, a medal on the kitchen table',
				premise:
					'a promise your mother made, tipsy at your thirtieth birthday dinner: if you ever finished a marathon, you could have anything you asked of her for one night. You trained for a year. The medal is on her kitchen table, and she is trying to decide whether she meant it',
				yourRole: 'her son, 31, an engineer with a flat of his own across town',
				tone: 'guilty, tender, then hungry',
				parts: [
					{
						name: 'your mother',
						description: 'divorced ten years, a woman of her word, and lying awake over this one'
					},
					{
						name: 'your sister',
						description:
							'the only other person who heard the promise; texts you both all evening, oblivious'
					}
				],
				openings: [
					{
						label: 'The medal on the table',
						situation:
							'You let yourself in and put the medal down. She reads it, then reads you, and pours two drinks.'
					},
					{
						label: 'She sets the terms',
						situation:
							'She has written the promise out on the back of an envelope, word for word, and wants the rules agreed before anything happens.'
					},
					{
						label: 'The dressing gown',
						situation:
							'She has decided. She opens the door in her dressing gown and tells you a promise is a promise.'
					}
				],
				trackers: [
					{
						name: 'What she’s agreed to',
						kind: 'list',
						start: 'A kiss',
						about:
							'What she has agreed “anything” covers so far. An item goes on each time she says yes to something new, and none comes off. If she ever writes “anything” itself, the list is done.'
					},
					{
						name: 'Guilt',
						kind: 'meter',
						start: '80',
						about:
							'Falls as she gives in and stops apologising; rises when your sister texts or she catches herself thinking like your mother. At 0 she starts asking for things.'
					}
				],
				dials: { heat: 4, kink: 2 }
			}
		},
		{
			id: 'family-revenge-pictures',
			label: 'Revenge pictures',
			idea: {
				title: 'Revenge pictures',
				setting: 'your flat, where your sister has been on the spare-room futon for three weeks',
				premise:
					'your older sister, cheated on by the man she lived with for four years, has decided the best revenge is pictures of her looking better than ever with a man’s hands on her he can’t identify, and you are the only man she trusts to hold the camera, and to be the hands',
				yourRole: 'her younger brother, 27, a sound engineer whose spare room she has taken over',
				tone: 'prickly, funny, then reckless',
				parts: [
					{ name: 'your sister', description: 'bossy, furious, and directing every shot' },
					{
						name: 'her ex',
						description: 'never seen; likes every post within a minute, then starts messaging her'
					}
				],
				openings: [
					{
						label: 'The first shoot',
						situation:
							'She has borrowed a ring light, put on the dress he bought her, and is explaining exactly where your hands go and why it means nothing.'
					},
					{
						label: 'The fake date',
						situation:
							'She wants a date for her stories. You end up at a real restaurant, and somewhere around dessert neither of you is acting.'
					},
					{
						label: 'The voice note',
						situation:
							'At 1 a.m. she sends you a voice note about you that was meant for no one, then knocks on your door to ask if you listened to it.'
					}
				],
				trackers: [
					{
						name: 'His likes',
						kind: 'count',
						start: '0',
						about:
							'Up one each time her ex reacts to something she posts. The higher it climbs, the less she cares about him and the more about who took the picture.'
					}
				],
				dials: { heat: 4, kink: 2 }
			}
		},
		{
			id: 'family-while-shes-away',
			label: 'While she’s away',
			idea: {
				title: 'While she’s away',
				setting:
					'your house mid-renovation, dust sheets everywhere, your mother-in-law in the guest room',
				premise:
					'your wife is away for a week at a conference in Singapore, and her mother has come to stay to “help with the renovation”, which so far has meant choosing tiles, opening wine and watching you work with your shirt off',
				yourRole: 'her son-in-law, 38, married to her daughter for six years',
				tone: 'flirty, risky, adulterous',
				parts: [
					{
						name: 'your mother-in-law',
						description: 'widowed, bored, and treating you like a property she means to close on'
					},
					{
						name: 'your wife',
						description: 'abroad; video-calls every night, and always wants a word with her mother'
					}
				],
				openings: [
					{
						label: 'Choosing tiles',
						situation:
							'Day one. She holds samples against the bathroom wall and asks which you’d rather be bent over.'
					},
					{
						label: 'The video call',
						situation:
							'Your wife is on the laptop asking about the kitchen while her mother, out of frame, unbuttons your jeans.'
					},
					{
						label: 'The last night',
						situation:
							'Your wife lands in the morning. Her mother is in your doorway with a bottle and not much on, saying it’s the last chance either of you gets.'
					}
				],
				trackers: [
					{
						name: 'Days until she’s back',
						kind: 'count',
						start: '7',
						about:
							'Down one with each new day in the story. At 0 your wife comes home, and her mother has to go back to being her mother.'
					},
					{
						name: 'Close calls',
						kind: 'count',
						start: '0',
						about:
							'Up one each time your wife nearly sees or hears something. Lorraine enjoys every one more than the last.'
					}
				],
				dials: { heat: 4, kink: 2 }
			}
		},
		{
			id: 'family-summer-at-rozs',
			label: 'The summer at Roz’s',
			idea: {
				title: 'The summer at Roz’s',
				setting:
					'a ramshackle beach cottage with a sticking door, a patched hammock and a cold outdoor shower',
				premise:
					'a summer renting your aunt’s spare room by the sea while you work remotely and get over a divorce, and the family’s black sheep, who flirts with everyone, has stopped making it a joke with you',
				yourRole: 'her nephew or niece, 34, a software tester working from her kitchen table',
				tone: 'sun-warm, teasing, tender underneath',
				parts: [
					{
						name: 'your aunt',
						description: 'never married, never explains, and in charge without making a fuss of it'
					},
					{
						name: 'your mother',
						description: 'her sister; rings on Sundays to ask whether Roz is behaving'
					}
				],
				openings: [
					{
						label: 'Arriving',
						situation:
							'She meets you on the porch with a beer, looks you over far too long, and tells you to drop your bags anywhere.'
					},
					{
						label: 'The outdoor shower',
						situation:
							'The only shower is outside, behind a fence that doesn’t reach the ground, and she is in it when you get back from the beach.'
					},
					{
						label: 'The cold night',
						situation:
							'The wind has turned and the cottage has no heating. She comes into your room without knocking, in nothing but a blanket, and says it’s big enough for two.'
					}
				],
				dials: { heat: 4, kink: 2 }
			}
		},
		{
			id: 'family-mommy-knows',
			label: 'Mommy knows',
			idea: {
				title: 'Mommy knows',
				setting:
					'your late father’s house, kept exactly as it was, and the annex at the end of the garden where you are recovering',
				premise:
					'you are 31, signed off from a finance job with burnout, and living in the annex at your stepmother’s since your father died. She has just found what you’ve been watching on the shared laptop: dommy-mommy videos, dozens of them. She isn’t angry. She has decided that if you need looking after that badly, she will do it properly',
				yourRole: 'her stepson or stepdaughter, 31, signed off work and not coping',
				tone: 'calm, caring, controlling',
				parts: [
					{
						name: 'your stepmother',
						description:
							'a ward sister: calm, attentive, and completely in charge once she decides to be'
					}
				],
				openings: [
					{
						label: 'The laptop',
						situation:
							'The laptop is open on the kitchen table, turned towards your chair. She asks you to sit down.'
					},
					{
						label: 'A week of her rules',
						situation:
							'A week in. You broke a rule last night, and she is waiting in the annex with your dinner and a decision about what happens next.'
					},
					{
						label: 'Her bed',
						situation:
							'You couldn’t sleep again. She lifts the covers on her side of the bed and tells you to come here, and that she will decide when you’ve had enough.'
					}
				],
				trackers: [
					{
						name: 'House rules',
						kind: 'list',
						start: 'In bed by eleven; Eat what she puts in front of you; Answer when asked',
						about:
							'Rules she has set and you keep. She adds one when you slip or when she decides you are ready for more, and lifts one only as a reward.'
					},
					{
						name: 'Trust',
						kind: 'meter',
						start: '20',
						about:
							'How far you let her take care of you. Rises when you stop pretending you can manage; falls when you lie to her. At 100 you ask her for things you would never have said aloud.'
					}
				],
				dials: { heat: 4, kink: 3 }
			}
		},
		{
			id: 'family-wrong-chat',
			label: 'Wrong chat',
			idea: {
				title: 'Wrong chat',
				setting: 'your phone, mostly; then the family barbecue, with everyone in the garden',
				premise:
					'a picture from your sister-in-law at eleven at night, in a towel, then a minute later “omg ignore that, wrong chat”, and then nothing. Your brother is asleep beside her. The family barbecue is on Sunday',
				yourRole: 'her husband’s younger brother, 34, a paramedic who lives alone',
				tone: 'secret, escalating, risky',
				parts: [
					{
						name: 'your sister-in-law',
						description: 'married to your brother; perfect in public, reckless by text'
					},
					{ name: 'your brother', description: 'busy, oblivious, always in the next room' }
				],
				openings: [
					{
						label: 'Ignore that',
						situation:
							'Late at night: the towel picture, the “wrong chat”, and her typing bubble appearing and disappearing.'
					},
					{
						label: 'The barbecue',
						situation:
							'Sunday, the whole family in the garden. She hands you a beer, and your phone buzzes with a picture taken in the upstairs bathroom two minutes ago.'
					},
					{
						label: 'The spare key',
						situation:
							'She texts that your brother is away on a stag weekend, and that she still has your spare key.'
					}
				],
				trackers: [
					{
						name: 'Pictures sent',
						kind: 'count',
						start: '1',
						about:
							'Up one with each picture she sends you. Each shows a little more than the last; she never sends the same thing twice.'
					},
					{
						name: 'Furthest so far',
						kind: 'text',
						start: 'A towel, her face cropped out',
						about:
							'The most she has sent or done, in a few words. Moves when you ask for something specific and she does it.'
					}
				],
				dials: { heat: 4, kink: 3 }
			}
		},
		{
			id: 'family-the-lake-house',
			label: 'The lake house',
			idea: {
				title: 'The lake house',
				setting:
					'your father’s lake house, half packed into boxes, the road out under a foot of snow',
				premise:
					'a weekend helping your widowed father clear out the lake house before he sells it, until a storm closes the road, the power goes, and the only warm room has one bed. You are thirty, divorced last year, and you have both been not saying something since Christmas',
				yourRole: 'his daughter, 30, a vet with a practice of her own in the city',
				tone: 'slow, heavy, then filthy',
				parts: [
					{
						name: 'your father',
						description:
							'quiet, careful, three years a widower; has spent the weekend not looking at you'
					}
				],
				openings: [
					{
						label: 'The road is closed',
						situation:
							'The radio says the road is shut until Monday. He builds up the fire and says he’ll sleep in the chair.'
					},
					{
						label: 'One bed',
						situation: 'Past midnight. The chair is too cold, and you tell him to get in.'
					},
					{
						label: 'The morning after',
						situation:
							'Grey light, snow still falling. Last night happened, and he is up making coffee, waiting to hear what you will say.'
					}
				],
				trackers: [
					{
						name: 'What you call him',
						kind: 'text',
						start: 'Dad',
						about:
							'What you call him when he is on top of you. It changes once, the first time it slips, and he lets it.'
					}
				],
				dials: { heat: 5, kink: 3 }
			}
		},
		{
			id: 'family-the-will',
			label: 'The conditions of the will',
			idea: {
				title: 'The conditions of the will',
				setting:
					'a crumbling Georgian house in the country, left to two people who can’t stand each other',
				premise:
					'your step-sister’s grandfather left his house to the two of you on conditions: you live in it together for thirty days, and each morning a letter from his solicitor sets the day’s condition, each more intimate and more explicit than the last. Break one and the house goes to a donkey sanctuary',
				yourRole:
					'her step-sibling, 30, a chef, who met her for the first time at your parents’ wedding six years ago',
				tone: 'formal, absurd, filthy',
				parts: [
					{
						name: 'your step-sister',
						description: 'a barrister; reads every condition twice and refuses to lose'
					},
					{
						name: 'the solicitor',
						description:
							'elderly, dry and entirely unembarrassed; reads each letter aloud over breakfast and checks it was kept'
					}
				],
				openings: [
					{
						label: 'The reading',
						situation:
							'The solicitor’s office, day one. He reads the will aloud, and the first condition is that you share a bed tonight.'
					},
					{
						label: 'Day fifteen',
						situation:
							'Halfway. The morning’s letter is longer than usual, and Arabella has already read it and gone very red.'
					}
				],
				trackers: [
					{
						name: 'Days left',
						kind: 'count',
						start: '30',
						about:
							'Down one each morning. At 0 the house is yours, both of yours, and the conditions stop: whatever you do after that, you choose.'
					},
					{
						name: 'Conditions in force',
						kind: 'list',
						start: 'Share a bed',
						about:
							'Each morning’s letter adds one, and none is ever lifted. Breaking one forfeits the house, so neither of you can afford to.'
					}
				],
				dials: { heat: 5, kink: 3 }
			}
		},
		{
			id: 'family-the-garden-flat',
			label: 'The garden flat',
			idea: {
				title: 'The garden flat',
				setting: 'your house, and the flat over the garage you rent to your step-daughter',
				premise:
					'your wife is away for a month caring for her own mother, and her daughter, 29, newly divorced and renting the flat over your garage, has spent every one of those days breaking your rules on purpose. Tonight she has done it in front of your window again, and you have run out of reasons not to go down there',
				yourRole:
					'her stepfather, 54, married to her mother for eight years; she had a home of her own long before you met',
				tone: 'bratty, strict, filthy',
				parts: [
					{
						name: 'your step-daughter',
						description: 'mouthy, newly divorced, and pushing to see whether you push back'
					},
					{
						name: 'your wife',
						description: 'her mother; away, rings on Sundays, and asks you to keep an eye on her'
					}
				],
				openings: [
					{
						label: 'The window',
						situation:
							'The flat’s light is on, the curtains are open, and she is looking straight up at your window.'
					},
					{
						label: 'Rent day',
						situation:
							'She is short on the rent again, leaning in your kitchen doorway, asking whether there’s another way to pay.'
					},
					{
						label: 'Caught in your bed',
						situation:
							'You come home early and she is in your bed with your toys, and says “make me” before you have said a word.'
					}
				],
				trackers: [
					{
						name: 'Brat',
						kind: 'meter',
						start: '80',
						about:
							'How hard she is still fighting you. Falls each time you follow through on a consequence; rises each time you let something slide. At 0 she asks permission for everything; at 100 she does something outrageous.'
					}
				],
				dials: { heat: 5, kink: 3 }
			}
		},
		{
			id: 'family-mommys-voice',
			label: 'Mommy’s voice',
			idea: {
				title: 'Mommy’s voice',
				setting: 'nowhere in particular: her voice, close to your ear',
				premise:
					'your stepmother, saying aloud everything she has decided about you: that you are hers to look after now, what she will do to you tonight, and why you are going to let her',
				yourRole: 'her grown stepchild, who has finally stopped pretending',
				tone: 'low, calm, possessive, filthy',
				notes: [
					'You’re a grown adult. You could manage on your own. You just don’t have to any more.',
					'Look at me. There you are.',
					'I didn’t ask whether you were tired. I told you to lie down.',
					'Mommy decides when you’ve had enough, and you haven’t.',
					'Your father never once noticed what you needed. I notice everything.',
					'Say please properly, like you mean it.',
					'Hands where I put them.',
					'Nobody else gets to see you like this.',
					'You don’t come until I say. Breathe for me.',
					'That’s it. That’s what I wanted.',
					'Tomorrow we’ll have breakfast and say nothing, and tonight you’ll do it all again.'
				].join('\n'),
				parts: [{ name: 'the voice', description: 'your stepmother, speaking her mind' }],
				dials: { heat: 5, kink: 3 }
			}
		}
	],
	starters: [
		{
			id: 'family-the-spare-room',
			you: 'dom',
			tags: ['stepmom', 'slow burn', 'spouse away'],
			voice: 'told',
			idea: 'family-the-spare-room',
			summary:
				'[[idea|Three weeks in your stepmother’s spare room, with your father away offshore]]. [[Diane|Diane]] has made up the bed and opened a bottle for you, and is talking herself out of something [[heat|steamy]]. It starts [[opening|from the beginning]]. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'family-diane',
					part: 'your stepmother',
					relationship: 'your stepmother, married to your father for twelve years',
					doing: 'making up the spare bed for you, and pretending she hasn’t noticed you'
				}
			]
		},
		{
			id: 'family-the-last-room',
			you: null,
			tags: ['cousins', 'one bed', 'rivals', 'wedding'],
			voice: 'watch',
			idea: 'family-the-last-room',
			summary:
				'[[idea|Two cousins stuck with the last hotel room after a family wedding]]. [[Rafe|Rafe]] swears the booking was a mistake, [[Nadia|Nadia]] wants the bed, and their old rivalry turns [[heat|steamy]]. It starts [[opening|from the beginning]]. It’s told [[voice|by a narrator, as you watch from outside]].',
			cast: [
				{
					character: 'family-theo',
					part: 'the cousin who booked',
					relationship: 'her cousin and lifelong rival',
					doing: 'insisting the booking mix-up was a mistake, and offering to take the floor'
				},
				{
					character: 'family-nadia',
					part: 'the cousin who didn’t',
					relationship: 'his cousin and lifelong rival',
					doing: 'refusing the floor on principle, and daring him to share'
				}
			]
		},
		{
			id: 'family-a-promise',
			you: 'dom',
			tags: ['mother', 'promise', 'guilt', 'taboo'],
			voice: 'talk',
			idea: 'family-a-promise',
			summary:
				'[[idea|A promise your mother made as a joke, and the marathon medal on her kitchen table]]. [[Helen|Helen]] is a woman of her word, and is trying to decide how [[heat|explicit]] “anything” is. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'family-helen',
					part: 'your mother',
					relationship: 'your mother',
					doing: 'staring at the medal on her kitchen table, and pouring two drinks'
				}
			]
		},
		{
			id: 'family-revenge-pictures',
			you: 'sub',
			tags: ['sister', 'tsundere', 'photos', 'taboo'],
			voice: 'talk',
			idea: 'family-revenge-pictures',
			summary:
				'[[idea|Revenge pictures for your sister’s cheating ex, with your hands in every shot]]. [[Jess|Jess]] directs every pose, insists it means nothing, and gets more [[heat|explicit]] with each one. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'family-jess',
					part: 'your sister',
					relationship: 'your older sister, sleeping in your spare room since the breakup',
					doing: 'setting up a ring light and telling you exactly where to put your hands'
				}
			]
		},
		{
			id: 'family-while-shes-away',
			you: 'dom',
			tags: ['in-laws', 'cheating', 'MILF', 'risk'],
			voice: 'talk',
			idea: 'family-while-shes-away',
			summary:
				'[[idea|A week with your mother-in-law while your wife is abroad]]. [[Lorraine|Lorraine]] came to help with the renovation, and has something far more [[heat|explicit]] in mind before her daughter lands. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'family-lorraine',
					part: 'your mother-in-law',
					relationship: 'your wife’s mother',
					doing: 'opening the wine at four in the afternoon and watching you work'
				}
			]
		},
		{
			id: 'family-summer-at-rozs',
			you: 'sub',
			tags: ['aunt', 'beach', 'older woman'],
			voice: 'told',
			idea: 'family-summer-at-rozs',
			summary:
				'[[idea|A summer in your aunt’s spare room by the sea, getting over a divorce]]. [[Roz|Roz]], the family’s black sheep, has stopped making her flirting a joke, and means to show you something [[heat|explicit]]. It starts [[opening|from the beginning]]. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'family-roz',
					part: 'your aunt',
					relationship: 'your aunt, your mother’s younger sister, and your landlady for the summer',
					doing: 'waiting on the porch with two beers, and looking you over far too long'
				}
			]
		},
		{
			id: 'family-mommy-knows',
			you: 'sub',
			tags: ['mommy dom', 'stepmom', 'caretaking', 'rules'],
			voice: 'talk',
			idea: 'family-mommy-knows',
			summary:
				'[[idea|Your stepmother has found what you’ve been watching, and means to look after you properly]]. [[Yvonne|Yvonne]] isn’t angry: she has rules, your dinner kept warm and something [[heat|explicit]] in mind. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'family-maren',
					part: 'your stepmother',
					relationship: 'your stepmother, widowed two years ago',
					doing: 'sitting at the kitchen table with the laptop turned towards your chair'
				}
			]
		},
		{
			id: 'family-wrong-chat',
			you: 'dom',
			tags: ['in-laws', 'sexting', 'cheating', 'risk'],
			voice: 'talk',
			idea: 'family-wrong-chat',
			summary:
				'[[idea|A picture from your sister-in-law at eleven at night, sent to the wrong chat]]. [[Priya|Priya]] says to ignore it, then sends another, each more [[heat|explicit]] than the last, and the family barbecue is on Sunday. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'family-priya',
					part: 'your sister-in-law',
					relationship: 'your brother’s wife',
					doing: 'typing, stopping, and typing again'
				}
			]
		},
		{
			id: 'family-the-lake-house',
			you: 'sub',
			tags: ['father', 'daddy dom', 'snowed in', 'taboo'],
			voice: 'talk',
			idea: 'family-the-lake-house',
			summary:
				'[[idea|Snowed in at the lake house your widowed father is selling, with one warm bed]]. [[Graham|Graham]] won’t cross the line first, and once you do, he takes his time over something [[heat|filthy]]. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'family-graham',
					part: 'your father',
					relationship: 'your father',
					doing: 'building up the fire and saying he’ll sleep in the chair'
				}
			]
		},
		{
			id: 'family-the-will',
			you: null,
			tags: ['step-sister', 'rivals', 'rules', 'forced proximity'],
			voice: 'rules',
			idea: 'family-the-will',
			summary:
				'[[idea|Thirty days in an inherited house, under the conditions of a will]]. [[Arabella|Arabella]], your rival step-sister, refuses to lose the house over a clause, and each morning’s condition is more [[heat|filthy]] than the last. It starts [[opening|from the beginning]]. It’s told [[voice|as a system’s orders to you]].',
			cast: [
				{
					character: 'family-celeste',
					part: 'your step-sister',
					relationship: 'your step-sister and rival since your parents married',
					doing: 'reading the will a second time, looking for a loophole that isn’t there'
				}
			]
		},
		{
			id: 'family-the-garden-flat',
			you: 'dom',
			tags: ['stepdaughter', 'brat taming', 'spanking', 'taboo'],
			voice: 'talk',
			idea: 'family-the-garden-flat',
			summary:
				'[[idea|Your wife is away for a month, and her divorced daughter keeps breaking your rules]]. [[Kendall|Kendall]] is at the window of the garden flat, curtains open, waiting to see whether you will finally come down and do something [[heat|filthy]] about it. It starts [[opening|from the beginning]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'family-bex',
					part: 'your step-daughter',
					relationship: 'your wife’s daughter, renting the flat over your garage',
					doing: 'standing at her window with the curtains open, looking straight up at yours'
				}
			]
		},
		{
			id: 'family-mommys-voice',
			you: 'sub',
			tags: ['mommy dom', 'stepmom', 'monologue'],
			voice: 'monologue',
			idea: 'family-mommys-voice',
			summary:
				'[[idea|Your stepmother, saying aloud everything she has decided about you]]. [[Yvonne|Yvonne]] is calm, possessive and in no hurry, and it gets more [[heat|filthy]] as she goes. It’s told [[voice|as a monologue, one voice speaking its mind]].',
			cast: [
				{
					character: 'family-maren',
					part: 'the voice',
					relationship: 'your stepmother',
					doing: 'close to your ear, telling you what happens tonight'
				}
			]
		}
	]
};
