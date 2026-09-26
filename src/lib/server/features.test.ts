import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db';
import { runAndCatch } from '../testing/events';
import { createTestUser, type TestUser } from '../testing/fixtures';
import { user, userFeatures } from './db/schema';
import {
	grantFeature,
	listUserFeatures,
	requireFeature,
	revokeFeature,
	userHasFeature
} from './features';

let harness: TestDb;
let admin: TestUser;
let ada: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	admin = await createTestUser(harness.db, { name: 'Admin', role: 'admin' });
	ada = await createTestUser(harness.db, { name: 'Ada' });
});

afterEach(() => harness.close());

const grantGuides = () =>
	grantFeature(harness.db, { userId: ada.id, feature: 'guides', grantedByUserId: admin.id });

describe('grantFeature', () => {
	it('gives the user the feature and records who granted it', async () => {
		await grantGuides();
		expect(await listUserFeatures(harness.db, ada.id)).toEqual(['guides']);
		const rows = await harness.db.query.userFeatures.findMany({
			columns: { userId: true, feature: true, source: true, grantedByUserId: true }
		});
		expect(rows).toEqual([
			{ userId: ada.id, feature: 'guides', source: 'grant', grantedByUserId: admin.id }
		]);
	});

	it('is a no-op for a feature the user already holds', async () => {
		await grantGuides();
		await grantGuides();
		expect(await harness.db.$count(userFeatures)).toBe(1);
	});

	it('does not give the feature to anyone else', async () => {
		await grantGuides();
		expect(await listUserFeatures(harness.db, admin.id)).toEqual([]);
	});
});

describe('revokeFeature', () => {
	it('removes the feature', async () => {
		await grantGuides();
		await revokeFeature(harness.db, ada.id, 'guides');
		expect(await userHasFeature(harness.db, ada.id, 'guides')).toBe(false);
		expect(await harness.db.$count(userFeatures)).toBe(0);
	});
});

describe('listUserFeatures', () => {
	it('ignores a row for a feature the code no longer has', async () => {
		// Raw insert: the column is `$type<FeatureKey>`, and a retired key is
		// exactly what that type cannot express.
		await harness.db.insert(userFeatures).values({
			userId: ada.id,
			feature: 'retired-feature' as 'guides',
			source: 'grant'
		});
		expect(await listUserFeatures(harness.db, ada.id)).toEqual([]);
	});
});

describe('requireFeature', () => {
	it('throws a 403 naming the feature when the user lacks it', async () => {
		const result = await runAndCatch(() => requireFeature(harness.db, ada.id, 'guides'));
		expect(result).toEqual({
			type: 'error',
			status: 403,
			message: 'Your account does not have access to Guides.'
		});
	});

	it('passes when the user holds it', async () => {
		await grantGuides();
		const result = await runAndCatch(() => requireFeature(harness.db, ada.id, 'guides'));
		expect(result.type).toBe('ok');
	});
});

describe('deleting accounts', () => {
	it('drops the grants of a deleted user', async () => {
		await grantGuides();
		await harness.db.delete(user).where(eq(user.id, ada.id));
		expect(await harness.db.$count(userFeatures)).toBe(0);
	});

	it('keeps a grant when the admin who made it is deleted', async () => {
		await grantGuides();
		await harness.db.delete(user).where(eq(user.id, admin.id));
		expect(await listUserFeatures(harness.db, ada.id)).toEqual(['guides']);
		const row = await harness.db.query.userFeatures.findFirst({
			columns: { grantedByUserId: true }
		});
		expect(row).toEqual({ grantedByUserId: null });
	});
});
