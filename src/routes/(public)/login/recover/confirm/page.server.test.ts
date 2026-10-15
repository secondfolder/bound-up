import { afterEach, beforeEach, expect, test } from 'vitest';
import { recoveryStatus, startAccountRecovery } from '$lib/server/recovery';
import { FAKE_WRAP_BLOB, PASSWORD_WRAP_PARAMS } from '$lib/testing/crypto';
import { createTestDb, type TestDb } from '$lib/testing/db';
import { defined } from '$lib/testing/defined';
import { fakeEvent, runAction, runLoad } from '$lib/testing/events';
import { createTestUser } from '$lib/testing/fixtures';
import { actions, load } from './+page.server';

/** The page the recovery email links to. The rules themselves are `server/recovery.test.ts`. */

let harness: TestDb;

beforeEach(async () => {
	harness = await createTestDb();
});

afterEach(() => harness.close());

async function startForAda() {
	const ada = await createTestUser(harness.db, { name: 'Ada' });
	const started = await startAccountRecovery(harness.db, {
		email: ada.email,
		recipient: 'age1newrecipientforada',
		wrap: { params: PASSWORD_WRAP_PARAMS, blob: FAKE_WRAP_BLOB },
		ip: null,
		secret: 'test-secret'
	});
	if (!started.ok) {
		throw new Error('expected the request to start');
	}
	return {
		token: started.token,
		emailToken: defined(started.confirmation, 'the confirmation').token
	};
}

function confirm(token: string) {
	return runAction(
		actions,
		'default',
		fakeEvent({ db: harness.db, path: '/login/recover/confirm', formData: { token } })
	);
}

/** Opening the link must not be enough: mail scanners open links too. */
test('loading the page confirms nothing', async () => {
	const { token } = await startForAda();
	await runLoad(load(fakeEvent({ db: harness.db, path: '/login/recover/confirm' })));
	await expect(recoveryStatus(harness.db, token)).resolves.toMatchObject({ emailConfirmed: false });
});

test('the button confirms the request the link belongs to', async () => {
	const { token, emailToken } = await startForAda();
	expect(await confirm(emailToken)).toMatchObject({ form: { message: 'confirmed' } });
	await expect(recoveryStatus(harness.db, token)).resolves.toMatchObject({ emailConfirmed: true });
});

test('an unknown link and a malformed one both just do not work', async () => {
	expect(await confirm('q'.repeat(43))).toMatchObject({ form: { message: 'invalid' } });
	expect(await confirm('nope')).toMatchObject({ status: 400 });
});
