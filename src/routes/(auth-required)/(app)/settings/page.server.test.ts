import { describe, expect, it } from 'vitest';
import { fakeEvent, runLoad } from '$lib/testing/events';
import { load } from './+page.server';

describe('/settings/+page.server.ts', () => {
	it('gives the page the version this build was made as', async () => {
		const data = await runLoad(load(fakeEvent({})));
		expect(data.appVersion).toBe(__APP_VERSION__);
		expect(data.appVersion).not.toBe('');
	});
});
