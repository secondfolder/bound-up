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
 * Migrations that drop whole tables on purpose, and exactly which, in the
 * order they must go. Any other DROP TABLE in the file, or these in another
 * order, fails the test below.
 *
 * 0053 drops the tasks and rewards tables kept per scope, once 0052 has
 * copied every row into the ones kept per space (tested below). Safe on D1,
 * where the DROP's implicit DELETE fires cascades, because:
 *
 * - each child goes before its parent — claims before rewards, completions
 *   before tasks — so no cascade from these tables has anything left to
 *   reach;
 * - nothing outside them references them (checked when it was written: their
 *   only foreign keys in are each other's), and their own keys point
 *   outwards, which a drop never follows;
 * - the copy ran first, in its own migration, and `npm run test:e2e:worker`
 *   applied both to local D1.
 */
const REVIEWED_DROPS: Record<string, string[]> = {
	'0053_drop_scoped_tasks_rewards.sql': [
		'partnership_reward_claims',
		'partnership_reward_credits',
		'partnership_rewards',
		'partnership_task_completions',
		'partnership_tasks',
		'self_reward_claims',
		'self_reward_credits',
		'self_rewards',
		'self_task_completions',
		'self_tasks'
	]
};

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
test('no migration rebuilds or drops a table without review', async () => {
	const { readdir } = await import('node:fs/promises');
	const folder = path.resolve(process.cwd(), 'drizzle');
	const files = (await readdir(folder)).filter((file) => file.endsWith('.sql'));
	const rebuilds: string[] = [];
	for (const file of files) {
		const sql = await readFile(path.join(folder, file), 'utf8');
		if (!/\bDROP TABLE\b/i.test(sql) || REVIEWED_REBUILDS.has(file)) {
			continue;
		}
		const allowed = REVIEWED_DROPS[file];
		const dropped = [...sql.matchAll(/\bDROP TABLE\s+`?(?<table>\w+)`?/gi)].map(
			(match) => match.groups?.table
		);
		if (!allowed || JSON.stringify(dropped) !== JSON.stringify(allowed)) {
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

test('the spaces backfill gives every account a solo space and every partnership its own', async () => {
	client = createClient({ url: ':memory:' });
	const [before, after] = await migrationsSplitAt('0048_add_spaces.sql');
	for (const sql of before) {
		await client.executeMultiple(sql);
	}

	// Accounts out of id order, so pairing each with its space by position
	// is tested against an order the inserts did not already give.
	await client.executeMultiple(`
		INSERT INTO user (id, name, email, created_at, updated_at) VALUES
			('zed', 'Zed', 'zed@example.test', 1, 1),
			('ada', 'Ada', 'ada@example.test', 2, 2),
			('jun', 'Jun', 'jun@example.test', 3, 3),
			('kit', 'Kit', 'kit@example.test', 4, 4);
		INSERT INTO partnerships (id, inviter_id, invitee_id, status, control, accepted_at, created_at, updated_at) VALUES
			('p-inviter', 'ada', 'jun', 'accepted', 'inviter', 10, 5, 5),
			('p-invitee', 'zed', 'ada', 'accepted', 'invitee', 11, 6, 6),
			('p-both', 'jun', 'kit', 'accepted', 'both', 12, 7, 7),
			('p-pending', 'kit', NULL, 'pending', 'both', NULL, 8, 8);
	`);
	// Foreign keys off for the content, so it needs nothing behind it but the
	// columns the backfill reads.
	await client.execute('PRAGMA foreign_keys = OFF');
	await client.executeMultiple(`
		INSERT INTO vaults (id, kind, owner_user_id, partnership_id, key_check) VALUES
			('v-ada', 'self', 'ada', NULL, 'k'), ('v-shared', 'partnership', NULL, 'p-inviter', 'k');
		INSERT INTO notebook_entries (id, owner_id, partnership_id, kind, ciphertext, vault_id, payload_version) VALUES
			('n-own', 'ada', NULL, 'note', 'c', 'v-ada', 1), ('n-shared', NULL, 'p-inviter', 'note', 'c', 'v-shared', 1);
		INSERT INTO kink_lists (id, owner_id, scope, partnership_id, ciphertext, vault_id, payload_version) VALUES
			('k-own', 'ada', 'self', NULL, 'c', 'v-ada', 1), ('k-shared', 'ada', 'p-inviter', 'p-inviter', 'c', 'v-shared', 1);
		INSERT INTO message_threads (id, partnership_id, icon, last_message_at, last_message_sender_id, created_at, updated_at) VALUES
			('t1', 'p-inviter', 'envelope', 1, 'ada', 1, 1);
		INSERT INTO message_tags (id, partnership_id, color, created_at, updated_at) VALUES
			('tag1', 'p-inviter', '#fff', 1, 1);
		INSERT INTO history_restore_requests (id, partnership_id, requester_id, requested_recipient) VALUES
			('r1', 'p-inviter', 'ada', 'age1x');
		INSERT INTO vault_escrows (id, vault_id, partnership_id, ciphertext) VALUES ('e1', 'v-ada', 'p-inviter', 'c');
		INSERT INTO daydreams (id, owner_id, ciphertext, vault_id, payload_version) VALUES ('d1', 'ada', 'c', 'v-ada', 1);
		INSERT INTO daydream_characters (id, owner_id, ciphertext, vault_id, payload_version) VALUES ('c1', 'ada', 'c', 'v-ada', 1);
		INSERT INTO daydream_scenes (id, owner_id, ciphertext, vault_id, payload_version) VALUES ('i1', 'ada', 'c', 'v-ada', 1);
	`);
	await client.execute('PRAGMA foreign_keys = ON');

	for (const sql of after) {
		await client.executeMultiple(sql);
	}

	const solo = async (userId: string) => {
		const rows = await client?.execute({
			sql: `select m.space_id, m.can_manage from space_members m join spaces s on s.id = m.space_id
			      where s.kind = 'solo' and m.user_id = ?`,
			args: [userId]
		});
		expect(rows?.rows).toHaveLength(1);
		expect(Number(rows?.rows[0]?.can_manage)).toBe(1);
		return String(rows?.rows[0]?.space_id);
	};
	const soloIds = await Promise.all(['ada', 'jun', 'kit', 'zed'].map(solo));
	expect(new Set(soloIds).size).toBe(4);
	for (const id of soloIds) {
		expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		const members = await client.execute({
			sql: 'select count(*) as n from space_members where space_id = ?',
			args: [id]
		});
		expect(Number(members.rows[0]?.n)).toBe(1);
	}

	const shared = await client.execute(`
		select s.id, m.user_id, m.can_manage from spaces s join space_members m on m.space_id = s.id
		where s.kind = 'shared' order by s.id, m.user_id`);
	expect(shared.rows.map((row) => [row.id, row.user_id, Number(row.can_manage)])).toEqual([
		['p-both', 'jun', 1],
		['p-both', 'kit', 1],
		['p-invitee', 'ada', 1],
		['p-invitee', 'zed', 0],
		['p-inviter', 'ada', 1],
		['p-inviter', 'jun', 0],
		// A pending invite has its inviter; the invitee joins on accepting.
		['p-pending', 'kit', 1]
	]);

	const adaSolo = await solo('ada');
	const spaceOf = async (table: string, id: string) =>
		(await client?.execute({ sql: `select space_id from ${table} where id = ?`, args: [id] }))
			?.rows[0]?.space_id;
	expect(await spaceOf('vaults', 'v-ada')).toBe(adaSolo);
	expect(await spaceOf('vaults', 'v-shared')).toBe('p-inviter');
	expect(await spaceOf('notebook_entries', 'n-own')).toBe(adaSolo);
	expect(await spaceOf('notebook_entries', 'n-shared')).toBe('p-inviter');
	expect(await spaceOf('kink_lists', 'k-own')).toBe(adaSolo);
	expect(await spaceOf('kink_lists', 'k-shared')).toBe('p-inviter');
	expect(await spaceOf('message_threads', 't1')).toBe('p-inviter');
	expect(await spaceOf('message_tags', 'tag1')).toBe('p-inviter');
	expect(await spaceOf('history_restore_requests', 'r1')).toBe('p-inviter');
	// The partner holds it, so it is in the shared space, not the owner's.
	expect(await spaceOf('vault_escrows', 'e1')).toBe('p-inviter');
	expect(await spaceOf('daydreams', 'd1')).toBe(adaSolo);
	expect(await spaceOf('daydream_characters', 'c1')).toBe(adaSolo);
	expect(await spaceOf('daydream_scenes', 'i1')).toBe(adaSolo);

	// And from now on, an account gets its solo space however it is inserted.
	await client.execute(
		"INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('new', 'New', 'new@example.test', 9, 9)"
	);
	await solo('new');
});

test('tasks and rewards are copied into their spaces, every row, before the old tables go', async () => {
	client = createClient({ url: ':memory:' });
	const [before, after] = await migrationsSplitAt('0052_copy_tasks_rewards_into_spaces.sql');
	for (const sql of before) {
		await client.executeMultiple(sql);
	}

	// Accounts get their solo spaces from the trigger. A partnership made
	// after the spaces backfill needs its space and members written as
	// `createInvite` and `acceptInvite` write them: Ada and Jun, Ada in
	// control; and Jun and Kit sharing it, Jun's members row first so the
	// "first other member" order is not the insert order of the people.
	await client.executeMultiple(`
		INSERT INTO user (id, name, email, created_at, updated_at) VALUES
			('ada', 'Ada', 'ada@example.test', 1, 1),
			('jun', 'Jun', 'jun@example.test', 2, 2),
			('kit', 'Kit', 'kit@example.test', 3, 3);
		INSERT INTO partnerships (id, inviter_id, invitee_id, status, control, accepted_at, created_at, updated_at) VALUES
			('p-ada-jun', 'ada', 'jun', 'accepted', 'inviter', 10, 5, 5),
			('p-jun-kit', 'kit', 'jun', 'accepted', 'both', 11, 6, 6);
		INSERT INTO spaces (id, kind) VALUES ('p-ada-jun', 'shared'), ('p-jun-kit', 'shared');
		INSERT INTO space_members (id, space_id, user_id, can_manage, created_at, updated_at) VALUES
			('m1', 'p-ada-jun', 'ada', 1, 5, 5), ('m2', 'p-ada-jun', 'jun', 0, 10, 10),
			('m3', 'p-jun-kit', 'jun', 1, 4, 4), ('m4', 'p-jun-kit', 'kit', 1, 6, 6);
	`);
	// Foreign keys off for the vaults, which need no wraps behind them for this.
	await client.execute('PRAGMA foreign_keys = OFF');
	await client.executeMultiple(`
		INSERT INTO vaults (id, kind, owner_user_id, partnership_id, key_check) VALUES
			('v-ada', 'self', 'ada', NULL, 'k'),
			('v-ada-jun', 'partnership', NULL, 'p-ada-jun', 'k'),
			('v-jun-kit', 'partnership', NULL, 'p-jun-kit', 'k');
	`);
	await client.execute('PRAGMA foreign_keys = ON');

	const schedule = JSON.stringify({ mode: 'rolling-window', limit: null });
	await client.executeMultiple(`
		INSERT INTO self_tasks (id, owner_id, active, credits_awarded, completion_message_count, ciphertext, vault_id, payload_version, revision, schedule, timezone_owner_user_id, last_completed_at, completed_count, next_eligible_at, created_at, updated_at) VALUES
			('t-own', 'ada', 1, 3, 2, 'sb1.own', 'v-ada', 1, 4, '${schedule}', 'ada', 100, 1, NULL, 20, 21);
		INSERT INTO partnership_tasks (id, partnership_id, created_by_user_id, timezone_owner_user_id, active, credits_awarded, completion_message_count, ciphertext, vault_id, payload_version, revision, schedule, last_completed_at, completed_count, next_eligible_at, created_at, updated_at) VALUES
			('t-for-jun', 'p-ada-jun', 'ada', 'jun', 0, 5, 0, 'sb1.forjun', 'v-ada-jun', 1, 0, '${schedule}', NULL, 0, 500, 22, 23),
			('t-for-jun-from-kit', 'p-jun-kit', 'kit', 'kit', 1, 1, 0, 'sb1.kit', 'v-jun-kit', 1, 0, '${schedule}', NULL, 0, NULL, 24, 25),
			('t-for-kit', 'p-jun-kit', 'jun', 'jun', 1, 1, 0, 'sb1.jun', 'v-jun-kit', 1, 0, '${schedule}', NULL, 0, NULL, 26, 27);
		INSERT INTO self_task_completions (id, owner_id, task_id, credits_awarded, completion_message_index, snapshot_ciphertext, snapshot_vault_id, snapshot_version, snapshot_record_id, previous_active, previous_next_eligible_at, previous_last_completed_at, created_at, updated_at) VALUES
			('c-own', 'ada', 't-own', 3, 1, 'sb1.ownold', 'v-ada', 1, 't-own', 1, NULL, NULL, 100, 100);
		INSERT INTO partnership_task_completions (id, partnership_id, task_id, completed_by_user_id, created_by_user_id, credits_awarded, completion_message_index, snapshot_ciphertext, snapshot_vault_id, snapshot_version, snapshot_record_id, previous_active, previous_next_eligible_at, previous_last_completed_at, created_at, updated_at) VALUES
			('c-jun', 'p-ada-jun', 't-for-jun', 'jun', 'ada', 5, NULL, 'sb1.forjunold', 'v-ada-jun', 1, 't-for-jun', NULL, NULL, NULL, 110, 110);
		INSERT INTO self_rewards (id, owner_id, cost, active, ciphertext, vault_id, payload_version, revision, created_at, updated_at) VALUES
			('r-own', 'ada', 4, 1, 'sb1.rown', 'v-ada', 1, 2, 30, 31);
		INSERT INTO partnership_rewards (id, partnership_id, created_by_user_id, cost, active, ciphertext, vault_id, payload_version, revision, created_at, updated_at) VALUES
			('r-for-jun', 'p-ada-jun', 'ada', 6, 0, 'sb1.rjun', 'v-ada-jun', 1, 0, 32, 33);
		INSERT INTO self_reward_claims (id, owner_id, reward_id, reward_cost, snapshot_ciphertext, snapshot_vault_id, snapshot_version, snapshot_record_id, created_at, updated_at) VALUES
			('k-own', 'ada', 'r-own', 4, 'sb1.rownold', 'v-ada', 1, 'r-own', 120, 120);
		INSERT INTO partnership_reward_claims (id, partnership_id, reward_id, claimed_by_user_id, created_by_user_id, reward_cost, snapshot_ciphertext, snapshot_vault_id, snapshot_version, snapshot_record_id, created_at, updated_at) VALUES
			('k-jun', 'p-ada-jun', 'r-for-jun', 'jun', 'ada', 6, 'sb1.rjunold', 'v-ada-jun', 1, 'r-for-jun', 130, 130);
		INSERT INTO self_reward_credits (id, owner_id, credits, created_at, updated_at) VALUES ('b-ada', 'ada', 7, 40, 41);
		INSERT INTO partnership_reward_credits (id, partnership_id, user_id, credits, created_at, updated_at) VALUES
			('b-jun', 'p-ada-jun', 'jun', 9, 42, 43), ('b-ada-shared', 'p-ada-jun', 'ada', 0, 44, 45);
	`);

	for (const sql of after) {
		await client.executeMultiple(sql);
	}

	const adaSolo = String(
		(
			await client.execute(`select m.space_id from space_members m join spaces s on s.id = m.space_id
				where s.kind = 'solo' and m.user_id = 'ada'`)
		).rows[0]?.space_id
	);
	const rows = async (sql: string) =>
		(await client?.execute(sql))?.rows.map((row) => ({ ...row })) ?? [];

	expect(
		await rows(
			'select id, space_id, created_by_user_id, assignee_user_id, timezone_owner_user_id, active, credits_awarded, completion_message_count, ciphertext, vault_id, payload_version, revision, schedule, last_completed_at, completed_count, next_eligible_at, created_at, updated_at from tasks order by id'
		)
	).toEqual([
		{
			id: 't-for-jun',
			space_id: 'p-ada-jun',
			created_by_user_id: 'ada',
			assignee_user_id: 'jun',
			timezone_owner_user_id: 'jun',
			active: 0,
			credits_awarded: 5,
			completion_message_count: 0,
			ciphertext: 'sb1.forjun',
			vault_id: 'v-ada-jun',
			payload_version: 1,
			revision: 0,
			schedule,
			last_completed_at: null,
			completed_count: 0,
			next_eligible_at: 500,
			created_at: 22,
			updated_at: 23
		},
		expect.objectContaining({
			id: 't-for-jun-from-kit',
			space_id: 'p-jun-kit',
			created_by_user_id: 'kit',
			assignee_user_id: 'jun'
		}),
		// Shared control: Jun's own task is Kit's to do, never Jun's.
		expect.objectContaining({
			id: 't-for-kit',
			space_id: 'p-jun-kit',
			created_by_user_id: 'jun',
			assignee_user_id: 'kit'
		}),
		{
			id: 't-own',
			space_id: adaSolo,
			created_by_user_id: 'ada',
			assignee_user_id: 'ada',
			timezone_owner_user_id: 'ada',
			active: 1,
			credits_awarded: 3,
			completion_message_count: 2,
			ciphertext: 'sb1.own',
			vault_id: 'v-ada',
			payload_version: 1,
			revision: 4,
			schedule,
			last_completed_at: 100,
			completed_count: 1,
			next_eligible_at: null,
			created_at: 20,
			updated_at: 21
		}
	]);

	expect(
		await rows(
			'select id, space_id, task_id, completed_by_user_id, created_by_user_id, credits_awarded, completion_message_index, snapshot_ciphertext, snapshot_vault_id, snapshot_version, snapshot_record_id, previous_active, created_at from task_completions order by id'
		)
	).toEqual([
		{
			id: 'c-jun',
			space_id: 'p-ada-jun',
			task_id: 't-for-jun',
			completed_by_user_id: 'jun',
			created_by_user_id: 'ada',
			credits_awarded: 5,
			completion_message_index: null,
			snapshot_ciphertext: 'sb1.forjunold',
			snapshot_vault_id: 'v-ada-jun',
			snapshot_version: 1,
			snapshot_record_id: 't-for-jun',
			previous_active: null,
			created_at: 110
		},
		{
			id: 'c-own',
			space_id: adaSolo,
			task_id: 't-own',
			completed_by_user_id: 'ada',
			created_by_user_id: 'ada',
			credits_awarded: 3,
			completion_message_index: 1,
			snapshot_ciphertext: 'sb1.ownold',
			snapshot_vault_id: 'v-ada',
			snapshot_version: 1,
			snapshot_record_id: 't-own',
			previous_active: 1,
			created_at: 100
		}
	]);

	expect(
		await rows(
			'select id, space_id, created_by_user_id, assignee_user_id, cost, active, ciphertext, vault_id, revision from rewards order by id'
		)
	).toEqual([
		{
			id: 'r-for-jun',
			space_id: 'p-ada-jun',
			created_by_user_id: 'ada',
			assignee_user_id: 'jun',
			cost: 6,
			active: 0,
			ciphertext: 'sb1.rjun',
			vault_id: 'v-ada-jun',
			revision: 0
		},
		{
			id: 'r-own',
			space_id: adaSolo,
			created_by_user_id: 'ada',
			assignee_user_id: 'ada',
			cost: 4,
			active: 1,
			ciphertext: 'sb1.rown',
			vault_id: 'v-ada',
			revision: 2
		}
	]);

	expect(
		await rows(
			'select id, space_id, reward_id, claimed_by_user_id, created_by_user_id, reward_cost, snapshot_ciphertext, snapshot_record_id from reward_claims order by id'
		)
	).toEqual([
		{
			id: 'k-jun',
			space_id: 'p-ada-jun',
			reward_id: 'r-for-jun',
			claimed_by_user_id: 'jun',
			created_by_user_id: 'ada',
			reward_cost: 6,
			snapshot_ciphertext: 'sb1.rjunold',
			snapshot_record_id: 'r-for-jun'
		},
		{
			id: 'k-own',
			space_id: adaSolo,
			reward_id: 'r-own',
			claimed_by_user_id: 'ada',
			created_by_user_id: 'ada',
			reward_cost: 4,
			snapshot_ciphertext: 'sb1.rownold',
			snapshot_record_id: 'r-own'
		}
	]);

	expect(
		await rows('select id, space_id, user_id, credits from reward_balances order by id')
	).toEqual([
		{ id: 'b-ada', space_id: adaSolo, user_id: 'ada', credits: 7 },
		{ id: 'b-ada-shared', space_id: 'p-ada-jun', user_id: 'ada', credits: 0 },
		{ id: 'b-jun', space_id: 'p-ada-jun', user_id: 'jun', credits: 9 }
	]);

	// And the old tables are gone.
	const left = await rows(
		"select name from sqlite_master where type = 'table' and (name like 'self\\_%' escape '\\' or name like 'partnership\\_%' escape '\\') order by name"
	);
	expect(left).toEqual([]);
});

test('each stored space colour moves to its nearest signature hue, and none is lost', async () => {
	client = createClient({ url: ':memory:' });
	const [before, after] = await migrationsSplitAt('0054_map_space_colours_to_signature_hues.sql');
	for (const sql of before) {
		await client.executeMultiple(sql);
	}

	// One shared space, a member per old colour and one who never chose.
	// Their solo spaces come from the trigger and keep a null colour.
	const old = ['teal', 'violet', 'blue', 'pink', 'green', 'lime', null];
	await client.execute("INSERT INTO spaces (id, kind) VALUES ('s', 'shared')");
	for (const [index, colour] of old.entries()) {
		await client.execute({
			sql: 'INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, 1, 1)',
			args: [`u${index}`, `U${index}`, `u${index}@example.test`]
		});
		await client.execute({
			sql: "INSERT INTO space_members (id, space_id, user_id, can_manage, colour) VALUES (?, 's', ?, 1, ?)",
			args: [`m${index}`, `u${index}`, colour]
		});
	}

	for (const sql of after) {
		await client.executeMultiple(sql);
	}

	const rows = await client.execute(
		"select user_id, colour from space_members where space_id = 's' order by user_id"
	);
	expect(rows.rows.map((row) => [row.user_id, row.colour])).toEqual([
		['u0', 'teal'],
		['u1', 'purple'],
		// Blue is your own space's now, so a partner who was blue is purple.
		['u2', 'purple'],
		['u3', 'pink'],
		['u4', 'green'],
		['u5', 'yellow'],
		['u6', null]
	]);
	const solo = await client.execute(
		"select count(*) as n from space_members where space_id != 's' and colour is not null"
	);
	expect(solo.rows[0]?.n).toBe(0);
});
