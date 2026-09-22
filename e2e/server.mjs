// Playwright's `webServer` command: holds this checkout's e2e lock, rebuilds the
// run's database from the committed migrations, then runs `vite dev`.
//
// Why a lock at all: the port and run directory are derived from the checkout
// path (see `e2e/run-paths.ts`), so a second run in the SAME checkout gets the
// same ones — and would start by deleting the first run's database. Separate
// worktrees get separate paths and never contend.
//
// Why here and not a quick check up front: a check that exits leaves nothing
// held while the database is rebuilt and vite starts, and a second run landing
// in those seconds would pass it. This process lives exactly as long as the
// server, so holding the lock in it covers the whole run.
//
// Why a Unix socket rather than a lock file: the OS closes the socket however
// this process dies, including SIGKILL. What is left behind is only the socket
// file, and a stale one is told apart from a live one by trying to connect to
// it — nothing is listening on a stale one.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, unlinkSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';

const { E2E_PORT, E2E_RUN_DIR, E2E_MEDIA_DIR, E2E_LOCK_PATH } = process.env;
if (!E2E_PORT || !E2E_RUN_DIR || !E2E_MEDIA_DIR || !E2E_LOCK_PATH) {
	console.error('e2e/server.mjs is started by playwright.config.ts, which sets its environment.');
	process.exit(2);
}

function refuse() {
	console.error(
		'\nAn e2e run is already in progress in this checkout.\n' +
			'Wait for it to finish, or run the suite from a separate git worktree.\n'
	);
	process.exit(1);
}

/** Resolves once this process holds the lock; exits if another run does. */
function acquireLock() {
	return new Promise((resolve) => {
		const lock = createServer();
		lock.once('error', (error) => {
			if (error.code !== 'EADDRINUSE') throw error;
			const probe = createConnection(E2E_LOCK_PATH);
			probe.once('connect', () => {
				probe.destroy();
				refuse();
			});
			probe.once('error', () => {
				// Nothing answered, so the owner died without cleaning up.
				unlinkSync(E2E_LOCK_PATH);
				resolve(acquireLock());
			});
		});
		lock.listen(E2E_LOCK_PATH, () => resolve(lock));
	});
}

function run(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: 'inherit' });
		child.once('error', reject);
		child.once('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`))
		);
	});
}

const lock = await acquireLock();
// Removes the socket file on a graceful exit. Playwright's own teardown kills
// this process outright, so the file is usually left behind anyway — which is
// fine, because the connect probe in acquireLock() reclaims a dead one.
process.on('exit', () => lock.close());

// Rebuilt from empty so a failure never depends on what ran last. Deliberately
// not removed afterwards: the next run wipes it, and until then the database is
// there to inspect.
rmSync(E2E_RUN_DIR, { recursive: true, force: true });
mkdirSync(E2E_MEDIA_DIR, { recursive: true });
await run('npx', ['drizzle-kit', 'migrate']);

const vite = spawn('npx', ['vite', 'dev', '--port', E2E_PORT, '--strictPort'], {
	stdio: 'inherit'
});
for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => vite.kill(signal));
}
vite.once('exit', (code) => process.exit(code ?? 1));
