import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type Client, createClient } from '@libsql/client';
import { afterEach, expect, test } from 'vitest';

let client: Client | null = null;

afterEach(() => {
	client?.close();
	client = null;
});

test('timezone migration backfills UTC and leaves the column required', async () => {
	client = createClient({ url: ':memory:' });
	await client.executeMultiple(`
		CREATE TABLE user (
			id text PRIMARY KEY NOT NULL,
			name text NOT NULL,
			email text NOT NULL,
			email_verified integer DEFAULT 0 NOT NULL,
			image text,
			created_at integer NOT NULL,
			updated_at integer NOT NULL
		);
	`);

	await client.execute({
		sql: `insert into user (id, name, email, email_verified, image, created_at, updated_at)
		      values (?, ?, ?, ?, ?, ?, ?)`,
		args: ['u1', 'Ada', 'ada@example.test', 0, null, Date.now(), Date.now()]
	});

	const sql = await readFile(
		path.resolve(process.cwd(), 'drizzle/0007_tranquil_krista_starr.sql'),
		'utf8'
	);
	await client.executeMultiple(sql);

	const rows = await client.execute('select timezone from user where id = ?', ['u1']);
	expect(rows.rows[0]?.timezone).toBe('UTC');

	const info = await client.execute('pragma table_info(`user`)');
	const timezone = info.rows.find((row) => row.name === 'timezone');
	expect(Number(timezone?.notnull)).toBe(1);
	expect(String(timezone?.dflt_value)).toBe("'UTC'");
});

/**
 * Migrations that drop a table, already applied everywhere: 0008 rebuilds
 * `edge_tasks`, which nothing references, and 0016 removes `passkey_details`
 * outright. Dropping a table nothing cascades from is safe.
 */
const REVIEWED_REBUILDS = new Set([
	'0008_rename-tasks-to-edge-tasks.sql',
	'0016_account_recovery_and_passkey_wraps.sql'
]);

/**
 * No migration may rebuild a table — drizzle-kit's `CREATE __new_x … DROP TABLE
 * x … RENAME` — without someone deciding it is safe.
 *
 * drizzle-kit generates a rebuild for any change SQLite cannot ALTER (making a
 * column nullable, changing a foreign key) and wraps it in `PRAGMA
 * foreign_keys=OFF`. That pragma does nothing on D1: `wrangler d1 migrations
 * apply` runs the file in a transaction, where SQLite ignores it, so the DROP
 * performs an implicit DELETE that fires every `ON DELETE CASCADE` pointing at
 * the table. Measured against local D1: a rebuild of `self_tasks` silently
 * emptied `self_task_completions`. libsql (dev, tests, the Docker image) does
 * honour the pragma, so nothing else here would ever notice.
 *
 * The fix is almost always not to need the rebuild — keep a column NOT NULL
 * and write an empty value, say. If one really is needed, check every table
 * that references it on a copy of a D1 database before adding it here.
 */
test('no migration rebuilds a table without review', async () => {
	const { readdir } = await import('node:fs/promises');
	const folder = path.resolve(process.cwd(), 'drizzle');
	const files = (await readdir(folder)).filter((file) => file.endsWith('.sql'));
	const rebuilds: string[] = [];
	for (const file of files) {
		const sql = await readFile(path.join(folder, file), 'utf8');
		if (/\bDROP TABLE\b/i.test(sql) && !REVIEWED_REBUILDS.has(file)) {
			rebuilds.push(file);
		}
	}
	expect(rebuilds).toEqual([]);
});

/** Every migration file, in the order they apply, split at the first one named. */
async function migrationsSplitAt(first: string): Promise<[string[], string[]]> {
	const { readdir } = await import('node:fs/promises');
	const folder = path.resolve(process.cwd(), 'drizzle');
	const files = (await readdir(folder)).filter((file) => file.endsWith('.sql')).sort();
	const at = files.indexOf(first);
	if (at === -1) {
		throw new Error(`${first} is not in drizzle/`);
	}
	const read = (names: string[]) =>
		Promise.all(names.map((name) => readFile(path.join(folder, name), 'utf8')));
	return [await read(files.slice(0, at)), await read(files.slice(at))];
}

test('the daydream tree migrations turn each line of turns into a branch', async () => {
	client = createClient({ url: ':memory:' });
	const [before, after] = await migrationsSplitAt('0033_daydream_turn_tree.sql');
	for (const sql of before) {
		await client.executeMultiple(sql);
	}

	// Foreign keys off, so the rows need no user or vault behind them: what is
	// under test is the shape the backfill writes.
	await client.execute('PRAGMA foreign_keys = OFF');
	const now = Date.now();
	for (const daydream of ['d1', 'd2']) {
		await client.execute({
			sql: `insert into daydreams (id, owner_id, ciphertext, vault_id, payload_version, created_at, updated_at)
			      values (?, 'u1', 'sb1.x', 'v1', 1, ?, ?)`,
			args: [daydream, now, now]
		});
	}
	const turns: [string, string, string, number][] = [
		['t0', 'd1', 'character', 0],
		['t1', 'd1', 'user', 1],
		['t2', 'd1', 'character', 2],
		['u0', 'd2', 'character', 0]
	];
	for (const [id, daydream, role, position] of turns) {
		await client.execute({
			sql: `insert into daydream_turns (id, daydream_id, role, position, ciphertext, vault_id, payload_version, created_at, updated_at)
			      values (?, ?, ?, ?, 'sb1.x', 'v1', 1, ?, ?)`,
			args: [id, daydream, role, position, now, now]
		});
	}

	for (const sql of after) {
		await client.executeMultiple(sql);
	}

	const rows = await client.execute(
		'select id, parent_id, role, position from daydream_turns order by daydream_id, position'
	);
	expect(rows.rows.map((row) => ({ ...row }))).toEqual([
		{ id: 't0', parent_id: null, role: 'story', position: 0 },
		{ id: 't1', parent_id: 't0', role: 'user', position: 1 },
		{ id: 't2', parent_id: 't1', role: 'story', position: 2 },
		{ id: 'u0', parent_id: null, role: 'story', position: 0 }
	]);
	const active = await client.execute('select id, active_turn_id from daydreams order by id');
	expect(active.rows.map((row) => ({ ...row }))).toEqual([
		{ id: 'd1', active_turn_id: 't2' },
		{ id: 'd2', active_turn_id: 'u0' }
	]);
});

test('the IQ test answer button folds into debug mode, once per account', async () => {
	client = createClient({ url: ':memory:' });
	await client.executeMultiple(`
		CREATE TABLE user_features (
			id text PRIMARY KEY NOT NULL,
			user_id text NOT NULL,
			feature text NOT NULL,
			source text NOT NULL
		);
		CREATE UNIQUE INDEX user_features_user_feature_idx ON user_features (user_id, feature);
		INSERT INTO user_features VALUES
			('f1', 'ada', 'iqTestAnswerButton', 'grant'),
			('f2', 'jun', 'iqTestAnswerButton', 'grant'),
			('f3', 'jun', 'debugMode', 'grant'),
			('f4', 'kit', 'guides', 'grant');
	`);

	const sql = await readFile(
		path.resolve(process.cwd(), 'drizzle/0035_fold_iq_answer_button_into_debug_mode.sql'),
		'utf8'
	);
	await client.executeMultiple(sql);

	const rows = await client.execute(
		'select user_id, feature from user_features order by user_id, feature'
	);
	expect(rows.rows.map((row) => [row.user_id, row.feature])).toEqual([
		['ada', 'debugMode'],
		// Jun held both: the unique index would refuse a second debugMode row.
		['jun', 'debugMode'],
		['kit', 'guides']
	]);
});

test('model settings are copied to keys that name no provider, each given its provider', async () => {
	client = createClient({ url: ':memory:' });
	const [before, after] = await migrationsSplitAt(
		'0042_copy_model_settings_to_provider_neutral_keys.sql'
	);
	for (const sql of before) {
		await client.executeMultiple(sql);
	}
	await client.executeMultiple(`
		INSERT INTO server_settings (key, value, source, created_at, updated_at) VALUES
			('openrouterStoryModel', '{"openrouterModelId":"v/m","tools":true}', 'admin', 1, 2),
			('runwarePhotoModel', '{"preset":"lustify"}', 'imported', 3, 4),
			('runwareIllustratedModel', '', 'admin', 5, 6),
			('openrouterApiKey', 'sk-or-1', 'admin', 7, 8);
	`);

	for (const sql of after) {
		await client.executeMultiple(sql);
	}

	const rows = await client.execute(
		'select key, value, source, created_at, updated_at from server_settings order by key'
	);
	const byKey = Object.fromEntries(rows.rows.map((row) => [String(row.key), { ...row }]));
	expect(JSON.parse(String(byKey.storyModel?.value))).toEqual({
		openrouterModelId: 'v/m',
		tools: true,
		provider: 'openrouter'
	});
	expect(byKey.storyModel).toMatchObject({ source: 'admin', created_at: 1, updated_at: 2 });
	expect(JSON.parse(String(byKey.photoModel?.value))).toEqual({
		preset: 'lustify',
		provider: 'runware'
	});
	expect(byKey.photoModel?.source).toBe('imported');
	// Cleared stays cleared, so the import from the environment cannot bring it back.
	expect(byKey.illustratedModel?.value).toBe('');
	// The old rows stay, for a rollback; the keys are untouched.
	expect(byKey.openrouterStoryModel).toBeDefined();
	expect(byKey.openrouterApiKey?.value).toBe('sk-or-1');
});

test('copying the model settings leaves a newer row, and a value that is not JSON, alone', async () => {
	client = createClient({ url: ':memory:' });
	const [before, after] = await migrationsSplitAt(
		'0042_copy_model_settings_to_provider_neutral_keys.sql'
	);
	for (const sql of before) {
		await client.executeMultiple(sql);
	}
	await client.executeMultiple(`
		INSERT INTO server_settings (key, value, source) VALUES
			('openrouterStoryModel', 'not json', 'admin'),
			('runwarePhotoModel', '{"preset":"lustify"}', 'admin'),
			('photoModel', '{"provider":"runware","preset":"dark-beast"}', 'admin');
	`);

	for (const sql of after) {
		await client.executeMultiple(sql);
	}

	const rows = await client.execute(
		"select key, value from server_settings where key in ('storyModel', 'photoModel') order by key"
	);
	expect(rows.rows.map((row) => [row.key, row.value])).toEqual([
		['photoModel', '{"provider":"runware","preset":"dark-beast"}'],
		['storyModel', 'not json']
	]);
});
