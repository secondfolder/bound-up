import { describe, expect, it } from 'vitest';
import { stageLabel, WAITING } from './progress';

describe('stageLabel', () => {
	it('says what the model is doing, and how much it has written', () => {
		expect(stageLabel(WAITING)).toBe('Waiting for the model…');
		expect(stageLabel({ ...WAITING, stage: 'thinking' })).toBe('Thinking…');
		expect(stageLabel({ ...WAITING, stage: 'thinking', reasoningChars: 1 })).toBe(
			'Thinking… 1 character'
		);
		expect(stageLabel({ ...WAITING, stage: 'reading' })).toBe('Reading links…');
		expect(stageLabel({ ...WAITING, stage: 'reading', pagesRead: 2 })).toBe(
			'Reading links… 2 read so far'
		);
		expect(stageLabel({ ...WAITING, stage: 'writing', chars: 1240 })).toBe(
			'Writing… 1,240 characters'
		);
	});
});
