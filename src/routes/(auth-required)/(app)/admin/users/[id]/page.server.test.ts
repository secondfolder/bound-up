import { APIError } from 'better-auth/api';
import { afterEach, beforeEach, describe, expect, it, it as test, vi } from 'vitest';
import type { Db } from '$lib/server/db';
import { grantFeature, listUserFeatures } from '$lib/server/features';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { fakeEvent, runAction, runAndCatch, runLoad } from '$lib/testing/events';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

let harness: TestDb;
let db: Db;
let admin: TestUser;
let ada: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	({ db } = harness);
	admin = await createTestUser(db, { name: 'Admin', role: 'admin' });
	ada = await createTestUser(db, { name: 'Ada' });
});

afterEach(() => harness.close());

function post(
	user: TestUser | null,
	formData: Record<string, string>,
	options: { id?: string; setRole?: (...args: never[]) => unknown } = {}
) {
	return fakeEvent({
		db,
		user,
		params: { id: options.id ?? ada.id },
		formData,
		authApi: { setRole: options.setRole ?? vi.fn().mockResolvedValue({}) }
	});
}

describe('load', () => {
	it('shows the account and every feature, held or not', async () => {
		const data = await runLoad(load(fakeEvent({ db, user: admin, params: { id: ada.id } })));
		expect(data.account).toMatchObject({ id: ada.id, name: 'Ada', isAdmin: false });
		expect(data.account.features).toEqual([
			expect.objectContaining({ key: 'guides', name: 'Guides', held: null }),
			expect.objectContaining({ key: 'permanentMedia', name: 'Permanent media', held: null })
		]);
		expect(data.isSelf).toBe(false);
	});

	it('says how and by whom a held feature was granted', async () => {
		await grantFeature(db, { userId: ada.id, feature: 'guides', grantedByUserId: admin.id });
		const data = await runLoad(load(fakeEvent({ db, user: admin, params: { id: ada.id } })));
		expect(data.account.features[0]?.held).toEqual({
			source: 'grant',
			grantedAt: expect.any(Date),
			grantedByName: 'Admin'
		});
	});

	it('is a 404 for an account that does not exist', async () => {
		const result = await runAndCatch(() =>
			load(fakeEvent({ db, user: admin, params: { id: 'nobody' } }))
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});

	it('is a 404 for a non-admin', async () => {
		const result = await runAndCatch(() =>
			load(fakeEvent({ db, user: ada, params: { id: ada.id } }))
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});

/**
 * Form actions run before layout loads, so the admin layout's guard never sees
 * a POST. Each action has to refuse a non-admin by itself.
 */
describe.each([
	['grantFeature', { feature: 'guides' }],
	['revokeFeature', { feature: 'guides' }],
	['setRole', { role: 'admin' }]
] as const)('%s', (name, formData) => {
	test('is a 404 for a non-admin posting to it directly', async () => {
		const setRole = vi.fn();
		const result = await runAndCatch(() =>
			runAction(actions, name, post(ada, formData, { setRole }))
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
		expect(await listUserFeatures(db, ada.id)).toEqual([]);
		expect(setRole).not.toHaveBeenCalled();
	});

	test('is a 404 for an account that does not exist', async () => {
		const result = await runAndCatch(() =>
			runAction(actions, name, post(admin, formData, { id: 'nobody' }))
		);
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});

describe('grantFeature and revokeFeature', () => {
	it('grant gives the feature, recording the admin; revoke takes it away', async () => {
		await runAction(actions, 'grantFeature', post(admin, { feature: 'guides' }));
		expect(await listUserFeatures(db, ada.id)).toEqual(['guides']);
		const row = await db.query.userFeatures.findFirst({ columns: { grantedByUserId: true } });
		expect(row).toEqual({ grantedByUserId: admin.id });

		await runAction(actions, 'revokeFeature', post(admin, { feature: 'guides' }));
		expect(await listUserFeatures(db, ada.id)).toEqual([]);
	});

	it('refuses a feature that is not in the registry', async () => {
		const result = await runAction(actions, 'grantFeature', post(admin, { feature: 'everything' }));
		expect(result).toMatchObject({ status: 400 });
		expect(await listUserFeatures(db, ada.id)).toEqual([]);
	});
});

describe('setRole', () => {
	it('goes through Better Auth, so its own permission check applies', async () => {
		const setRole = vi.fn().mockResolvedValue({});
		await runAction(actions, 'setRole', post(admin, { role: 'admin' }, { setRole }));
		expect(setRole).toHaveBeenCalledWith(
			expect.objectContaining({ body: { userId: ada.id, role: 'admin' } })
		);
	});

	it('refuses to let an admin remove their own admin access', async () => {
		const setRole = vi.fn();
		const result = await runAction(
			actions,
			'setRole',
			post(admin, { role: 'user' }, { id: admin.id, setRole })
		);
		expect(JSON.stringify(result)).toContain('You cannot remove your own admin access.');
		expect(setRole).not.toHaveBeenCalled();
	});

	it('refuses a role that is not admin or user', async () => {
		const result = await runAction(actions, 'setRole', post(admin, { role: 'owner' }));
		expect(result).toMatchObject({ status: 400 });
	});

	it('shows Better Auth’s refusal on the form', async () => {
		const setRole = vi
			.fn()
			.mockRejectedValue(new APIError('FORBIDDEN', { message: 'Not allowed to set roles' }));
		const result = await runAction(actions, 'setRole', post(admin, { role: 'admin' }, { setRole }));
		expect(JSON.stringify(result)).toContain('Not allowed to set roles');
	});
});
