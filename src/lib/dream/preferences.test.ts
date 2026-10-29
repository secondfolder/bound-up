import { describe, expect, it } from 'vitest';
import type { DreamPreference } from '../sealed-kinds/dreams';
import {
	preferenceFromAnswer,
	preferenceFromFooter,
	promotable,
	withoutPreference,
	withPreference
} from './preferences';
import { seededRandom } from './random';
import { newSetup } from './setup-flow';

const random = seededRandom(1);

describe('preferences', () => {
	it('keeps what the model noticed for this story, and never as a limit', () => {
		const noticed = preferenceFromFooter(
			{ kind: 'pref', pref: 'Slower scenes', scope: 'general', firmness: 'hard' },
			random
		);
		expect(noticed).toMatchObject({
			text: 'Slower scenes',
			firmness: 'default',
			source: 'noticed'
		});
		expect(preferenceFromAnswer('Who is in charge?', 'They are', random)).toMatchObject({
			text: 'Who is in charge? They are',
			firmness: 'default',
			source: 'answer'
		});
	});

	it('adds a preference once, whatever the case and spacing, and removes one', () => {
		const first = preferenceFromAnswer('Pace?', 'Slow', random);
		const list = withPreference([first], { ...first, id: 'x', text: 'pace?  slow' });
		expect(list).toHaveLength(1);
		expect(withoutPreference(list, first.id)).toEqual([]);
	});

	it('suggests a story preference made general once it turns up in three daydreams', () => {
		const slow: DreamPreference = {
			id: 'a',
			text: 'Slow scenes',
			firmness: 'leaning',
			appliesTo: '',
			source: 'noticed'
		};
		const withSlow = { ...newSetup('x'), preferences: [slow] };
		expect(promotable([withSlow, withSlow], [])).toEqual([]);
		expect(promotable([withSlow, withSlow, withSlow], []).map((p) => p.text)).toEqual([
			'Slow scenes'
		]);
		expect(promotable([withSlow, withSlow, withSlow], [{ ...slow, id: 'g' }])).toEqual([]);
	});
});
