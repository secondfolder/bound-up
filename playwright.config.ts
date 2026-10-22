import { defineConfig, devices } from '@playwright/test';
import {
	E2E_BASE_URL,
	E2E_DATABASE_URL,
	E2E_LOCK_PATH,
	E2E_MEDIA_DIR,
	E2E_MODEL_PORT,
	E2E_PORT,
	E2E_RUN_DIR
} from './e2e/run-paths';

/**
 * End-to-end coverage of the partner invite flow.
 *
 * The vitest suites call loads and actions directly, which cannot see the
 * things that only exist over HTTP: the auth hook, real session cookies, the
 * `(auth-required)` group guard, and the round trip through /signup that an
 * invite link has to survive. That is what these are for.
 *
 * Runs against the self-hosted Node build on a port and a SQLite file of its
 * own, both derived from the checkout path (see `e2e/run-paths.ts`), so a local
 * `local.db` is never touched and runs in separate worktrees never touch each
 * other. With `E2E_DEV` set it runs against `vite dev` instead, with
 * `E2E_IMAGE` set against that Docker image, and with `E2E_WORKER` set against
 * the built worker under `wrangler dev` — see `e2e/server.mjs`.
 */

export default defineConfig({
	testDir: 'e2e',
	// Parallel is safe because every test is data-isolated rather than
	// database-isolated: `account()` mints a fresh email per person, and each
	// person gets their own browser context. Nothing asserts on global state —
	// "you have no partners yet" is always about an account made in that test.
	workers: process.env.CI ? 2 : 4,
	// `fullyParallel` is also what lets CI's `--shard` split the suite by test
	// rather than by file.
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	// Generous for `vite dev` (`E2E_DEV`), which compiles each route the first
	// time it is requested — the first pass through a flow pays for every
	// screen in it.
	timeout: 90_000,
	expect: { timeout: 15_000 },
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: E2E_BASE_URL,
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	// After the web server is up, which is what lets it write the server's
	// settings into the database the server has just made.
	globalSetup: './e2e/global-setup.ts',
	webServer: {
		// A script rather than a shell one-liner so it can hold this checkout's
		// lock for as long as the server runs — see the header of e2e/server.mjs.
		//
		// The database is rebuilt in the server command rather than in a
		// globalSetup, because Playwright starts the web server FIRST: its health
		// check opens the SQLite file, and deleting it afterwards left every
		// write failing with SQLITE_READONLY_DBMOVED.
		command: 'node e2e/server.mjs',
		url: E2E_BASE_URL,
		reuseExistingServer: false,
		stdout: 'pipe',
		stderr: 'pipe',
		// A Workers run builds the app first, which takes a few minutes; the
		// default run builds the Node server, which takes under one. Only an
		// upper bound: `vite dev` and an already-built image are up in seconds.
		timeout: process.env.E2E_WORKER ? 600_000 : 300_000,
		// So that `e2e/server.mjs` gets to `docker stop` the container in image
		// mode, rather than being killed and leaving it running. Harmless for
		// `vite dev`, which it forwards the signal to.
		gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
		env: {
			E2E_PORT: String(E2E_PORT),
			E2E_MODEL_PORT: String(E2E_MODEL_PORT),
			E2E_RUN_DIR,
			E2E_MEDIA_DIR,
			E2E_LOCK_PATH,
			DATABASE_URL: E2E_DATABASE_URL,
			// Without this, attachments go to the repo's shared ./local-media, where
			// concurrent runs — and `npm run dev` — would all write.
			MEDIA_DIR: E2E_MEDIA_DIR,
			// The stand-in model providers (`e2e/model-stub.mjs`), which
			// `e2e/server.mjs` starts. The keys and models that go with them are
			// server settings, written by `e2e/global-setup.ts`; the image is
			// pointed at the stub through the Docker host instead.
			OPENROUTER_BASE_URL: `http://127.0.0.1:${E2E_MODEL_PORT}/v1`,
			RUNWARE_BASE_URL: `http://127.0.0.1:${E2E_MODEL_PORT}/runware`,
			// vite.config.ts points `server.origin` at a personal dev tunnel, which
			// would make the page ask localhost for its assets over that hostname.
			VITE_DEV_ORIGIN: E2E_BASE_URL,
			// Under `vite dev`: so that editing a file mid-run does not hot-update or
			// reload every open test page: a reload during sign-in throws away the
			// key stash and one mid-flow loses a half-filled form, and the failures
			// that left looked like flakiness in whichever flow it landed on.
			// Server-side code still picks up the edit, so a `vite dev` run is only
			// fully isolated from them in a worktree of its own. The built server
			// (the default) has no watcher at all.
			NO_HMR: '1',
			// Set to run the suite against `vite dev` instead of the built server
			// (`npm run test:e2e:dev`).
			...(process.env.E2E_DEV ? { E2E_DEV: process.env.E2E_DEV } : {}),
			// Set to a Docker image to run the suite against it instead
			// (`npm run test:e2e:image`; CI does this for every build).
			...(process.env.E2E_IMAGE ? { E2E_IMAGE: process.env.E2E_IMAGE } : {}),
			// Set to run it against the built worker under `wrangler dev` instead
			// (`npm run test:e2e:worker`).
			...(process.env.E2E_WORKER ? { E2E_WORKER: process.env.E2E_WORKER } : {})
		}
	}
});
