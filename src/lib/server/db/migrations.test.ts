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
