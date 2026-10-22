import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@libsql/client';
import { withLiterals } from '../src/lib/testing/sql-literals';
import { E2E_BASE_URL, E2E_CONTAINER, E2E_DATABASE_URL, e2eTarget } from './run-paths';

type Value = string | number | null;
export type Rows = { rows: Record<string, unknown>[] };

/**
 * Runs one statement against this run's database, for the few specs that set
 * up or check state no UI reaches.
 *
 * Against `vite dev` that is the SQLite file in the run directory, opened from
 * here. Against a Docker image (`E2E_IMAGE`) it is run INSIDE the container,
 * on the container's own volume, through its own libsql. The obvious
 * alternative — bind-mount the run directory and open the file from both
 * sides — worked on Linux but not under Docker Desktop on macOS, where the
 * file crosses into a VM: writes from one side went unseen by the other and
 * the server's own inserts failed with `SQLITE_IOERR_DELETE_NOENT`. SQLite's
 * locking only holds when one kernel sees every handle on the file.
 *
 * Against the built worker (`E2E_WORKER`) it goes through the worker's own
 * runtime, by wrangler's local explorer API, not by opening the D1 file from
 * here. workerd's SQLite does not wait on another process's lock, so the
 * server's own writes failed with `SQLITE_BUSY` whenever a spec wrote at the
 * same moment, which four workers in parallel made routine.
 */
export async function sql(statement: string, args: Value[] = []): Promise<Rows> {
	switch (e2eTarget()) {
		case 'image':
			return await inContainer(statement, args);
		case 'worker':
			return await inWorker(statement, args);
		default:
			return await onHost(E2E_DATABASE_URL, statement, args);
	}
}

const EXPLORER = `${E2E_BASE_URL}/cdn-cgi/local/explorer/api/d1/database`;
let databaseId: Promise<string> | undefined;

/** The id wrangler gave the `DB` binding, looked up once per worker process. */
function workerDatabaseId(): Promise<string> {
	databaseId ??= (async () => {
		const response = await fetch(EXPLORER);
		const body = (await response.json()) as { result: { name: string; uuid: string }[] };
		const database = body.result.find((candidate) => candidate.name === 'DB');
		if (!database) {
			throw new Error(`wrangler dev has no D1 database bound as DB: ${JSON.stringify(body)}`);
		}
		return database.uuid;
	})();
	return databaseId;
}

async function inWorker(statement: string, args: Value[]): Promise<Rows> {
	const response = await fetch(`${EXPLORER}/${await workerDatabaseId()}/raw`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ sql: withLiterals(statement, args) })
	});
	const body = (await response.json()) as {
		success: boolean;
		errors: unknown[];
		result?: { results: { columns: string[]; rows: unknown[][] } }[];
	};
	const [result] = body.result ?? [];
	if (!(body.success && result)) {
		throw new Error(`The worker's D1 refused ${statement}: ${JSON.stringify(body.errors)}`);
	}
	const { columns, rows } = result.results;
	return {
		rows: rows.map((row) =>
			Object.fromEntries(columns.map((column, index) => [column, row[index]]))
		)
	};
}

async function onHost(url: string, statement: string, args: Value[]): Promise<Rows> {
	const client = createClient({
		url,
		// Other workers are writing through the dev server meanwhile; wait out a
		// lock rather than fail with SQLITE_BUSY.
		timeout: 5000
	});
	try {
		const result = await client.execute({ sql: statement, args });
		return { rows: result.rows.map((row) => ({ ...row })) };
	} finally {
		client.close();
	}
}

const run = promisify(execFile);

// Reads the statement from argv rather than interpolating it into the source,
// so no quoting in a statement can change what runs. BigInts (a `count(*)`)
// come back as numbers, which is what the host path gives for the same query.
const IN_CONTAINER = `
import { createClient } from '@libsql/client';
const [statement, args] = JSON.parse(process.argv[1]);
const client = createClient({ url: process.env.DATABASE_URL, timeout: 5000 });
const result = await client.execute({ sql: statement, args });
client.close();
process.stdout.write(JSON.stringify(result.rows.map((row) => ({ ...row })), (_, value) =>
	typeof value === 'bigint' ? Number(value) : value
));
`;

async function inContainer(statement: string, args: Value[]): Promise<Rows> {
	const { stdout } = await run('docker', [
		'exec',
		E2E_CONTAINER,
		'node',
		'--input-type=module',
		'-e',
		IN_CONTAINER,
		JSON.stringify([statement, args])
	]);
	return { rows: JSON.parse(stdout) as Record<string, unknown>[] };
}
