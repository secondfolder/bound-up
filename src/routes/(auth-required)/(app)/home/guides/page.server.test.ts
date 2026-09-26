import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '$lib/server/db';
import { guides } from '$lib/server/db/schema';
import { grantFeature } from '$lib/server/features';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAndCatch, runLoad } from '$lib/testing/events';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import { load as loadList } from './+page.server';
import { load as loadGuide } from './[id]/+page.server';

let harness: TestDb;
let db: Db;
let admin: TestUser;
let ada: TestUser;
let guideId: string;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	admin = await createTestUser(db, { role: 'admin' });
	ada = await createTestUser(db, { name: 'Ada' });
	const [guide] = await db.insert(guides).values({ title: 'A guide' }).returning({ id: guides.id });
	guideId = guide?.id ?? '';
});

afterEach(() => harness.close());

const giveAdaGuides = () =>
	grantFeature(db, { userId: ada.id, feature: 'guides', grantedByUserId: admin.id });

describe('/home/guides', () => {
	it('refuses an account without the guides feature', async () => {
		const result = await runAndCatch(() => loadList(fakeEvent({ db, user: ada })));
		expect(result).toMatchObject({ type: 'error', status: 403 });
	});

	it('lists the guides for an account that has it', async () => {
		await giveAdaGuides();
		const data = await runLoad(loadList(fakeEvent({ db, user: ada })));
		expect(data.guides).toEqual([{ id: guideId, title: 'A guide' }]);
	});
});

describe('/home/guides/[id]', () => {
	// A 403 for a made-up id too: a 404 here would tell someone without access
	// which ids are real.
	it.each([
		['a real guide', () => guideId],
		['a made-up id', () => 'no-such-guide']
	])('refuses an account without the guides feature, for %s', async (_, id) => {
		const result = await runAndCatch(() =>
			loadGuide(fakeEvent({ db, user: ada, params: { id: id() } }))
		);
		expect(result).toMatchObject({ type: 'error', status: 403 });
	});

	it('shows the guide to an account that has it', async () => {
		await giveAdaGuides();
		const data = await runLoad(loadGuide(fakeEvent({ db, user: ada, params: { id: guideId } })));
		expect(data.guide).toMatchObject({ id: guideId, title: 'A guide' });
	});

	it('is still a 404 for a missing guide once the account has access', async () => {
		await giveAdaGuides();
		const result = await runAndCatch(() =>
			loadGuide(fakeEvent({ db, user: ada, params: { id: 'no-such-guide' } }))
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});
