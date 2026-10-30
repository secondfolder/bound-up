import { describe, expect, it } from 'vitest';
import { describeTurn, historyPassage, passageMessages } from './passage';

describe('describeTurn', () => {
	it('says what the user wrote, chose and filled in, skipped fields included', () => {
		const said = describeTurn({
			kind: 'words',
			text: 'I sign.',
			choices: [{ id: 'wear', value: 'nothing' }],
			fields: [
				{ block: 'terms', name: 'c1', value: 'initialled' },
				{ block: 'terms', name: 'c2', value: '' }
			]
		});
		expect(said).toContain('<user>\nI sign.\n</user>');
		expect(said).toContain('wear = "nothing"');
		expect(said).toContain('The user filled in terms: c1: "initialled"; c2: skipped');
	});

	it('is Continue only when nothing was chosen or filled in', () => {
		expect(describeTurn({ kind: 'continue' })).toContain('pressed Continue');
		expect(describeTurn({ kind: 'continue' })).toContain(
			'not necessarily their character staying silent'
		);
		const filled = describeTurn({
			kind: 'continue',
			fields: [{ block: 'b', name: 'f', value: 'signed' }]
		});
		expect(filled).not.toContain('pressed Continue');
		expect(filled).toContain('f: "signed"');
	});
});

describe('history', () => {
	it('unwraps tags the daydream did not enable, keeping their words', () => {
		const source =
			'<say who="a">"Hm."</say> <sound who="a">sighs</sound> <set a.x="+1">still</set>.\n<after>\n{"next":"n"}\n</after>';
		const kept = historyPassage(source, new Set(['say']));
		expect(kept).toContain('<say who="a">"Hm."</say> sighs still.');
		expect(kept).not.toContain('<sound');
		expect(kept).toContain('{"next":"n"}');
	});

	it('sends earlier passages with only the enabled tags', () => {
		const messages = passageMessages({
			setup: {
				heat: 'steamy',
				telling: '',
				capabilities: ['reveals'],
				elements: [],
				presentation: { view: 'scroll', notes: '' },
				musts: [],
				research: ''
			},
			limits: [],
			preferences: [],
			history: [{ passage: '<more>x</more> <sound>hums</sound>', turn: { kind: 'continue' } }],
			repeated: []
		});
		const past = messages.find((message) => message.role === 'assistant')?.content ?? '';
		expect(past).toBe('<more>x</more> hums');
	});

	it('asks how words were read, says a reading the user chose, and keeps both in history', () => {
		expect(describeTurn({ kind: 'words', text: 'Make it slower', readAs: 'direction' })).toMatch(
			/^The user chose how this is meant: a direction/
		);
		expect(describeTurn({ kind: 'words', text: '(can we skip ahead?)' })).toContain(
			'out of character, to you'
		);
		expect(describeTurn({ kind: 'words', text: 'I wait.' })).not.toContain('chose how');
		expect(
			historyPassage('<reading as="instruction"/><yours>I tell her.</yours>She nods.', new Set())
		).toBe('<reading as="instruction"/><yours>I tell her.</yours>She nods.');
	});

	it('keeps what changes as the story goes after the history, so the opening stays the same', () => {
		const element = (composure: number) => ({
			id: 'you',
			type: 'you',
			name: 'You',
			also: [],
			shown: true,
			fields: [],
			stats: [
				{ name: 'composure', kind: 'meter' as const, value: composure, max: 100, description: '' }
			]
		});
		const ask = (composure: number, preferences: string[]) =>
			passageMessages({
				setup: {
					heat: 'steamy',
					telling: 'Reports.',
					capabilities: ['stats'],
					elements: [element(composure)],
					presentation: { view: 'scroll', notes: '' },
					musts: [],
					research: ''
				},
				limits: [],
				preferences,
				history: [
					{ passage: 'One.', turn: { kind: 'continue' } },
					{ passage: 'Two.', turn: { kind: 'continue' } }
				],
				repeated: []
			});
		const before = ask(30, []);
		const after = ask(45, ['Usually: slower']);
		// Everything but the last message is the same: the cache serves all of it.
		expect(after.slice(0, -1)).toEqual(before.slice(0, -1));
		expect(after.at(-1)?.content).toContain('value="45"');
		expect(after.at(-1)?.content).toContain('slower');
		expect(before[0]?.content).not.toContain('<elements>');
	});

	it('sends the writing style with the setup, and lists the others to change to', () => {
		const [system] = passageMessages({
			setup: {
				heat: 'explicit',
				telling: 'Reports.',
				style: { preset: 'filthy', notes: 'Lots of dirty talk.', by: 'user' },
				capabilities: [],
				elements: [],
				presentation: { view: 'scroll', notes: '' },
				musts: [],
				research: ''
			},
			limits: [],
			preferences: [],
			history: [{ passage: 'One.', turn: { kind: 'continue' } }],
			repeated: []
		});
		expect(system?.content).toMatch(
			/<writing-style>\nWrite like two people sexting[\s\S]*For this daydream: Lots of dirty talk\.\nThe user chose this style\.\n<\/writing-style>/
		);
		expect(system?.content).toContain('- dark (Dark and heavy)');
		expect(system?.content).toContain('Never change a style the user chose unless they ask');
	});
});
