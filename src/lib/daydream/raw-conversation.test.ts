import { describe, expect, it } from 'vitest';
import { sentBefore } from './raw-conversation.svelte';

describe('sentBefore', () => {
	it('is the system prompt and the request, for an opening', () => {
		expect(
			sentBefore([
				{ role: 'system', content: 'RULES' },
				{ role: 'user', content: '(Begin the story.)' }
			])
		).toEqual({ system: 'RULES', sent: [{ role: 'user', content: '(Begin the story.)' }] });
	});

	it('is only what came after the last passage the model was shown', () => {
		expect(
			sentBefore([
				{ role: 'system', content: 'RULES' },
				{ role: 'user', content: '(Begin the story.)' },
				{ role: 'assistant', content: 'Mara looks up.' },
				{ role: 'user', content: 'I sit.\n\n(The user pressed "Slower".)' }
			]).sent
		).toEqual([{ role: 'user', content: 'I sit.\n\n(The user pressed "Slower".)' }]);
	});

	it('is nothing new when the prompt ends on a passage', () => {
		expect(
			sentBefore([
				{ role: 'system', content: 'RULES' },
				{ role: 'assistant', content: 'Mara looks up.' }
			]).sent
		).toEqual([]);
	});
});
