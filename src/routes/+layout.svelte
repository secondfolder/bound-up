<script lang="ts">
	import type { Snippet } from 'svelte';

	// Web Awesome is installed from npm rather than pulled off a CDN, so the
	// components are cherry-picked here (in the root layout) instead of being
	// autoloaded at runtime. Anything new a page reaches for needs its import
	// added below, otherwise the custom element never registers and the markup
	// renders as an inert unknown tag.
	import '@awesome.me/webawesome/dist/styles/webawesome.css';
	import '@awesome.me/webawesome/dist/components/avatar/avatar.js';
	import '@awesome.me/webawesome/dist/components/callout/callout.js';
	import '@awesome.me/webawesome/dist/components/checkbox/checkbox.js';
	import '@awesome.me/webawesome/dist/components/button/button.js';
	import '@awesome.me/webawesome/dist/components/button-group/button-group.js';
	import '@awesome.me/webawesome/dist/components/card/card.js';
	import '@awesome.me/webawesome/dist/components/dialog/dialog.js';
	import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js';
	import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js';
	import '@awesome.me/webawesome/dist/components/icon/icon.js';
	import '@awesome.me/webawesome/dist/components/input/input.js';
	import '@awesome.me/webawesome/dist/components/divider/divider.js';
	import '@awesome.me/webawesome/dist/components/spinner/spinner.js';
	import '@awesome.me/webawesome/dist/components/textarea/textarea.js';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();

	// The user store/context and the PocketBase authStore cookie mirroring are
	// gone: Better Auth's cookies are httpOnly (which the old
	// `exportToCookie({ httpOnly: false })` was not), so there is nothing for
	// the client to read. Server load data is the single source of truth, read
	// via `page.data.user` wherever it is needed.
	//
	// SiteHeader used to live here. It now belongs to (public) only: the
	// (auth-required)/(app) group has its own shell with a bottom nav, and
	// stacking a second navigation on top of it defeats the point.
</script>

{@render children?.()}

<style>
	:root {
		--wa-color-text-danger: var(--wa-color-red-40);

		/* safe area inset on iOS takes into account the corner radius of the screen 
        which in some situations is too aggressive and we only want the safe area 
        inset to include the home indicator bar so --safe-area-inset-bottom-min is
        provided for those situations. We use the ugly hack of 
        `@supports (-webkit-touch-callout: none)` to detect if the device is iOS */
		--safe-area-inset-bottom-min-max-delta: 0px;
		@supports (-webkit-touch-callout: none) {
			--safe-area-inset-bottom-min-max-delta: 1.25rem;
		}
		--safe-area-inset-bottom: env(safe-area-inset-bottom, 0);
		--safe-area-inset-bottom-min: max(
			0px,
			calc(env(safe-area-inset-bottom, 0) - var(--safe-area-inset-bottom-min-max-delta))
		);
	}

	/**
    * Elements that have the "plain" and "outlined" appearance have no background
    * and the "neutral" variant indicates they aren't aiming to standout with a particular colour. So intead of just using 
    * the neutral varient default of grey it makes more sense to use the current text
    * colour to make sure it stands out against whatever background it finds itself on.
    */
	:global(.wa-plain.wa-neutral),
	:global([appearance='plain'][variant='neutral']),
	:global(.wa-outlined.wa-neutral),
	:global([appearance='outlined'][variant='neutral']) {
		--wa-color-fill-loud: color-mix(in oklab, contrast-color(currentColor) 20%, transparent);
		--wa-color-fill-normal: color-mix(in oklab, contrast-color(currentColor) 20%, transparent);
		--wa-color-fill-quiet: color-mix(in oklab, contrast-color(currentColor) 20%, transparent);
		--wa-color-border-loud: currentColor;
		--wa-color-border-normal: currentColor;
		--wa-color-border-quiet: currentColor;
		--wa-color-on-loud: currentColor;
		--wa-color-on-normal: currentColor;
		--wa-color-on-quiet: currentColor;
	}
</style>
