import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db';
import { runAndCatch } from '../testing/events';
import { isAdmin, requireAdmin } from './admin';
import { user } from './db/schema';

describe('requireAdmin', () => {
	it('returns an admin', () => {
		const admin = { id: 'a', role: 'admin' };
		expect(requireAdmin({ user: admin })).toBe(admin);
	});

	it.each([
		['an ordinary user', { id: 'u', role: 'user' }],
		['an account from before roles existed', { id: 'u', role: null }],
		['nobody', null]
	])('is a 404 for %s', async (_, who) => {
		const result = await runAndCatch(() => requireAdmin({ user: who }));
		expect(result).toMatchObject({ type: 'error', status: 404 });
	});
});

describe('isAdmin', () => {
	it('is true only for the admin role', () => {
		expect(isAdmin({ role: 'admin' })).toBe(true);
		expect(isAdmin({ role: 'user' })).toBe(false);
		expect(isAdmin({ role: null })).toBe(false);
		expect(isAdmin(null)).toBe(false);
	});
});

/**
 * The first-account rule lives in a trigger in the migrations, which the test
 * database applies, so it is tested with plain inserts — no fixture, since
 * `createTestUser` deliberately overwrites the role the trigger sets.
 */
describe('the first account', () => {
	let harness: TestDb;

	beforeEach(async () => {
		harness = await createTestDb();
	});

	afterEach(() => harness.close());

	const insert = (id: string) =>
		harness.db.insert(user).values({ id, name: id, email: `${id}@example.test`, role: 'user' });

	const roleOf = async (id: string) =>
		(
			await harness.db.query.user.findFirst({
				where: (table, { eq }) => eq(table.id, id),
				columns: { role: true }
			})
		)?.role;

	it('is made an admin, overriding the role it was inserted with', async () => {
		await insert('first');
		expect(await roleOf('first')).toBe('admin');
	});

	it('is the only one made an admin', async () => {
		await insert('first');
		await insert('second');
		expect(await roleOf('second')).toBe('user');
	});
});
