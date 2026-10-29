// Playwright's `webServer` command: holds this checkout's e2e lock, rebuilds the
// run's database from the committed migrations, then builds the self-hosted
// Node server (`npm run build:node`) and runs it on the host, through the same
// entrypoint the Docker image uses.
//
// The built server rather than `vite dev`, because `vite dev` was the run's
// bottleneck: one process compiling and server-rendering every route on
// demand, so eight workers finished no sooner than four, and failed more. It
// also reloaded every open page when a file changed under it mid-run — an
// edit, a `svelte-kit sync`, a dependency re-optimization — which surfaced as
// flaky failures in whichever flow it landed on. A built server has no
// watcher to do that.
//
// With `E2E_DEV` set (`npm run test:e2e:dev`) it runs `vite dev` instead: no
// build to wait for, and the development builds of Svelte and Lit, whose
// warnings the fixture fails a test on and which a production build never
// prints.
//
// With `E2E_IMAGE` set (`npm run test:e2e:image`, and CI) it runs that Docker
// image instead, on two fresh named volumes laid out exactly as a
// self-hoster's are. The container applies the migrations itself on start, and
// the specs that need the database reach it through `docker exec` (see
// `e2e/db.ts` for why not a bind mount). See docs/self-hosting.md.
//
// With `E2E_WORKER` set (`npm run test:e2e:worker`) it builds the app for
// Cloudflare and runs the built worker under `wrangler dev`: the real workerd
// runtime, the real Durable Object, local D1 and R2 kept in the run directory.
// See `serveWorker` below and docs/development.md.
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
import { mkdirSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { e2eSettings, UPSERT_SETTING } from './settings.mjs';

const {
	E2E_PORT,
	E2E_MODEL_PORT,
	E2E_RUN_DIR,
	E2E_MEDIA_DIR,
	E2E_LOCK_PATH,
	E2E_IMAGE,
	E2E_WORKER,
	E2E_DEV
} = process.env;
if (!(E2E_PORT && E2E_MODEL_PORT && E2E_RUN_DIR && E2E_MEDIA_DIR && E2E_LOCK_PATH)) {
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

// The stand-in model provider for the Daydreams specs (`e2e/model-stub.mjs`).
// Inside the lock, like the database: its port is per checkout too. A
// container reaches it through the host's gateway address rather than
// loopback, so in image mode it listens on every interface.
const modelStub = spawn('node', ['e2e/model-stub.mjs'], {
	stdio: 'inherit',
	env: { ...process.env, E2E_MODEL_HOST: E2E_IMAGE ? '0.0.0.0' : '127.0.0.1' }
});
process.on('exit', () => modelStub.kill());

if (E2E_IMAGE) {
	await serveImage(E2E_IMAGE);
} else if (E2E_WORKER) {
	await serveWorker();
} else if (E2E_DEV) {
	await serveVite();
} else {
	await serveNode();
}

/** Stops `child` with this process, and this process with `child`. */
function forward(child) {
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => child.kill(signal));
	}
	child.once('exit', (code) => process.exit(code ?? 1));
}

async function serveVite() {
	await run('npx', ['drizzle-kit', 'migrate']);
	forward(
		spawn('npx', ['vite', 'dev', '--port', E2E_PORT, '--strictPort'], {
			stdio: 'inherit'
		})
	);
}

/**
 * Builds the self-hosted server and runs it the way the image does, by its
 * entrypoint, which applies the migrations and then starts `build/`. The
 * database, media and outbox are files in the run directory, as under
 * `vite dev`, so specs reach them from the host.
 *
 * Built on every run: a stale `build/` would test code that is not in the
 * checkout, and the build costs less than the route compiles `vite dev`
 * spread over the run.
 */
async function serveNode() {
	await run('npm', ['run', 'build:node']);
	forward(
		spawn('node', ['scripts/docker-entrypoint.mjs'], {
			stdio: 'inherit',
			env: {
				...process.env,
				NODE_ENV: 'production',
				PORT: E2E_PORT,
				// Not adapter-node's default of every interface: a server with the
				// sign-in limit off has no business on the LAN. `localhost` rather
				// than 127.0.0.1 because it is what the specs ask for, and on macOS
				// that resolves to ::1 first — `vite dev` binds the same way.
				HOST: 'localhost',
				ORIGIN: `http://localhost:${E2E_PORT}`,
				// The image's value, which the attachment specs need; see the
				// Dockerfile.
				BODY_SIZE_LIMIT: '32M',
				// As for the image: every test signs up from one address, many times
				// a minute, which the sign-in limit would refuse.
				AUTH_RATE_LIMIT: 'off'
			}
		})
	);
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
			// The model stub on the host, whose keys `e2e/global-setup.ts` sets.
			// `host-gateway` makes the name resolve on Linux as well, where Docker
			// does not add it itself.
			'--add-host',
			'host.docker.internal:host-gateway',
			'--env',
			`OPENROUTER_BASE_URL=http://host.docker.internal:${E2E_MODEL_PORT}/v1`,
			'--env',
			`RUNWARE_BASE_URL=http://host.docker.internal:${E2E_MODEL_PORT}/runware`,
			'--env',
			`FISH_AUDIO_BASE_URL=http://host.docker.internal:${E2E_MODEL_PORT}/fish`,
			// Every test signs up from the same address, many times a minute; the
			// sign-in limit would refuse most of them. `vite dev` has it off for
			// the same reason. scripts/docker-smoke.sh checks the limit instead.
			'--env',
			'AUTH_RATE_LIMIT=off',
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

/**
 * Builds the worker and runs it under `wrangler dev`, on this run's port.
 *
 * Its D1 and R2 live under the run directory (`--persist-to`), so every run
 * starts from the committed migrations. The specs reach that D1 through the
 * worker's own runtime, not the file (`e2e/db.ts` says why); only the settings
 * below are written to the file, before anything else has it open.
 *
 * The settings are written before the worker starts, not only by the
 * globalSetup afterwards: on Workers they are cached per isolate for a minute
 * (docs/server-settings.md), so a worker that read them before the globalSetup
 * ran would go on without mail or models for that long.
 *
 * Mail goes through Resend's real code path to the stub (`RESEND_BASE_URL`),
 * since Resend is the only transport a worker has. `--env-file` names an
 * empty file so the developer's own `.dev.vars` (a tunnel, an old secret) never
 * reaches the run; everything the run needs is passed with `--var`.
 */
async function serveWorker() {
	const state = join(E2E_RUN_DIR, 'wrangler');
	mkdirSync(state, { recursive: true });
	await run('npm', ['run', 'build']);
	await run('npx', [
		'wrangler',
		'd1',
		'migrations',
		'apply',
		'DB',
		'--local',
		'--persist-to',
		state
	]);

	const d1 = join(state, 'v3', 'd1', 'miniflare-D1DatabaseObject');
	const [file] = readdirSync(d1).filter(
		(name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite'
	);
	const client = createClient({ url: `file:${join(d1, file)}` });
	for (const [key, value] of Object.entries(e2eSettings({ target: 'worker', outboxDir: '' }))) {
		await client.execute({ sql: UPSERT_SETTING, args: [key, value] });
	}
	client.close();

	const noVars = join(E2E_RUN_DIR, 'no.dev.vars');
	writeFileSync(noVars, '');
	const stub = `http://127.0.0.1:${E2E_MODEL_PORT}`;
	const worker = spawn(
		'npx',
		[
			'wrangler',
			'dev',
			'--port',
			E2E_PORT,
			'--persist-to',
			state,
			'--env-file',
			noVars,
			'--show-interactive-dev-session=false',
			// Otherwise the worker sees the production route's host as its own
			// (wrangler.jsonc's `routes`), and Better Auth builds every emailed link
			// for that host instead of this run's.
			'--local-upstream',
			`localhost:${E2E_PORT}`,
			'--var',
			`OPENROUTER_BASE_URL:${stub}/v1`,
			'--var',
			`RUNWARE_BASE_URL:${stub}/runware`,
			'--var',
			`FISH_AUDIO_BASE_URL:${stub}/fish`,
			'--var',
			`RESEND_BASE_URL:${stub}/resend`,
			// As for the image: every test signs up from one address, many times a
			// minute, which the sign-in limit would refuse.
			'--var',
			'AUTH_RATE_LIMIT:off'
		],
		{ stdio: 'inherit' }
	);
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => worker.kill(signal));
	}
	worker.once('exit', (code) => process.exit(code ?? 1));
}
