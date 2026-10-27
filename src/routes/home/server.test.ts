import { expect, test } from 'vitest';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { GET } from './+server';

test('sends an old home-screen install to Today, temporarily', async () => {
	const result = await runAndCatch(() => GET(fakeEvent({ path: '/home' })));
	// 307, not 308: a permanent redirect would be cached for ever, and this one
	// is meant to be deleted (docs/temporary-code.md).
	expect(result).toMatchObject({ type: 'redirect', status: 307, location: '/today' });
});

test('keeps the query string', async () => {
	const result = await runAndCatch(() => GET(fakeEvent({ path: '/home?source=pwa' })));
	expect(result).toMatchObject({ type: 'redirect', status: 307, location: '/today?source=pwa' });
});
