import { hashPassword } from 'better-auth/crypto';
import { generateAgeIdentity } from '../src/lib/crypto/identity';
import { deriveAuthSecret, deriveMasterKey, deriveWrapKey } from '../src/lib/crypto/kdf';
import { wrapIdentity } from '../src/lib/crypto/wrap';
import { MASTER_KEY_VERSIONS } from '../src/lib/encryption';
import { sqlBatch } from './db';
import type { Account } from './helpers';

/**
 * An account as the sign-up form leaves it, made without the form: confirmed,
 * with its key and the password wrap that opens it.
 *
 * For the specs that need a person rather than a sign-up — nearly all of them.
 * The form is most of a second of the browser deriving keys, then a response
 * deliberately held to 1.5 s so its timing cannot say whether an address has an
 * account (`SIGN_UP_RESPONSE_FLOOR_MS`), then the emailed link; done once per
 * person, about 190 times a run, it was a large share of the suite. The specs
 * about signing up (encryption, email verification, timezone, the invite round
 * trip through /signup) still go through it with `signUp`.
 *
 * Every value is made by the code the browser runs at sign-up
 * (`SignupForm.svelte`), and the rows are the ones the sign-up action writes —
 * Better Auth's user and credential, then `putUserKeys` — so signing in opens
 * the key exactly as it would. Inserted with SQL because the test process cannot
 * reach the server's own functions, and sign-up over HTTP is switched off
 * (`disabledPaths` in auth.ts). If those rows change shape, every spec that
 * signs in through here fails on its first step.
 */
export async function createAccount(who: Account, timezone: string): Promise<void> {
	const [params] = MASTER_KEY_VERSIONS;
	if (!params) {
		throw new Error('There is no master key version to derive with: see src/lib/encryption.ts.');
	}
	// Better Auth keeps addresses in lower case, and signs in by them.
	const email = who.email.toLowerCase();
	const master = await deriveMasterKey(who.password, email, params);
	const { identity, recipient } = await generateAgeIdentity();
	const authSecret = await deriveAuthSecret(master);
	const wrapBlob = await wrapIdentity({
		wrapKey: await deriveWrapKey(master),
		identity,
		recipient
	});
	const wrapParams = JSON.stringify({
		type: 'password',
		kdf: params.kdf,
		version: params.version,
		iterations: params.iterations
	});

	const userId = crypto.randomUUID();
	const now = Date.now();
	await sqlBatch([
		{
			// `role` as the admin plugin's create hook writes it. The migrations'
			// first-account trigger still makes the run's first account an admin,
			// as it would through the form, and `user_has_solo_space` gives it
			// its solo space, so nothing here has to.
			sql: `insert into user (id, name, email, email_verified, role, timezone, created_at, updated_at)
				values (?, ?, ?, 1, 'user', ?, ?, ?)`,
			args: [userId, who.name, email, timezone, now, now]
		},
		{
			// The credential: the browser's derived secret is the "password" Better
			// Auth hashes, never the password itself.
			sql: `insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
				values (?, ?, 'credential', ?, ?, ?, ?)`,
			args: [crypto.randomUUID(), userId, userId, await hashPassword(authSecret), now, now]
		},
		{
			sql: 'insert into user_keys (id, user_id, recipient) values (?, ?, ?)',
			args: [crypto.randomUUID(), userId, recipient]
		},
		{
			sql: `insert into user_key_wraps (id, user_id, type, params, blob) values (?, ?, 'password', ?, ?)`,
			args: [crypto.randomUUID(), userId, wrapParams, wrapBlob]
		}
	]);
}
