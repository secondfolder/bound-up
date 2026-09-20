import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import cloudflareDoExporter from 'sveltekit-cloudflare-do';
import { defineConfig, type Plugin } from 'vitest/config';
import { cloudflare } from '@cloudflare/vite-plugin';
import { loadEnv } from 'vite';

const host: string | undefined = process.env.HOST;
const port: number = Number(process.env.PORT) || 58769;

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

const getCloudflarePlugin = ({
	command,
	env
}: {
	command: string;
	env: Record<string, string>;
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
				 * exist until after running build for the first time.
				 */
				config: (userConfig) => {
					delete userConfig.main;
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
					plugins: [svelteTesting()],

					test: {
						name: 'client',
						environment: 'jsdom',
						clearMocks: true,
						include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
						exclude: ['src/lib/server/**'],
						setupFiles: ['./vitest-setup-client.ts']
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
			 */
			include: ['age-encryption', '@js-temporal/polyfill', '@scure/base', 'html2canvas-pro']
		},

		server: {
			host: host,
			port: port,
			// Overridable so the Playwright suite can run against localhost: with the
			// tunnel host baked in, a page served from 127.0.0.1 asks the tunnel for
			// its modules and never hydrates.
			origin: process.env.VITE_DEV_ORIGIN
		}
	};
});
