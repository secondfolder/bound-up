<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	/**
	 * A one-line suggestion at the top of the page that someone can wave away
	 * for good, on this device. The base for `HomeScreenHint` and
	 * `NotificationsHint`, so the rules below live in one place.
	 *
	 * - **Decided in `onMount`, never during SSR.** What these hints depend on
	 *   (the device, whether the page runs from the Home Screen, notification
	 *   permission) is only knowable in the browser, and guessing would flash
	 *   the hint at everyone before hydration took it away.
	 * - **A dismissal is a convenience, remembered in `localStorage`.** When
	 *   storage is refused (private mode, blocked site data) the hint still
	 *   shows and the dismissal just will not stick, which is harmless.
	 */
	let {
		dismissedKey,
		shouldShow,
		title,
		testid,
		children
	}: {
		/** The `localStorage` key that remembers it was dismissed. */
		dismissedKey: string;
		/** Whether this device is one the hint is for. Called once, in the browser. */
		shouldShow: () => boolean;
		title: string;
		testid: string;
		/** The explanation under the title. */
		children: Snippet;
	} = $props();

	let visible = $state(false);

	onMount(() => {
		let dismissed = false;
		try {
			dismissed = globalThis.localStorage?.getItem(dismissedKey) !== null;
		} catch {
			// Storage refused: show it, and a dismissal will not stick. Harmless.
		}
		visible = !dismissed && shouldShow();
	});

	function dismiss() {
		visible = false;
		try {
			globalThis.localStorage?.setItem(dismissedKey, new Date().toISOString());
		} catch {
			// Survivable: it comes back on the next visit.
		}
	}
</script>

{#if visible}
	<wa-callout variant="neutral" size="s" class="hint" data-testid={testid}>
		<div class="body">
			<div>
				<strong>{title}</strong>
				<p>{@render children()}</p>
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
