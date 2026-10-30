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

const progress = (fields: Partial<ProgressInput>) =>
	Object.fromEntries(
		setupProgress({
			setup: setup(),
			streaming: null,
			research: 'self',
			lookups: 0,
			researched: false,
			...fields
		}).map((step) => [step.key, step.status])
	);

describe('setupProgress', () => {
	it('marks each step done as its tag closes in the reply', () => {
		expect(progress({ streaming: { what: 'read', text: '<musts>\n- re' } })).toEqual({
			read: 'active',
			directions: 'waiting',
			pick: 'waiting',
			build: 'waiting',
			opening: 'waiting'
		});
		expect(
			progress({ streaming: { what: 'read', text: '<musts>x</musts><spread n="3">' } })
		).toMatchObject({ read: 'done', directions: 'active' });
	});

	it('looks things up first, for a brief that asks, and only then', () => {
		const brief = 'research obedience captions';
		expect(
			progress({
				setup: setup({ brief }),
				streaming: { what: 'read', text: '' },
				lookups: 2
			})
		).toMatchObject({ research: 'active', read: 'waiting' });
		expect(
			progress({ setup: setup({ brief }), streaming: { what: 'read', text: '<musts>' } })
		).toMatchObject({ research: 'done', read: 'active' });
		expect(progress({ research: 'none', setup: setup({ brief }) })).not.toHaveProperty('research');
		expect(progress({})).not.toHaveProperty('research');
	});

	it('moves from building to the opening as its passage starts, and asks before picking', () => {
		const chosen = { directionId: 'd1', by: 'code' as const, nudges: [], seed: 1 };
		expect(
			progress({
				setup: setup({ reading, chosen }),
				streaming: { what: 'build', text: '<title>T</title><passage>You' }
			})
		).toMatchObject({ pick: 'done', build: 'done', opening: 'active' });
		const asked = setup({
			reading: { ...reading, ask: { id: 'q', text: 'Who?', options: [], keep: 'story' } }
		});
		expect(progress({ setup: asked })).toMatchObject({ ask: 'yours', pick: 'waiting' });
		const byUser = setup({ reading: { ...reading, pick: { by: 'user', reason: '' } } });
		expect(progress({ setup: byUser })).toMatchObject({ directions: 'done', pick: 'yours' });
	});
});
