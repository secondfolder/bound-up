<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import AppNav from '$lib/components/AppNav.svelte';
	import EncryptionGate from '$lib/components/EncryptionGate.svelte';
	import HelpRequestCallout from '$lib/components/HelpRequestCallout.svelte';
	import HomeScreenHint from '$lib/components/HomeScreenHint.svelte';
	import NotificationsHint from '$lib/components/NotificationsHint.svelte';
	import TimezoneWarning from '$lib/components/TimezoneWarning.svelte';
	import { currentVaults } from '$lib/crypto/vaults.svelte';
	import { hasFeature } from '$lib/features';
	import { DEVICE_LIST_KEY } from '$lib/kink-list/device-key';
	import { resyncPush } from '$lib/push-client';
	import { fitVisualViewport } from '$lib/visual-viewport';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// A browser that changed hands without the settings screen's sign-out still
	// has the previous account's subscription, and would go on showing their
	// notifications. Checked once per full load, here rather than on sign-in,
	// because a session can end and another begin with nothing of ours running
	// in between. See docs/notifications.md.
	// A kink list kept on this device from before signing in joins the
	// account's once the vaults are open. Loaded only when there is one, so
	// the shell carries none of it otherwise. See docs/kink-list.md.
	let adoptionChecked = false;
	$effect(() => {
		if (adoptionChecked || currentVaults().status !== 'ready') {
			return;
		}
		adoptionChecked = true;
		let waiting = false;
		try {
			waiting = localStorage.getItem(DEVICE_LIST_KEY) !== null;
		} catch {
			// Storage the browser will not let us read holds no list either.
		}
		if (waiting) {
			void import('$lib/kink-list/adopt.svelte').then(({ adoptDeviceList }) => adoptDeviceList());
		}
	});

	onMount(() => {
		if (data.pushAvailable) {
			void resyncPush().catch(() => {
				// Background work nobody is waiting on: the next full load asks again.
			});
		}
	});

	/**
	 * A scene menu's own page fills the screen (docs/scenes.md, "A menu's own
	 * page"): no nav and none of the notices, which would sit over or above
	 * the menu. The encryption gate stays, since it is what opens the menu.
	 */
	const fullScreen = $derived(page.route.id?.endsWith('/notebook/[entryId]/menus/[menuId]') ?? false);

	const showTimezoneWarning = $derived.by(() => {
		const routeId = page.route.id;
		if (!routeId) {
			return false;
		}

		return (
			routeId === '/(auth-required)/(app)/home' ||
			routeId.startsWith('/(auth-required)/(app)/partner/') ||
			routeId.startsWith('/(auth-required)/(app)/settings')
		);
	});
</script>

<svelte:head>
	<style>
	/* The app shell owns the viewport: only <main> scrolls, so the nav stays
		   put instead of scrolling away like a document footer. Scoped to this
		   layout — Svelte removes it again on the way out to a (public) route. */
	body {
		margin: 0;
		overflow: hidden;
	}

	/* The halftone, pinned to the window. Nothing scrolls behind the shell,
		   so it looks the same; but absolutely positioned it was the only thing
		   giving this zero-height body any height, which made the document
		   scrollable by however much 800px beat the window. Anything that
		   scrolled an element into view did scroll it, cutting off the top of
		   the page and showing bare grain above the nav. */
	body::before {
		position: fixed;
	}
</style>
</svelte:head>

<div class="shell" {@attach fitVisualViewport}>
	<main>
		{#if showTimezoneWarning}
			<TimezoneWarning user={data.user} />
		{/if}
		<!-- Inside <main> so it scrolls with the page: `position: fixed` against
		     the viewport does not work in this shell, and a callout pinned over
		     the content would cover it. -->
		<EncryptionGate user={data.user} />
		{#if !fullScreen}
			<HelpRequestCallout
				requests={data.helpRequests.filter(
					// The board shows the full request; a second callout above it
					// pointing at the page you are on would only be noise.
					(request) =>
						!(
							page.route.id === '/(auth-required)/(app)/partner/[id]/messages' &&
							page.params.id === request.partnershipId
						)
				)}
			/>
			<HomeScreenHint />
			<!-- Never on the screen it links to. The two hints never show together:
			     one is for a browser tab, the other for the Home Screen app. -->
			{#if data.pushAvailable && page.route.id !== '/(auth-required)/(app)/settings/notifications'}
				<NotificationsHint />
			{/if}
		{/if}
		{@render children()}
	</main>
	{#if !fullScreen}
		<AppNav
			partners={data.partners}
			debugAvailable={hasFeature(data.features, 'debugMode')}
			debugOn={data.debug}
		/>
	{/if}
</div>

<style>
	/* Fixed over the visible part of the screen, not sized to the document:
	   see $lib/visual-viewport.ts for why iOS needs that once the keyboard is
	   open. The fallbacks are for the first paint, and for a browser without
	   `visualViewport`. */
	.shell {
		position: fixed;
		inset-inline: 0;
		top: var(--viewport-top, 0);
		height: var(--viewport-height, 100dvh);
		display: flex;
		flex-direction: column;

		main {
			flex: 1 1 auto;
			min-height: 0;
			overflow-y: auto;
			/* Flex column so a page's `flex: 1 1 auto` root actually stretches to
		   fill the pane — without it the root is a plain block of content height,
		   and a short thread left the composer footer part-way up the screen
		   instead of pinned above AppNav. Every (app) page has a single root
		   element, which is what makes this safe. */
			display: flex;
			flex-direction: column;
			/* Momentum scrolling inside the pane, not rubber-banding of the page. */
			overscroll-behavior: contain;

			/* Every page's root fills the pane's width, up to its own max-width.
			   A root centred with `margin-inline: auto` is a flex item with auto
			   margins, which turns off stretching: it shrank to fit its content,
			   so sibling pages with the same max-width came out different widths
			   (tasks 830px, rewards 525px), a page changed width with its data,
			   and a long unwrappable title pushed the partner page off the side
			   of a phone. */
			> :global(*) {
				inline-size: 100%;
			}
		}
	}
</style>
