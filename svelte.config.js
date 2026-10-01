import cloudflareAdapter from '@sveltejs/adapter-cloudflare';
import nodeAdapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { buildTarget } from './vite-plugins/build-target.ts';

const cloudflare = cloudflareAdapter();

/**
 * Custom elements verified to upgrade to a real interactive control: a
 * focusable native control inside, operable from the keyboard, and exposed to
 * assistive tech with an interactive role. Verify all three before adding one.
 */
const INTERACTIVE_CUSTOM_ELEMENTS = ['wa-button'];

/**
 * Per a11y warning code, the custom elements known to already satisfy what that
 * warning checks for. Each warning gets its own list rather than one list
 * silencing every a11y warning: an element that is genuinely interactive can
 * still be missing, say, an accessible name, and that warning must still fire.
 * @type {Record<string, string[]>}
 */
const A11Y_WARNING_ALLOWLIST = {
	a11y_click_events_have_key_events: INTERACTIVE_CUSTOM_ELEMENTS,
	a11y_no_static_element_interactions: INTERACTIVE_CUSTOM_ELEMENTS
};

/**
 * The compiler names the offending element as `<tag>` in the message. A custom
 * element name always contains a hyphen, so a native tag never matches.
 */
const CUSTOM_ELEMENT_IN_MESSAGE = /`<(?<tag>[a-z][a-z0-9]*-[a-z0-9-]*)>`/;

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	compilerOptions: {
		// Custom elements upgrade to real controls at runtime, but the compiler
		// classifies interactivity by tag name against HTML-only schemas, so it
		// only ever sees an unknown element. See A11Y_WARNING_ALLOWLIST above and
		// AGENTS.md for when an element may be added.
		//
		// This lives here, not in `sveltekit({ compilerOptions })` in
		// vite.config.ts: passing any options to `sveltekit()` makes SvelteKit
		// ignore this whole file, adapter included.
		warningFilter: (warning) => {
			const allowed = A11Y_WARNING_ALLOWLIST[warning.code];
			const match = CUSTOM_ELEMENT_IN_MESSAGE.exec(warning.message);
			if (!(allowed && match)) {
				return true;
			}
			const [, element] = match;
			return !allowed.includes(element);
		}
	},

	kit: {
		// `vite dev` serves through SvelteKit's own Node server, not the worker. The
		// adapter's ONLY role in dev/preview/prerender is `emulate()`, which boots
		// miniflare to supply `event.platform` (kit only sets it when
		// `state.emulator?.platform` exists). Dev reads neither platform.env.DB (it
		// uses ./local.db via libsql) nor platform.env secrets (they come from .env),
		// so dropping `emulate` skips workerd entirely and makes the presence of
		// `platform` mean exactly "running on Workers".
		//
		// `vite build` still uses the full adapter. Run `npm run preview`
		// (real wrangler dev) to exercise the platform path before deploying.
		//
		// `BUILD_TARGET=node` (`npm run build:node`, what the Dockerfile runs)
		// builds the self-hosted server instead. It has no platform either, and
		// `__SELF_HOSTED__` sends it down the same local backends as `vite dev`.
		// See docs/self-hosting.md.
		adapter: buildTarget() === 'node' ? nodeAdapter() : { ...cloudflare, emulate: undefined },
		// `src/service-worker.ts` exists only to show push notifications, so it is
		// registered by the notification settings when someone turns them on
		// (`$lib/push-client.ts`), not on every page load for everyone. A worker
		// nobody asked for is one more thing between every visitor and the page.
		serviceWorker: { register: false }
	}
};

export default config;
