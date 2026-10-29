import { describe, expect, it } from 'vitest';
import type { DreamElement } from './elements';
import { alignWords, type SpeechRun, utterances, wordAt } from './speech';
import { voiceFor, voiceForSpeaker } from './voices';

const run = (text: string, extra: Partial<SpeechRun> = {}): SpeechRun => ({
	text,
	who: null,
	how: '',
	tone: null,
	sound: false,
	...extra
});

describe('utterances', () => {
	it('never puts two speakers in one, and keeps where each is in the text', () => {
		const runs = [
			run('The door shuts. '),
			run('Sit down.', { who: 'ines', how: 'low, amused' }),
			run(' You sit.')
		];
		const said = utterances(runs);
		expect(said.map((entry) => [entry.who, entry.spoken])).toEqual([
			[null, 'The door shuts.'],
			['ines', '[low, amused] Sit down.'],
			[null, 'You sit.']
		]);
		const text = runs.map((entry) => entry.text).join('');
		expect(text.slice(said[1]?.from, said[1]?.to)).toBe('Sit down.');
	});

	it('voices a sound and the tone tags as cues, never as words', () => {
		const said = utterances([
			run('sighs', { who: 'ines', sound: true }),
			run('Closer.', { who: 'ines', tone: 'whisper' }),
			run('One. Two.', { tone: 'slow' })
		]);
		expect(said.map((entry) => entry.spoken)).toEqual([
			'[sighs] [whispering] Closer.',
			'[slowly] One. [break] Two. [break]'
		]);
	});

	it('gathers short sentences, and ends one at a block’s edge', () => {
		const said = utterances([
			run('One. Two. Three.'),
			run('\n'),
			run('A heading'),
			run('\n'),
			run(`${'A long sentence that goes on. '.repeat(8)}`)
		]);
		expect(said[0]?.spoken.startsWith('One. Two. Three. A heading. A long sentence')).toBe(true);
		expect(said.every((entry) => entry.spoken.length <= 300)).toBe(true);
		expect(said).toHaveLength(2);
	});

	it('drops square brackets from the text and the cues, so nothing becomes a cue by accident', () => {
		const [said] = utterances([run('A [note] here.', { how: '[loud]' })]);
		expect(said?.spoken).toBe('[loud] A note here.');
	});
});

describe('alignWords', () => {
	const visible = 'Come closer, I want to tell you 3 things.';
	const words = [
		{ text: 'Come', start: 0, end: 0.3 },
		{ text: 'closer', start: 0.3, end: 0.9 },
		{ text: 'I', start: 1.2, end: 1.3 },
		{ text: 'want', start: 1.3, end: 1.5 },
		{ text: 'to', start: 1.5, end: 1.6 },
		{ text: 'tell', start: 1.6, end: 1.8 },
		{ text: 'you', start: 1.8, end: 1.9 },
		{ text: 'three', start: 1.9, end: 2.1 },
		{ text: 'things', start: 2.1, end: 2.5 }
	];

	it('places each word it can find, and skips one it cannot rather than guessing', () => {
		const placed = alignWords(visible, words);
		expect(placed.map((word) => visible.slice(word.from, word.to))).toEqual([
			'Come',
			'closer',
			'I',
			'want',
			'to',
			'tell',
			'you',
			'things'
		]);
		expect(visible.slice(wordAt(placed, 2.0)?.from, wordAt(placed, 2.0)?.to)).toBe('you');
		expect(wordAt(placed, -1)).toBeNull();
	});

	it('matches across curly and straight apostrophes', () => {
		const placed = alignWords('I can’t.', [{ text: "can't", start: 0, end: 1 }]);
		expect(placed).toHaveLength(1);
	});
});

describe('voices', () => {
	const character = (id: string, voice: string): DreamElement => ({
		id,
		type: 'character',
		name: id,
		also: [],
		shown: true,
		fields: [{ name: 'voice', text: voice, shown: true }],
		stats: []
	});

	it('matches a voice of the gender described, the same each time', () => {
		const ines = character('ines', 'low and unhurried, an older woman, composed');
		const first = voiceFor(ines, 'dream-1', 'breathy');
		expect(voiceFor(ines, 'dream-1', 'breathy')).toBe(first);
		expect(['smoky', 'drawl', 'velvet', 'fatale', 'tender', 'storyteller']).toContain(first);
		const marc = character('marc', 'a deep, commanding man');
		expect(['commanding', 'steady', 'low', 'rough']).toContain(voiceFor(marc, 'dream-1', null));
	});

	it('leaves the narrator’s voice to the narration', () => {
		const soft = character('ana', 'soft, breathy, intimate, a young woman');
		for (const dream of ['a', 'b', 'c', 'd', 'e', 'f']) {
			expect(voiceFor(soft, dream, 'breathy')).not.toBe('breathy');
		}
	});

	it('reads the narration and the user’s own lines in the narrator’s voice', () => {
		expect(voiceForSpeaker(null, [], 'd', null)).toBe('narrator');
		expect(voiceForSpeaker('you', [], 'd', null)).toBe('narrator');
		expect(voiceForSpeaker('nobody', [], 'd', null)).toBe('narrator');
	});
});
