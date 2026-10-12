import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IqTestResultInput } from '$lib/schemas/iqTestResult';
import { listIqTestResults, saveIqTestResult } from '$lib/server/iq-test';
import { verifySharedResult } from '$lib/server/iq-test-share';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAndCatch } from '$lib/testing/events';
import { createTestUser, type TestUser } from '$lib/testing/fixtures';
import { POST } from './+server';
import { DELETE } from './[id]/+server';
import { POST as SHARE } from './share/+server';

let harness: TestDb;
let ada: TestUser;
let jun: TestUser;

beforeEach(async () => {
	harness = await createTestDb();
	ada = await createTestUser(harness.db, { name: 'Ada' });
	jun = await createTestUser(harness.db, { name: 'Jun' });
});

afterEach(() => harness.close());

const result: IqTestResultInput = {
	role: 'sub',
	intensity: 2,
	vibe: 'bambi',
	iq: 72,
	correct: 5,
	attempted: 12,
	skipped: 0,
	humiliating: true,
	themedLook: true,
	soberIq: 115,
	targetIq: null,
	seed: 123_456
};

function post(user: TestUser | null, json: unknown) {
	return runAndCatch(() => POST(fakeEvent({ db: harness.db, user, json })));
}

function remove(user: TestUser | null, id: string) {
	return runAndCatch(() => DELETE(fakeEvent({ db: harness.db, user, params: { id } })));
}

describe('POST /api/playroom/iq-test/results', () => {
	it('saves a result to the signed-in account', async () => {
		const outcome = await post(ada, result);
		expect(outcome.type).toBe('ok');
		const response = outcome.type === 'ok' ? outcome.value : null;
		expect(response?.status).toBe(201);
		const saved = await defined(response, 'the response').json();
		expect(saved).toMatchObject({ iq: 72, vibe: 'bambi', soberIq: 115, role: 'sub' });
		expect(saved).not.toHaveProperty('ownerId');

		const history = await listIqTestResults(harness.db, ada.id);
		expect(history).toHaveLength(1);
		expect(history[0]?.iq).toBe(72);
	});

	it('refuses a signed-out visitor, whose results stay on their device', async () => {
		expect(await post(null, result)).toMatchObject({ type: 'error', status: 401 });
	});

	it('refuses something that is not a result', async () => {
		expect(await post(ada, null)).toMatchObject({ type: 'error', status: 400 });
		expect(await post(ada, { ...result, iq: 500 })).toMatchObject({ type: 'error', status: 400 });
		expect(await post(ada, { ...result, correct: 13 })).toMatchObject({
			type: 'error',
			status: 400
		});
		expect(await post(ada, { ...result, vibe: 'nonsense' })).toMatchObject({
			type: 'error',
			status: 400
		});
	});
});

describe('DELETE /api/playroom/iq-test/results/[id]', () => {
	it('deletes one of your own results', async () => {
		const saved = await saveIqTestResult(harness.db, ada.id, result);
		const outcome = await remove(ada, saved.id);
		expect(outcome.type === 'ok' && outcome.value.status).toBe(204);
		expect(await listIqTestResults(harness.db, ada.id)).toEqual([]);
	});

	it("answers someone else's result exactly as a missing one, and leaves it alone", async () => {
		const saved = await saveIqTestResult(harness.db, ada.id, result);
		expect(await remove(jun, saved.id)).toMatchObject({ type: 'error', status: 404 });
		expect(await remove(jun, 'no-such-id')).toMatchObject({ type: 'error', status: 404 });
		expect(await listIqTestResults(harness.db, ada.id)).toHaveLength(1);
	});

	it('refuses a signed-out visitor', async () => {
		expect(await remove(null, 'anything')).toMatchObject({ type: 'error', status: 401 });
	});
});

describe('POST /api/playroom/iq-test/results/share', () => {
	const Secret = 's'.repeat(43);

	function share(json: unknown) {
		return runAndCatch(() =>
			SHARE(fakeEvent({ user: null, json, authContext: { secret: Secret } }))
		);
	}

	it('signs a signed-out result into a token that carries it, storing nothing', async () => {
		const outcome = await share(result);
		const response = defined(outcome.type === 'ok' ? outcome.value : null, 'the response');
		expect(response.status).toBe(201);
		const { token } = (await response.json()) as { token: string };
		expect(await verifySharedResult(Secret, token)).toMatchObject({ iq: 72, vibe: 'bambi' });
		expect(await listIqTestResults(harness.db, ada.id)).toHaveLength(0);
	});

	it('refuses something that is not a result', async () => {
		expect(await share({ iq: 'high' })).toMatchObject({ type: 'error', status: 400 });
	});
});
