import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '$lib/server/db';
import { grantFeature } from '$lib/server/features';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import { load } from './+page.server';

// The bench folders are on the developer's machine and never committed, so
// the page is tested against none: an empty dream-bench, as a fresh checkout has.
vi.mock('$lib/server/dream/ab', async (original) => ({
	...(await original<typeof import('$lib/server/dream/ab')>()),
	listVersions: () => Promise.resolve([]),
	readVotes: () => Promise.resolve([])
}));

/**
 * Bench votes (docs/dreams.md, "Quality tools"): debug mode only, like every
 * debug tool, and on a dev server only, since it reads dream-bench/.
 */

let harness: TestDb;
let db: Db;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	ada = await createTestUser(db, { name: 'Ada' });
	jun = await createTestUser(db, { name: 'Jun' });
	await grantFeature(db, { userId: ada.id, feature: 'debugMode', grantedByUserId: ada.id });
});

afterEach(() => harness.close());

const event = (user: TestUser | null) => fakeEvent({ db, user, path: '/debug/dreams' });

describe('/debug/dreams', () => {
	it('needs a session and debug mode', async () => {
		expect(await runAndCatch(() => load(event(null)))).toMatchObject({ status: 401 });
		expect(await runAndCatch(() => load(event(jun)))).toMatchObject({ status: 403 });
	});

	it('says what to run when there is nothing to compare', async () => {
		const data = await runLoad(load(event(ada)));
		expect(data).toMatchObject({ labels: [], pair: null, standings: [], voteCount: 0 });
	});
});
