import { describe, expect, it } from 'vitest';
import { playroomToolsFor } from './tools';

describe('playroomToolsFor', () => {
	it('lists every tool without a feature, in order, for any account', () => {
		expect(playroomToolsFor([]).map((tool) => tool.id)).toEqual(['kink-list', 'iq-test']);
	});

	it('adds Daydreams only for an account that holds the feature', () => {
		expect(playroomToolsFor(['guides']).map((tool) => tool.id)).not.toContain('daydreams');
		expect(playroomToolsFor(['daydreams']).map((tool) => tool.id)).toEqual([
			'kink-list',
			'iq-test',
			'daydreams'
		]);
	});
});
