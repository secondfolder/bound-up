<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import {
		currentRequestFailure,
		dismissRequestFailure,
		reportRequestFailure
	} from '$lib/request-failure.svelte';

	/**
	 * The app-wide "that request failed" notice. Rendered once, by the root
	 * layout, so it is on every page. See `$lib/request-failure.svelte.ts`.
	 */
	const notice = $derived(currentRequestFailure());

	// A failure belongs to the page it happened on. Moving on clears it.
	afterNavigate(dismissRequestFailure);

	onMount(() => {
		/**
		 * The safety net: a rejection nothing handled is almost always a request
		 * whose caller forgot that it could fail, so it is shown rather than lost
		 * in the console. Not `preventDefault()`ed, so it still reaches the
		 * console and the e2e suite's `pageerror` check, which is what gets the
		 * real bug fixed at its site.
		 */
		const onRejection = (event: PromiseRejectionEvent) => {
			reportRequestFailure(event.reason);
		};
		addEventListener('unhandledrejection', onRejection);
		return () => removeEventListener('unhandledrejection', onRejection);
	});
</script>

{#if notice}
	<!-- `role="alert"` so a screen reader announces it: this appears away from
	     whatever the person just pressed. Keyed so a repeat failure re-announces. -->
	{#key notice.id}
		<div class="notice" role="alert" data-testid="request-failure">
			<wa-callout variant="danger" size="s">
				<div class="body">
					<span>{notice.message}</span>
					<wa-button appearance="plain" size="s" pill onclick={dismissRequestFailure}>
						<wa-icon name="xmark" label="Dismiss"></wa-icon>
					</wa-button>
				</div>
			</wa-callout>
		</div>
	{/key}
{/if}

<style>
	.notice {
		position: fixed;
		top: var(--wa-space-m);
		left: 50%;
		transform: translateX(-50%);
		width: min(36rem, calc(100% - 2 * var(--wa-space-m)));
		z-index: 1000;

		.body {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--wa-space-s);
		}
	}
</style>
