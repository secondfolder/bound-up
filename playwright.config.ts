import { defineConfig, devices } from '@playwright/test';
import {
	E2E_BASE_URL,
	E2E_DATABASE_URL,
	E2E_LOCK_PATH,
	E2E_MEDIA_DIR,
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
 * Runs against `vite dev` on a port and a SQLite file of its own, both derived
 * from the checkout path (see `e2e/run-paths.ts`), so a local `local.db` is
 * never touched and runs in separate worktrees never touch each other.
 */

export default defineConfig({
	testDir: 'e2e',
	// Parallel is safe because every test is data-isolated rather than
	// database-isolated: `account()` mints a fresh email per person, and each
	// person gets their own browser context. Nothing asserts on global state —
	// "you have no partners yet" is always about an account made in that test.
	// One shared server also means one shared, warm route-compile cache.
	workers: process.env.CI ? 2 : 4,
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	// Generous because these run against `vite dev`, which compiles each route
	// the first time it is requested — the first pass through a flow pays for
	// every screen in it.
	timeout: 90_000,
	expect: { timeout: 15_000 },
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: E2E_BASE_URL,
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
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
		timeout: 120_000,
		env: {
			E2E_PORT: String(E2E_PORT),
			E2E_RUN_DIR,
			E2E_MEDIA_DIR,
			E2E_LOCK_PATH,
			DATABASE_URL: E2E_DATABASE_URL,
			// Without this, attachments go to the repo's shared ./local-media, where
			// concurrent runs — and `npm run dev` — would all write.
			MEDIA_DIR: E2E_MEDIA_DIR,
			// hooks.server.ts throws without this rather than letting Better Auth
			// fall back to its hard-coded default.
			BETTER_AUTH_SECRET: 'e2e-secret-not-used-anywhere-else',
			// vite.config.ts points `server.origin` at a personal dev tunnel, which
			// would make the page ask localhost for its assets over that hostname.
			VITE_DEV_ORIGIN: E2E_BASE_URL
		}
	}
});
