import { type Browser, test as base, type Page } from '@playwright/test';

/**
 * The one net the suite did not have: browser-engine diagnostics.
 *
 * Neither the component tests (then on jsdom, where `wa-*` elements never
 * upgraded) nor these specs asserted on the browser console, so a `pattern` attribute that
 * Chromium cannot compile — Zod's `z.email()` regex, invalid under the `v` flag
 * pattern attributes are compiled with — shipped while logging
 * "Unable to check <input pattern=…> because … is not a valid regexp" on every
 * login page load. The inputs still worked (an uncompilable pattern is
 * ignored, and the server re-validates with Zod), so no behaviour assertion
 * could fail either.
 *
 * This fixture wraps `browser` so that every context the tests create — the
 * default `page` fixture goes through `browser.newContext()` too — gets its
 * pages watched. Any console warning or error, or any uncaught `pageerror`, is
 * collected, and fails the test that was running when it arrived — checked at
 * that test's teardown, so it can no longer break the steps that follow.
 *
 * The collection is per test rather than per worker because the suite runs in
 * parallel: a worker serves several spec files, so a worker-level report could
 * only say "somewhere in these files". Anything that lands after a worker's
 * last test has been checked (a context closed lazily, a late `pageerror`) is
 * still reported, at worker teardown, rather than silently dropped.
 *
 * Two deliberate exclusions:
 *
 * - "Failed to load resource" is Chromium's network log, not script output.
 *   Several specs intentionally provoke 401/404 responses, and those belong to
 *   the assertions that check them, not to this net.
 * - Lit logs a dev-mode banner under `vite dev`, which is the server Playwright
 *   runs against. That is environment noise rather than an app regression, so
 *   the watcher ignores it instead of making every e2e run fail by design.
 * - Chromium logs a WebGL performance warning when the landing page's halftone
 *   overlay reads back its canvas. That readback is deliberate — the overlay's
 *   own e2e assertion depends on it — and the warning is browser noise rather
 *   than a functional failure.
 * - A message from a context a previous test left open lazily is blamed on the
 *   test running when it arrives. That is rare, and the text itself names the
 *   page, so it is still enough to act on.
 *
 * `browser.newPage()` would bypass the proxy — it creates its context
 * server-side — but nothing in the suite calls it; if a spec ever does, route
 * it through `newContext().newPage()` instead.
 */

const IGNORED = [
	/^Failed to load resource/,
	/^Lit is in dev mode\. Not recommended for production!/,
	/^\[\.WebGL-[^\]]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/
];
const FAILING_CONSOLE_TYPES = new Set(['warning', 'error']);

function report(where: string, diagnostics: string[]): Error {
	return new Error(
		`Browser reported diagnostics during ${where}:\n${[...new Set(diagnostics)]
			.map((text) => `  - ${text}`)
			.join('\n')}`
	);
}

type WorkerFixtures = { diagnostics: { all: string[]; reported: number } };

export const test = base.extend<{ checkDiagnostics: undefined }, WorkerFixtures>({
	diagnostics: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies off the source text of its first parameter's destructuring pattern, so a fixture with none must still spell out `{}`.
		async ({}, use) => {
			const diagnostics = { all: [] as string[], reported: 0 };
			await use(diagnostics);
			const unreported = diagnostics.all.slice(diagnostics.reported);
			// Thrown from worker teardown, so the run still fails on anything that
			// arrived after the last test's own check.
			if (unreported.length > 0) {
				throw report('this worker, after its last test', unreported);
			}
		},
		{ scope: 'worker' }
	],

	browser: [
		async ({ browser, diagnostics }, use) => {
			function watchPage(page: Page) {
				page.on('console', (message) => {
					if (!FAILING_CONSOLE_TYPES.has(message.type())) {
						return;
					}
					const text = message.text();
					if (IGNORED.some((pattern) => pattern.test(text))) {
						return;
					}
					diagnostics.all.push(`${message.type()}: ${text}`);
				});
				page.on('pageerror', (error) => diagnostics.all.push(`pageerror: ${String(error)}`));
			}

			const watched = new Proxy(browser, {
				get(target, prop, receiver) {
					if (prop === 'newContext') {
						return async (...args: Parameters<Browser['newContext']>) => {
							const context = await target.newContext(...args);
							context.on('page', watchPage);
							return context;
						};
					}
					return Reflect.get(target, prop, receiver);
				}
			});

			await use(watched);
		},
		{ scope: 'worker' }
	],

	checkDiagnostics: [
		async ({ diagnostics }, use) => {
			diagnostics.reported = diagnostics.all.length;
			await use(undefined);
			const fresh = diagnostics.all.slice(diagnostics.reported);
			diagnostics.reported = diagnostics.all.length;
			// Thrown from test teardown, so the test fails with the messages even
			// though every behavioural assertion in it passed.
			if (fresh.length > 0) {
				throw report('this test', fresh);
			}
		},
		{ auto: true }
	]
});
