import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@libsql/client';
import { E2E_CONTAINER, E2E_DATABASE_URL } from './run-paths';

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
 */
export async function sql(statement: string, args: Value[] = []): Promise<Rows> {
	return process.env.E2E_IMAGE ? await inContainer(statement, args) : await onHost(statement, args);
}

async function onHost(statement: string, args: Value[]): Promise<Rows> {
	const client = createClient({
		url: E2E_DATABASE_URL,
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
