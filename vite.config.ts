import { existsSync } from 'node:fs';
import path from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { playwright } from '@vitest/browser-playwright';
import cloudflareDoExporter from 'sveltekit-cloudflare-do';
import { loadEnv } from 'vite';
import { defineConfig, type Plugin } from 'vitest/config';

const host: string | undefined = process.env.HOST;
const port: number = Number(process.env.PORT) || 58_769;

/**
 * Removes bare `import "devalue";` statements generated into server chunks by
 * SvelteKit/Rollup tree-shaking when no devalue exports are used in that chunk.
 * `devalue` has `"sideEffects": false`, so Wrangler's esbuild pass warns on it.
 */
function removeBareDevalueImport(): Plugin {
	return {
		name: 'remove-bare-devalue-import',
		generateBundle(_options, bundle) {
			for (const file of Object.values(bundle)) {
				if (file.type === 'chunk' && file.code.includes('devalue')) {
					file.code = file.code.replace(/import\s*["']devalue["'];?\n?/g, '');
				}
			}
		}
	};
}

/**
 * Keeps requests the component tests make from falling through to SvelteKit.
 *
 * Browser-mode component tests are served by Vitest's own Vite server, which
 * carries the `sveltekit()` plugin and so SvelteKit's dev middleware. Anything
 * Vite itself does not serve lands there, and SvelteKit's hooks cannot
 * initialise outside a real `vite dev`: the request drags on and logs a
 * `wrapDynamicImport` stack trace. Two kinds of request get that far, because a
 * real browser makes requests jsdom never did:
 *
 * - `fetch('/api/…')` from a component. The tests are written for "there is no
 *   server here, so the lookup fails" — this makes that true again, promptly.
 * - An `<img>` naming a picture the app does not ship, such as a fixture
 *   avatar URL. Pictures in `static/` are still served.
 *
 * Registered directly rather than from a returned function, so it runs before
 * SvelteKit's middleware, which is added post.
 */
function componentTestServer(): Plugin {
	return {
		name: 'component-test-server',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const { pathname } = new URL(req.url ?? '/', 'http://localhost');
				const isAppApi = pathname.startsWith('/api/');
				const isUnshippedImage =
					req.headers['sec-fetch-dest'] === 'image' &&
					!existsSync(path.join(server.config.root, 'static', pathname));
				if (!(isAppApi || isUnshippedImage)) {
					return next();
				}
				res.statusCode = 404;
				res.end();
			});
		}
	};
}

const getCloudflarePlugin = ({
	command,
	env
}: {
	command: string;
	// Not `Record<string, string>`: an unset variable is simply absent.
	env: Record<string, string | undefined>;
}) => {
	/*
    We only want to include this for `npm run dev` since we only need it providing a
    tunnel for `npm run dev` and it fails when building for the first time due to
    wrangler.jsonc referencing files that don't exist until after the build.
    */
	return command === 'serve'
		? cloudflare({
				/**
				 * We rely on the web Crypto API which is only avaliable when the site is
				 * accessed via HTTPS or localhost. That is an issue if we want to do dev
				 * testing on a seperate device like a phone. So a Cloudflare tunnel can
				 * be used to provide access over HTTPS.
				 */
				tunnel: {
					autoStart: env.CF_TUNNEL_AUTO_START?.toLowerCase() === 'true',
					name: env.CF_TUNNEL_NAME
				},
				/**
				 * Without this it will try to load the file listed in `main` but that won't
				 * exist until after running build for the first time. Cleared rather
				 * than deleted: the plugin only checks `!config.main`, which treats the
				 * worker as assets-only either way.
				 */
				config: (userConfig) => {
					userConfig.main = undefined;
				}
			})
		: undefined;
};

export default defineConfig(({ command, mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	return {
		plugins: [
			sveltekit(),
			removeBareDevalueImport(),
			/**
			 * Appends `export { RealtimeRoom }` to the worker the Cloudflare adapter
			 * generates.
			 *
			 * A Durable Object class has to be exported from the worker's own entry
			 * module, and the adapter generates that module — so there is nowhere in the
			 * source tree to write the export, and no hand-written file can take the
			 * module's place either, because the adapter treats `main` as its *output*
			 * path and `rimraf`s it before writing. Appending after the build is the
			 * one arrangement that leaves the entry where wrangler expects it, so plain
			 * `wrangler deploy` and `wrangler dev` stay correct — including the
			 * `npx wrangler deploy` that Cloudflare's deploy-on-push runs for us.
			 *
			 * The plugin reads the class names out of the file (rather than emitting
			 * `export *`) because wrangler only resolves `DurableObjectNamespace<T>` for
			 * named re-exports. A new class needs no change here, but does need adding
			 * to `durable_objects.bindings` and `exports` in wrangler.jsonc.
			 *
			 * `apply: 'build'` inside the plugin keeps it out of `vite dev` and vitest.
			 */
			cloudflareDoExporter({
				durableObjects: ['src/lib/server/realtime/durable-object.ts']
			}),
			getCloudflarePlugin({ command, env })
		],

		test: {
			projects: [
				{
					extends: './vite.config.ts',
					// `resolveBrowser: false` because that option ASSIGNS
					// `resolve.conditions` — an empty list when none were configured — which
					// wipes Vite's default client conditions, `browser` among them. Svelte's
					// package.json falls back to its server build without `browser`, so every
					// mount failed with "`mount(...)` is not available on the server". The
					// option only existed to steer jsdom's Node resolution toward the client
					// build; a real browser resolves that way already.
					plugins: [svelteTesting({ resolveBrowser: false }), componentTestServer()],

					test: {
						name: 'client',
						clearMocks: true,
						include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
						exclude: ['src/lib/server/**'],
						setupFiles: ['./vitest-setup-browser.ts'],
						browser: {
							enabled: true,
							headless: true,
							provider: playwright({
								launchOptions: {
									// Hermetic: every host but localhost goes to 192.0.2.1, a reserved
									// address nothing answers on. A real browser actually loads the
									// iframes these tests render — redgifs, reddit — which jsdom never
									// did, and a unit test must neither depend on the network nor pull
									// third-party content into CI.
									//
									// A black hole rather than `~NOTFOUND` on purpose: a failed lookup
									// fires the frame's `load` at once (on Chromium's error page), which
									// races every assertion about the state before a player loads. A
									// connection that never completes never loads, so each test decides
									// when `load` happens — the same guarantee jsdom gave.
									args: ['--host-resolver-rules=MAP * 192.0.2.1, EXCLUDE localhost']
								}
							}),
							instances: [{ browser: 'chromium' }],
							// Desktop-sized, because Vitest's default frame is phone-sized and the
							// app has real breakpoints: under 640px an embed opens in a dialog
							// instead of framing inline (see NARROW_EMBED_MEDIA_QUERY in
							// UrlEmbed.svelte). A test that wants the narrow layout asks for it.
							viewport: { width: 1280, height: 800 },
							screenshotFailures: false
						}
					}
				},
				{
					extends: './vite.config.ts',

					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
					}
				}
			]
		},

		optimizeDeps: {
			/**
			 * Pre-bundled because nothing imports them statically.
			 *
			 * `src/lib/crypto/identity.ts` reaches both through `await import()`, on
			 * purpose — age-encryption drags in ML-KEM for a feature this app never
			 * uses, and the login and signup pages must not pay for it. But that also
			 * hides them from Vite's dependency scan, so the first thread anyone opens
			 * triggers a *"Forced re-optimization of dependencies"* mid-session, and
			 * Vite tells every connected client to reload.
			 *
			 * A reload landing on an in-flight form submit loses it, with no request
			 * made and no error anywhere — which showed up as the Playwright suite
			 * failing about one run in three, always on whichever test followed the
			 * first dynamic import. Listing them here moves the work to server start.
			 *
			 * `@simplewebauthn/browser` is imported statically, but it is also a
			 * dependency of `@better-auth/passkey`, which Vite had already bundled on
			 * its own terms; listing it keeps the direct import from being discovered
			 * as a second, new dependency mid-run.
			 */
			include: [
				'age-encryption',
				'@js-temporal/polyfill',
				'@scure/base',
				'html2canvas-pro',
				'@simplewebauthn/browser'
			]
		},

		server: {
			host,
			port,
			// Overridable so the Playwright suite can run against localhost: with the
			// tunnel host baked in, a page served from 127.0.0.1 asks the tunnel for
			// its modules and never hydrates.
			origin: process.env.VITE_DEV_ORIGIN
		}
	};
});
