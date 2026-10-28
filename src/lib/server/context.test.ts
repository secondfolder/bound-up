import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONTEXT_COOKIE } from '../context';
import { createTestDb, type TestDb } from '../testing/db';
import { defined } from '../testing/defined';
import {
	createTestInvite,
	createTestPartnership,
	createTestUser,
	type TestUser
} from '../testing/fixtures';
import {
	contextResolver,
	contextSpaceViews,
	getSpaceColour,
	listContextSpaces,
	setSpaceColour
} from './context';
import { spaceMembers } from './db/schema/app';
import { soloSpaceFor } from './spaces';

let harness: TestDb;
let ada: TestUser;
let bo: TestUser;
let cy: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	bo = await createTestUser(harness.db, { name: 'Bo' });
	cy = await createTestUser(harness.db, { name: 'Cy' });
});

afterEach(() => harness.close());

function jar(value?: string) {
	const cookies: Record<string, string> = value === undefined ? {} : { [CONTEXT_COOKIE]: value };
	return {
		cookies,
		api: {
			get: (name: string) => cookies[name],
			set: (name: string, next: string) => {
				cookies[name] = next;
			},
			delete: (name: string) => {
				delete cookies[name];
			}
		}
	};
}

describe('listContextSpaces', () => {
	it('lists the viewer’s own space first, then each linked partnership, oldest first', async () => {
		const first = (await createTestPartnership(harness.db, ada, bo)).id;
		const second = (await createTestPartnership(harness.db, cy, ada)).id;
		await createTestInvite(harness.db, ada);
		const solo = defined(await soloSpaceFor(harness.db, ada.id), 'Ada’s own space');

		const spaces = await listContextSpaces(harness.db, ada.id);

		// The pending invite has nothing in it to show, so it is not offered.
		expect(spaces).toEqual([
			{ spaceId: solo, kind: 'solo', colour: null },
			{ spaceId: first, kind: 'shared', colour: null },
			{ spaceId: second, kind: 'shared', colour: null }
		]);
	});
});

describe('contextResolver', () => {
	it('reads the context the cookie names, once per request', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, bo)).id;
		const { api } = jar(partnershipId);
		const resolver = contextResolver(harness.db, ada.id, api);
		expect(await resolver.context()).toEqual({ kind: 'space', spaceId: partnershipId });
		expect(resolver.contextSpaces()).toBe(resolver.contextSpaces());
	});

	it('is Everyone for a space the viewer is not in, and deletes that cookie', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, bo)).id;
		const { cookies, api } = jar(partnershipId);
		expect(await contextResolver(harness.db, cy.id, api).context()).toEqual({ kind: 'all' });
		expect(cookies[CONTEXT_COOKIE]).toBeUndefined();
	});

	it('is Everyone with no cookie, and leaves the jar alone', async () => {
		const { cookies, api } = jar();
		expect(await contextResolver(harness.db, ada.id, api).context()).toEqual({ kind: 'all' });
		expect(cookies).toEqual({});
	});

	it('is Everyone with nobody signed in', async () => {
		const { api } = jar('all');
		const resolver = contextResolver(harness.db, null, api);
		expect(await resolver.context()).toEqual({ kind: 'all' });
		expect(await resolver.contextSpaces()).toEqual([]);
	});
});

describe('space colours', () => {
	it('are each member’s own: one choosing does not change the other’s', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, bo)).id;
		expect(await setSpaceColour(harness.db, partnershipId, ada.id, 'pink')).toBe(true);
		expect(await getSpaceColour(harness.db, partnershipId, ada.id)).toBe('pink');
		expect(await getSpaceColour(harness.db, partnershipId, bo.id)).toBeNull();
	});

	it('cannot be set on a space the viewer is not in', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, bo)).id;
		expect(await setSpaceColour(harness.db, partnershipId, cy.id, 'pink')).toBe(false);
	});

	it('show the chosen colour, or a default, and Me in your own', async () => {
		const first = (await createTestPartnership(harness.db, ada, bo)).id;
		const second = (await createTestPartnership(harness.db, ada, cy)).id;
		await setSpaceColour(harness.db, second, ada.id, 'green');
		const names = { partnershipId: '', role: 'inviter' } as never;
		const views = contextSpaceViews(await listContextSpaces(harness.db, ada.id), [
			{ id: first, names },
			{ id: second, names }
		]);
		expect(views.map((view) => [view.kind, view.colour])).toEqual([
			['solo', 'me'],
			// Green is taken by the choice, so the default skips it.
			['shared', 'pink'],
			['shared', 'green']
		]);
	});

	it('read a stored name that is not on the list as not chosen', async () => {
		const partnershipId = (await createTestPartnership(harness.db, ada, bo)).id;
		// An older palette's name, written past the type as a stale row would be.
		await harness.db
			.update(spaceMembers)
			.set({ colour: 'lime' as never })
			.where(and(eq(spaceMembers.spaceId, partnershipId), eq(spaceMembers.userId, ada.id)));
		expect(await getSpaceColour(harness.db, partnershipId, ada.id)).toBeNull();
		const names = { partnershipId: '', role: 'inviter' } as never;
		const views = contextSpaceViews(await listContextSpaces(harness.db, ada.id), [
			{ id: partnershipId, names }
		]);
		expect(views.map((view) => view.colour)).toEqual(['me', 'green']);
	});
});
