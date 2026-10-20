import { dev } from '$app/environment';
import type { Db } from '$lib/server/db';
import { pushSubscriptions, serverSettings } from '$lib/server/db/schema';
import {
	SERVER_SETTING_KEYS,
	type ServerSettingKey,
	type ServerSettingSource,
	type ServerSettings
} from '$lib/server-settings';
import { legacyEnvSettings } from './legacy-env';

/**
 * The server's settings, from the `server_settings` table. See
 * docs/server-settings.md.
 *
 * Everything that used to be a secret or a variable in the environment —
 * the auth secret, the push keys, the mailer, the model providers — is a row
 * here, edited from Admin → Server settings. What can be generated is
 * generated the first time it is found missing, so a new server needs nothing
 * set up before it starts.
 */

/** One stored setting, as the admin screen describes it. */
export type ServerSettingRow = {
	value: string;
	source: ServerSettingSource;
	updatedAt: Date;
};

export type ServerSettingRows = Partial<Record<ServerSettingKey, ServerSettingRow>>;

/**
 * Settings read on Workers, per isolate, for a minute.
 *
 * Every request needs the auth secret, and D1 bills each row read, so reading
 * the table on every request would be most of a Free plan's reads. This holds
 * values, not the binding, so it is not the `db` singleton invariant 2 rules
 * out. The cost is that a change made through one isolate reaches the others
 * within `WORKERS_CACHE_MS`: a regenerated auth secret can be accepted, for
 * up to a minute, by an isolate that has not heard yet.
 *
 * The local backends (`vite dev`, the Docker image) are one process over one
 * SQLite file, where a read costs microseconds and nothing, so they read every
 * request and are never stale — which is also what lets the tests and the
 * e2e suite write a setting and see it at once.
 */
const WORKERS_CACHE_MS = 60_000;
let workersCache: { settings: ServerSettings; at: number } | undefined;

function cacheable(): boolean {
	return !(dev || __SELF_HOSTED__);
}

/** Drops this isolate's cached settings, after a write, so its next request reads the new ones. */
export function forgetCachedSettings(): void {
	workersCache = undefined;
}

async function selectRows(db: Db): Promise<ServerSettingRows> {
	const rows = await db
		.select({
			key: serverSettings.key,
			value: serverSettings.value,
			source: serverSettings.source,
			updatedAt: serverSettings.updatedAt
		})
		.from(serverSettings);
	const known = new Set<string>(SERVER_SETTING_KEYS);
	const result: ServerSettingRows = {};
	for (const { key, ...row } of rows) {
		// A key this build no longer has is left in the table and ignored, so a
		// rollback to an older build still finds it.
		if (known.has(key)) {
			result[key] = row;
		}
	}
	return result;
}

/** Every setting's value from the stored rows, `''` for each one with none. */
export function settingsFromRows(rows: ServerSettingRows): ServerSettings {
	const settings = {} as Record<ServerSettingKey, string>;
	for (const key of SERVER_SETTING_KEYS) {
		settings[key] = rows[key]?.value ?? '';
	}
	return settings;
}

/** 32 random bytes as hex, the shape `secrets.mjs` used to generate. */
export function generateServerSecret(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const BASE64_PADDING = /[=]+$/;

function base64url(bytes: ArrayBuffer): string {
	const binary = String.fromCharCode(...new Uint8Array(bytes));
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(BASE64_PADDING, '');
}

/**
 * A new VAPID key pair: the uncompressed public point and the private scalar
 * `d`, both base64url, which is what browsers subscribe with and what
 * `@block65/webcrypto-web-push` signs with.
 */
export async function generateVapidKeys(): Promise<{
	vapidPublicKey: string;
	vapidPrivateKey: string;
}> {
	const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
		'sign',
		'verify'
	])) as CryptoKeyPair;
	const publicKey = await crypto.subtle.exportKey('raw', pair.publicKey);
	const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
	if (!d) {
		throw new Error('The generated VAPID key has no private scalar');
	}
	return { vapidPublicKey: base64url(publicKey), vapidPrivateKey: d };
}

type Fill = { key: ServerSettingKey; value: string; source: ServerSettingSource };

/**
 * What a server missing some settings should store: anything the
 * environment still sets (the temporary import), then a generated auth
 * secret and push key pair for whatever is still missing.
 *
 * The push keys go together or not at all: a public key from one pair and a
 * private key from another would sign tokens no push service accepts.
 */
async function fillsFor(
	rows: ServerSettingRows,
	platform: App.Platform | undefined
): Promise<Fill[]> {
	const fills: Fill[] = [];
	const has = (key: ServerSettingKey) =>
		rows[key] !== undefined || fills.some((f) => f.key === key);
	for (const [key, value] of legacyEnvSettings(rows, platform)) {
		fills.push({ key, value, source: 'imported' });
	}
	if (!has('serverSecret')) {
		fills.push({ key: 'serverSecret', value: generateServerSecret(), source: 'generated' });
	}
	if (!(has('vapidPublicKey') || has('vapidPrivateKey'))) {
		const keys = await generateVapidKeys();
		fills.push(
			{ key: 'vapidPublicKey', value: keys.vapidPublicKey, source: 'generated' },
			{ key: 'vapidPrivateKey', value: keys.vapidPrivateKey, source: 'generated' }
		);
	}
	return fills;
}

/**
 * Stores what is missing without replacing anything: `onConflictDoNothing`,
 * in one batch, so two isolates (or two requests) filling at once agree on
 * whichever got there first, and a pair can never end up half from each.
 */
async function storeFills(db: Db, fills: Fill[]): Promise<void> {
	const [first, ...rest] = fills.map((fill) =>
		db.insert(serverSettings).values(fill).onConflictDoNothing({ target: serverSettings.key })
	);
	if (first) {
		await db.batch([first, ...rest]);
	}
}

/**
 * This server's settings, `''` for each one that is not set. Fills in what
 * can be filled first (`fillsFor`), so the auth secret is always there.
 *
 * Read once per request, in `hooks.server.ts`, into `locals.settings`.
 */
export async function loadServerSettings(
	db: Db,
	platform: App.Platform | undefined
): Promise<ServerSettings> {
	if (cacheable() && workersCache && Date.now() - workersCache.at < WORKERS_CACHE_MS) {
		return workersCache.settings;
	}
	const rows = await loadServerSettingRows(db, platform);
	const settings = settingsFromRows(rows);
	if (cacheable()) {
		workersCache = { settings, at: Date.now() };
	}
	return settings;
}

/** The stored rows with where each came from, for the admin screen. Fills in what is missing first. */
export async function loadServerSettingRows(
	db: Db,
	platform: App.Platform | undefined
): Promise<ServerSettingRows> {
	const rows = await selectRows(db);
	const fills = await fillsFor(rows, platform);
	if (fills.length === 0) {
		return rows;
	}
	await storeFills(db, fills);
	return await selectRows(db);
}

function upsert(db: Db, key: ServerSettingKey, value: string, source: ServerSettingSource) {
	return db
		.insert(serverSettings)
		.values({ key, value, source })
		.onConflictDoUpdate({
			target: serverSettings.key,
			set: { value, source, updatedAt: new Date() }
		});
}

/**
 * Saves what an admin set. A setting being cleared is saved as `''`, never
 * deleted (see `serverSettings` in the schema).
 */
export async function saveServerSettings(
	db: Db,
	values: Partial<Record<ServerSettingKey, string>>
): Promise<void> {
	const [first, ...rest] = Object.entries(values).map(([key, value]) =>
		upsert(db, key as ServerSettingKey, value ?? '', 'admin')
	);
	if (first) {
		await db.batch([first, ...rest]);
	}
	forgetCachedSettings();
}

/**
 * A new auth secret. Every session is signed with the old one, so everyone —
 * the admin doing this included — is signed out; the rate-limit counts start
 * again; and every partner-assisted recovery escrow stops working until its
 * owner next opens the app, which makes a new one (`escrowShare` in
 * `$lib/server/vaults`).
 */
export async function regenerateServerSecret(db: Db): Promise<void> {
	await upsert(db, 'serverSecret', generateServerSecret(), 'generated');
	forgetCachedSettings();
}

/**
 * A new push key pair. Every device subscribed with the old public key is
 * deleted with it, in the same batch: a push service refuses a token signed
 * by a key the subscription was not made with, so those rows could only fail,
 * and with them gone each device's settings show notifications off, to be
 * turned on again.
 */
export async function regenerateVapidKeys(db: Db): Promise<void> {
	const keys = await generateVapidKeys();
	await db.batch([
		upsert(db, 'vapidPublicKey', keys.vapidPublicKey, 'generated'),
		upsert(db, 'vapidPrivateKey', keys.vapidPrivateKey, 'generated'),
		db.delete(pushSubscriptions)
	]);
	forgetCachedSettings();
}
