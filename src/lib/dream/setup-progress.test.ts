import { describe, expect, it } from 'vitest';
import type { DreamSetup } from '../sealed-kinds/dreams';
import { type ProgressInput, setupProgress } from './setup-progress';

const reading: NonNullable<DreamSetup['reading']> = {
	musts: ['reports'],
	research: { needed: false, text: '' },
	spread: { n: 2, reason: '' },
	directions: [
		{ id: 'd1', p: 0.5, text: 'Weekly reports.' },
		{ id: 'd2', p: 0.5, text: 'A night watch.' }
	],
	pick: { by: 'code', reason: '' },
	ask: null,
	answer: null
};

const setup = (fields: Partial<DreamSetup> = {}): DreamSetup => ({
	brief: 'a training dynamic',
	amendments: [],
	reading: null,
	chosen: null,
	build: null,
	preferences: [],
	...fields
});

const steps = (fields: Partial<ProgressInput>) =>
	setupProgress({ setup: setup(), live: null, research: 'self', ...fields }).map(
		(step) =>
			`${step.label}: ${step.status}${step.current && step.status === 'done' ? ' (current)' : ''}`
	);

describe('setupProgress', () => {
	it('shows each request as a step, in the order taken, with what is still to come', () => {
		expect(steps({ live: { id: 'r1', kind: 'read' } })).toEqual([
			'Analysing what you asked for: active',
			'Picking one: waiting',
			'Building it and writing the opening: waiting'
		]);
	});

	it('puts a research model’s request first, as a step of its own, with its lookups under it', () => {
		const brief = 'research obedience captions';
		const live = setupProgress({
			setup: setup({ brief }),
			live: { id: 'x', kind: 'research' },
			lookups: [{ type: 'search', query: 'captions', ok: true }],
			research: 'model'
		});
		expect(live[0]).toMatchObject({ kind: 'research', status: 'active' });
		expect(live[0]?.lookups).toHaveLength(1);
		expect(live[1]).toMatchObject({ kind: 'read', status: 'waiting' });
		// A story model with tools looks things up inside its reading: no step of its own.
		expect(steps({ setup: setup({ brief }), research: 'self' })[0]).toBe(
			'Analysing what you asked for: waiting'
		);
	});

	it('adds a step for doing a thing again, and only the latest shows its results', () => {
		const trail = [
			{ id: 'a', kind: 'read' as const },
			{ id: 'b', kind: 'pick' as const, by: 'code' as const },
			{ id: 'c', kind: 'build' as const },
			{ id: 'd', kind: 'pick' as const, by: 'user' as const },
			{ id: 'e', kind: 'build' as const }
		];
		const chosen = { directionId: 'd2', by: 'user' as const, nudges: [], seed: 1 };
		const build = {
			title: 'T',
			heat: 'steamy' as const,
			telling: '',
			presentation: { view: 'scroll' as const, notes: '' },
			capabilities: [],
			elements: []
		};
		expect(steps({ setup: setup({ reading, chosen, build, trail }) })).toEqual([
			'Analysing what you asked for: done (current)',
			'Picked one: done',
			'Building it and writing the opening: done',
			'You chose an idea: done (current)',
			'Building it again: done (current)'
		]);
	});

	it('waits on the user for a question and for choosing an idea', () => {
		const asked = setup({
			reading: { ...reading, ask: { id: 'q', text: 'Who?', options: [], keep: 'story' } },
			trail: [{ id: 'a', kind: 'read' }]
		});
		expect(steps({ setup: asked })).toContain('A question for you: yours');
		const byUser = setup({
			reading: { ...reading, pick: { by: 'user', reason: '' } },
			trail: [{ id: 'a', kind: 'read' }]
		});
		expect(steps({ setup: byUser })).toContain('Choose an idea: yours');
	});
});
