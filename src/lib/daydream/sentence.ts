/**
 * A daydream's setup as one sentence with blanks in it — "I want a [steamy]
 * story where I [talk with] [Vesper] in [The night train]." — which is the
 * short way the setup form shows a story that is already put together
 * (`DaydreamSetupForm.svelte`, its sentence layout). Each blank is a piece the
 * form makes into a control: the heat, the voice, each character and the
 * scene. The words around them change with the voice, so the sentence always
 * says how the story is told in plain terms.
 *
 * Pure and alias-free.
 */

import { type DaydreamSetup, type DialValue, voicePreset } from '../daydream';
import { SCENE_SLIDERS } from './dial-words';

export type SentencePiece =
	| { kind: 'text'; text: string }
	/** The scene's heat, as a word; `null` heat says "any kind of". */
	| { kind: 'heat'; label: string; heat: DialValue | null }
	/** How it is told, in the words of the sentence around it. */
	| { kind: 'voice'; label: string }
	/** A character, by their index in the setup's list. */
	| { kind: 'character'; index: number; name: string }
	| { kind: 'scene'; title: string };

/** Whether a word takes "an". */
const VOWEL = /^[aeiou]/i;

const text = (value: string): SentencePiece => ({ kind: 'text', text: value });

/** The heat word as the sentence uses it: "steamy", but "SFW" kept as it is. */
function heatWord(heat: DialValue): string {
	const label = SCENE_SLIDERS.find((slider) => slider.key === 'heat')?.scale[heat].label ?? '';
	return label === 'SFW' ? label : label.toLocaleLowerCase();
}

/** "Ash", "Ash and Bel", "Ash, Bel and Cy": each name a piece of its own. */
function cast(setup: Pick<DaydreamSetup, 'characters'>): SentencePiece[] {
	const names = setup.characters.map((character, index) => ({ character, index }));
	return names.flatMap(({ character, index }, at) => {
		const piece: SentencePiece = { kind: 'character', index, name: character.name };
		if (at === 0) {
			return [piece];
		}
		return [text(at === names.length - 1 ? ' and ' : ', '), piece];
	});
}

export function setupSentence(
	setup: Pick<DaydreamSetup, 'voice' | 'characters' | 'scene'>
): SentencePiece[] {
	const { heat } = setup.scene.dials;
	const opening: SentencePiece[] =
		heat === null
			? [text('I want '), { kind: 'heat', label: 'any kind of', heat }, text(' story')]
			: [
					text(VOWEL.test(heatWord(heat)) ? 'I want an ' : 'I want a '),
					{ kind: 'heat', label: heatWord(heat), heat },
					text(' story')
				];
	const scene: SentencePiece[] = [text(' in '), { kind: 'scene', title: setup.scene.title }];
	const people = cast(setup);
	const anyone = people.length > 0 ? people : [text('nobody yet')];
	const persona =
		setup.voice.stance === 'persona' && setup.voice.protagonistName.trim()
			? [text(`, as ${setup.voice.protagonistName.trim()}`)]
			: [];

	switch (voicePreset(setup.voice)?.id) {
		case 'talk':
			return [
				...opening,
				text(' where I '),
				{ kind: 'voice', label: 'talk with' },
				text(' '),
				...anyone,
				...scene,
				text('.')
			];
		case 'told':
			return [
				...opening,
				text(' '),
				{ kind: 'voice', label: 'told to me' },
				...scene,
				...(people.length > 0 ? [text(', with '), ...people] : []),
				text('.')
			];
		case 'watch':
			return [
				...opening,
				text(' where I '),
				{ kind: 'voice', label: 'watch' },
				text(' '),
				...anyone,
				...scene,
				text('.')
			];
		case 'rules':
			return [
				...opening,
				text(' where '),
				{ kind: 'voice', label: 'a system gives me orders' },
				...scene,
				...(people.length > 0 ? [text(', enforced by '), ...people] : []),
				text('.')
			];
		default:
			// A voice no preset gives (a persona, a narrator about them with the
			// user in it): named rather than phrased, since there is no one
			// natural way to say every combination.
			return [
				...opening,
				text(', '),
				{ kind: 'voice', label: 'told my own way' },
				...persona,
				...(people.length > 0 ? [text(', with '), ...people] : []),
				...scene,
				text('.')
			];
	}
}

/**
 * The quieter lines under the sentence: who each character is in this
 * story, as "Vesper: the stranger, a stranger on the train". Their part's
 * name first, then who they are to the user; just the name when neither is
 * written.
 */
export function castNotes(setup: Pick<DaydreamSetup, 'characters' | 'scene'>): string[] {
	return setup.characters.map((character) => {
		const part = setup.scene.parts.find((candidate) => candidate.id === character.casting.partId);
		const about = [part?.name, character.casting.relationship.trim()].filter(Boolean).join(', ');
		return about ? `${character.name}: ${about}` : character.name;
	});
}
