<script lang="ts">
	import { onMount } from 'svelte';
	import { HOME_SCREEN_HINT_DISMISSED_KEY, shouldOfferHomeScreen } from '$lib/home-screen';

	/**
	 * "Add to Home Screen to stay signed in for longer", on iPhone and iPad only.
	 *
	 * Safari clears a site's storage after a week without a visit, and that is
	 * what signs an iPhone user out; the Home Screen app is exempt. The web
	 * cannot add itself there, so this can only say how. See `home-screen.ts`.
	 *
	 * Decided in `onMount`, never during SSR: the server cannot know the device
	 * or whether the page is running standalone, and guessing would flash the
	 * hint at everyone before hydration took it away.
	 */
	let visible = $state(false);

	onMount(() => {
		let dismissed = false;
		try {
			dismissed = globalThis.localStorage?.getItem(HOME_SCREEN_HINT_DISMISSED_KEY) !== null;
		} catch {
			// Storage refused (private mode, blocked site data): show it, and a
			// dismissal just will not stick. Harmless.
		}
		const standalone =
			(navigator as Navigator & { standalone?: boolean }).standalone === true ||
			matchMedia('(display-mode: standalone)').matches;
		visible =
			!dismissed &&
			shouldOfferHomeScreen({
				userAgent: navigator.userAgent,
				maxTouchPoints: navigator.maxTouchPoints,
				standalone
			});
	});

	function dismiss() {
		visible = false;
		try {
			globalThis.localStorage?.setItem(HOME_SCREEN_HINT_DISMISSED_KEY, new Date().toISOString());
		} catch {
			// Survivable: it comes back on the next visit.
		}
	}
</script>

{#if visible}
	<wa-callout variant="neutral" size="small" class="hint" data-testid="home-screen-hint">
		<wa-icon slot="icon" name="mobile-screen" variant="solid"></wa-icon>
		<div class="body">
			<div>
				<strong>Add to Home Screen to stay signed in for longer</strong>
				<p>Tap Share, then “Add to Home Screen”.</p>
			</div>
			<wa-button appearance="plain" size="s" pill onclick={dismiss}>
				<wa-icon name="xmark" label="Dismiss"></wa-icon>
			</wa-button>
		</div>
	</wa-callout>
{/if}

<style>
	.hint {
		display: block;
		max-width: 40rem;
		margin: var(--wa-space-m) auto;
		width: calc(100% - 2 * var(--wa-space-m));

		.body {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: var(--wa-space-s);
		}

		strong {
			display: block;
		}

		p {
			margin: 0.25rem 0 0;
			color: var(--wa-color-text-quiet);
		}
	}
</style>
