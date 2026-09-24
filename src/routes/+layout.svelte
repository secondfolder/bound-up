<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	// Registers every Web Awesome element the app uses. Statically imported from
	// the root layout so hydration never waits on fetching them — see
	// src/lib/webawesome.ts, and invariant 16 in AGENTS.md for why that puts Lit
	// in the server graph.
	import '$lib/webawesome';

	type Props = {
		children?: Snippet;
	};

	let { children }: Props = $props();

	// The user store/context and the PocketBase authStore cookie mirroring are
	// gone: Better Auth's cookies are httpOnly (which the old
	// `exportToCookie({ httpOnly: false })` was not), so there is nothing for
	// the client to read. Server load data is the single source of truth, read
	// via `page.data.user` wherever it is needed.
	//
	// No navigation lives here. The (auth-required)/(app) group has its own
	// shell with a bottom nav, and a top nav stacked on it defeated the point;
	// the (public) pages link onwards from their own content instead.

	// Marks the document once the client has taken over. Hydration of the whole
	// tree finishes before any `onMount` runs, so this means every component on
	// the page is live — handlers attached, and superforms done writing its
	// values over the fields. The e2e helpers wait on it before touching a page
	// that was loaded in full: before it, a click on a `wa-button` is a silent
	// no-op and a filled field is erased (see waitForHydration in
	// e2e/helpers.ts). Client-side navigations keep the mark, and need no wait.
	onMount(() => {
		document.documentElement.dataset.hydrated = '';
	});
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
