import { describe, expect, it } from 'vitest';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { load } from './+page.server';

describe('load', () => {
	it('redirects the old scenes library to the ideas one', async () => {
		const result = await runAndCatch(() => load(fakeEvent({})));
		expect(result).toMatchObject({ type: 'redirect', status: 308, location: '/daydreams/ideas' });
	});
});
