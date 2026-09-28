// Playwright's `webServer` command: holds this checkout's e2e lock, rebuilds the
// run's database from the committed migrations, then runs `vite dev`.
//
// With `E2E_IMAGE` set (`npm run test:e2e:image`, and CI) it runs that Docker
// image instead, on two fresh named volumes laid out exactly as a
// self-hoster's are. The container applies the migrations itself on start, and
// the specs that need the database reach it through `docker exec` (see
// `e2e/db.ts` for why not a bind mount). See docs/self-hosting.md.
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

const { E2E_PORT, E2E_RUN_DIR, E2E_MEDIA_DIR, E2E_LOCK_PATH, E2E_IMAGE } = process.env;
if (!(E2E_PORT && E2E_RUN_DIR && E2E_MEDIA_DIR && E2E_LOCK_PATH)) {
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
			if (error.code !== 'EADDRINUSE') {
				throw error;
			}
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

/** Runs a command to completion. `quiet` also tolerates it failing. */
function run(command, args, { quiet = false } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: quiet ? 'ignore' : 'inherit' });
		child.once('error', reject);
		child.once('exit', (code) =>
			code === 0 || quiet
				? resolve()
				: reject(new Error(`${command} ${args.join(' ')} exited ${code}`))
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

if (E2E_IMAGE) {
	await serveImage(E2E_IMAGE);
} else {
	await run('npx', ['drizzle-kit', 'migrate']);

	const vite = spawn('npx', ['vite', 'dev', '--port', E2E_PORT, '--strictPort'], {
		stdio: 'inherit'
	});
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => vite.kill(signal));
	}
	vite.once('exit', (code) => process.exit(code ?? 1));
}

/**
 * Runs the image in the foreground on this run's port, with volumes of its own.
 *
 * Named after the port, which is per checkout, so a container orphaned by a
 * killed run is found and removed by the next one: `--rm` only fires when
 * the container stops, and a SIGKILL to this process stops the `docker run`
 * client, not the container. playwright.config.ts asks for SIGTERM first,
 * which is what `docker stop` below answers.
 *
 * The volumes are wiped here, like the run directory above, and likewise kept
 * afterwards for inspecting (`docker run --rm -v <name>-db:/d alpine ls /d`).
 * Mounted at the image's own `/data/db` and `/data/media`, which is what gives
 * a fresh volume the image's ownership of them.
 */
async function serveImage(image) {
	// `E2E_CONTAINER` in run-paths.ts, which `e2e/db.ts` execs into; this .mjs
	// cannot import that .ts on every Node the engines field allows.
	const name = `bound-up-e2e-${E2E_PORT}`;
	await run('docker', ['rm', '--force', name], { quiet: true });
	await run('docker', ['volume', 'rm', '--force', `${name}-db`, `${name}-media`], {
		quiet: true
	});

	const container = spawn(
		'docker',
		[
			'run',
			'--rm',
			'--name',
			name,
			'--publish',
			`127.0.0.1:${E2E_PORT}:3000`,
			'--volume',
			`${name}-db:/data/db`,
			'--volume',
			`${name}-media:/data/media`,
			'--env',
			'BETTER_AUTH_SECRET',
			'--env',
			`ORIGIN=http://localhost:${E2E_PORT}`,
			image
		],
		{ stdio: 'inherit' }
	);
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => {
			spawn('docker', ['stop', '--time', '5', name], { stdio: 'ignore' }).once('exit', () =>
				process.exit(0)
			);
		});
	}
	container.once('exit', (code) => process.exit(code ?? 1));
}
