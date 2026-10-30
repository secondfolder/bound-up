import { describe, expect, it } from 'vitest';
import { type PassageRequest, passageRequestSchema } from './requests';
import type { UserTurn } from './story';

describe('passageRequestSchema', () => {
	it('keeps every part of the user’s turn, so none is dropped on the way to the model', () => {
		const turn: Required<Extract<UserTurn, { kind: 'words' }>> = {
			kind: 'words',
			text: 'I sign.',
			readAs: 'direction',
			choices: [{ id: 'pen', value: 'red' }],
			fields: [{ block: 'terms', name: 'c1', value: 'initialled' }],
			answers: [{ id: 'pace', text: 'Slower' }],
			rolls: [{ id: 'door', sides: 6, value: 4 }]
		};
		const request: PassageRequest = {
			setup: {
				heat: 'steamy',
				telling: '',
				capabilities: [],
				elements: [],
				presentation: { view: 'scroll', theme: 'rust', notes: '' },
				musts: [],
				research: ''
			},
			limits: [],
			preferences: [],
			history: [{ passage: 'x', turn }],
			summaries: [],
			take: null,
			repeated: []
		};
		expect(passageRequestSchema.parse(request).history[0]?.turn).toEqual(turn);
	});
});
