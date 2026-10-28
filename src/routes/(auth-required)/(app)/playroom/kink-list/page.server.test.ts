import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTEXT_DEPENDENCY } from '$lib/context';
import { soloSpaceFor } from '$lib/server/spaces';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestPartnership, createTestUser, type TestUser } from '$lib/testing/fixtures';
import { load } from './+page.server';

/**
 * Your own kink list follows the context switcher: Me and Everyone are this
 * list, and a partnership is your list for that partner, a page of its own,
 * which this sends you on to. See docs/kink-list.md and docs/contexts.md.
 */

let harness: TestDb;
let ada: TestUser;
let bo: TestUser;
let partnershipId: string;
let adaSolo: string;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	bo = await createTestUser(harness.db, { name: 'Bo' });
	partnershipId = (await createTestPartnership(harness.db, ada, bo)).id;
	adaSolo = defined(await soloSpaceFor(harness.db, ada.id), 'Ada’s own space');
});

afterEach(() => harness.close());

function at(contextCookie?: string) {
	return fakeEvent({
		db: harness.db,
		user: ada,
		path: '/playroom/kink-list',
		...(contextCookie === undefined ? {} : { contextCookie })
	});
}

describe('the kink list in each context', () => {
	it('is your own list in Me, in Everyone, and on a device that has never switched', async () => {
		for (const cookie of [adaSolo, 'all', undefined]) {
			const outcome = await runAndCatch(() => load(at(cookie)));
			expect(outcome.type).toBe('ok');
		}
	});

	it('sends a partnership on to your list for that partner', async () => {
		const outcome = await runAndCatch(() => load(at(partnershipId)));
		expect(outcome).toEqual({
			type: 'redirect',
			status: 307,
			location: `/playroom/kink-list/partner/${partnershipId}`
		});
	});

	it('follows the switcher: it re-runs when the context changes', async () => {
		const event = at(adaSolo);
		const depends = vi.spyOn(event, 'depends');
		await load(event);
		expect(depends).toHaveBeenCalledWith(CONTEXT_DEPENDENCY);
	});

	it('stays on your own list for a context that names a space you are not in', async () => {
		// An ambient context never 404s or follows a stranger's id: it reads as
		// Everyone (docs/contexts.md).
		const outcome = await runAndCatch(() => load(at(crypto.randomUUID())));
		expect(outcome.type).toBe('ok');
	});
});
