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
	<wa-callout variant="neutral" size="s" class="hint" data-testid="home-screen-hint">
		<div class="body">
			<div>
				<strong>Add to Home Screen to stay signed in for longer</strong>
				<!-- The iOS share glyph rather than the word: the button it means is
				     an icon with no text under it, so the picture is what people
				     are looking for. The hint only ever shows on iOS. Drawn here
				     rather than taken from Font Awesome, whose nearest icon
				     (`arrow-up-from-bracket`) is a squat bracket, not Safari's tall
				     box open at the top. -->
				<p>
					Tap <svg
						class="share"
						role="img"
						aria-label="Share"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path
							d="M9 9H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-2M12 2.5V15M8.5 6 12 2.5 15.5 6"
						/></svg
					>, then “Add to Home Screen”.
				</p>
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

		.share {
			width: 1.15em;
			height: 1.15em;
			vertical-align: -0.2em;
		}
	}
</style>
