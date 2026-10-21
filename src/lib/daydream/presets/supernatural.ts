import type { PresetModule } from './types';

/** Demons, beasts and monsters. See `presets/index.ts`. */
export const SUPERNATURAL: PresetModule = {
	characters: [],
	ideas: [
		{
			id: 'summoning',
			label: 'The summoning',
			idea: {
				title: 'The summoning',
				setting: 'a summoning circle in candlelight',
				premise: 'a deal with a demon: your wish granted, paid for with your body',
				yourRole: 'the one who summoned it',
				tone: 'dark, teasing, steamy',
				notes: '',
				parts: [{ name: 'the demon', description: 'answered the call, and names the price' }],
				dials: { heat: 4, kink: 3 }
			}
		},
		{
			id: 'summoned',
			label: 'Summoned',
			idea: {
				title: 'Summoned',
				setting: 'a summoning circle in candlelight',
				premise: 'a mortal has summoned you for a wish, and you name the price: their body',
				yourRole: 'the demon',
				tone: 'dark, teasing, steamy',
				notes: '',
				parts: [
					{ name: 'the summoner', description: 'drew the circle, and did not read the small print' }
				],
				dials: { heat: 4, kink: 3 }
			}
		},
		{
			id: 'mating-season',
			label: 'Mating season',
			idea: {
				title: 'Mating season',
				setting: 'a cabin in the woods on the full moon',
				premise:
					'it is their rut, and they mean to breed you before morning, as many times as it takes',
				yourRole: 'their mate',
				tone: 'primal, possessive, filthy',
				notes: '',
				parts: [{ name: 'your mate', description: 'has waited all month, and will not be gentle' }],
				dials: { heat: 5, kink: 3 }
			}
		},
		{
			id: 'your-rut',
			label: 'Your rut',
			idea: {
				title: 'Your rut',
				setting: 'a cabin in the woods on the full moon',
				premise:
					'it is your rut, and you mean to breed your mate before morning, as many times as it takes',
				yourRole: 'the one in rut',
				tone: 'primal, possessive, filthy',
				notes: '',
				parts: [
					{ name: 'your mate', description: 'came to the cabin knowing exactly what it is for' }
				],
				dials: { heat: 5, kink: 3 }
			}
		}
	],
	starters: [
		{
			id: 'summoning',
			you: 'sub',
			tags: ['demon', 'corruption', 'a deal'],
			voice: 'talk',
			idea: 'summoning',
			summary:
				'[[idea|A deal with a demon: your wish granted, paid for with your body]]. [[Nyx|Nyx]] steps out of the candlelit circle to collect, and the price is [[heat|explicit]]. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'demon',
					part: 'the demon',
					relationship: 'the demon you summoned',
					doing: 'stepping out of the circle to collect'
				}
			]
		},
		{
			id: 'summoned',
			you: 'dom',
			tags: ['demon', 'corruption', 'a deal'],
			voice: 'talk',
			idea: 'summoned',
			summary:
				'[[idea|Summoned by a mortal for a wish, and the price you name is their body]]. [[Ellis|Ellis]] trembles at the edge of the candlelit circle, wish already spoken, as you collect in [[heat|explicit]] detail. It’s told [[voice|in the characters’ own words, with no narrator]].',
			cast: [
				{
					character: 'innocent',
					part: 'the summoner',
					relationship: 'the mortal who summoned you',
					doing: 'trembling at the edge of the circle, wish already spoken'
				}
			]
		},
		{
			id: 'mating-season',
			you: 'sub',
			tags: ['breeding', 'werewolf', 'primal', 'size difference'],
			voice: 'told',
			idea: 'mating-season',
			summary:
				'[[idea|Their rut, a cabin in the woods, and a full moon]]. [[Rhys|Rhys]], your mate, has waited all day to breed you before morning, as many [[heat|filthy]] times as it takes. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'beast',
					part: 'your mate',
					relationship: 'your mate',
					doing: 'in rut, and has been waiting for you all day'
				}
			]
		},
		{
			id: 'your-rut',
			you: 'dom',
			tags: ['breeding', 'werewolf', 'primal', 'size difference'],
			voice: 'told',
			idea: 'your-rut',
			summary:
				'[[idea|Your rut, a cabin in the woods, and a full moon]]. [[Remy|Remy]], your mate, waits on the bed, already shaking, and you mean to breed them before morning, as many [[heat|filthy]] times as it takes. It’s told [[voice|to you by a narrator]].',
			cast: [
				{
					character: 'eager-sub',
					part: 'your mate',
					relationship: 'your mate',
					doing: 'waiting for you on the bed, and already shaking'
				}
			]
		}
	]
};
