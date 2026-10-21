<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The bordered box the log-in and sign-up forms sit in, with a loading bar
	 * along its bottom edge while `busy`.
	 *
	 * Signing in or up takes a noticeable moment before anything moves: the
	 * password is stretched into a key in this browser first (the KDF is slow on
	 * purpose), then the request, then the next page's load. A disabled button
	 * alone looked like the press had not registered, and the box is where the
	 * eye already is.
	 */
	let {
		busy = false,
		/** What the bar says to assistive tech while it shows, e.g. "Logging in". */
		busyLabel = '',
		children
	}: { busy?: boolean; busyLabel?: string; children: Snippet } = $props();
</script>

<div class="auth-box">
	{@render children()}
	<!-- Rendered only while busy, rather than toggling `indeterminate`: a
	     boolean property with no SSR special case stays out of markup
	     (AGENTS.md). -->
	{#if busy}<wa-progress-bar indeterminate label={busyLabel} class="busy"></wa-progress-bar>{/if}
</div>

<style>
	.auth-box {
		position: relative;
		/* The column's width, always (AuthPage sets it). It used to be
		   `max-width: 300px; margin: 0 auto`, which in a flex column shrinks the
		   box to its content: the log-in box came out 12px narrower than the
		   sign-up one, and the title and fields jumped going between them. */
		box-sizing: border-box;
		inline-size: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		border-color: var(--border-color, var(--wa-color-surface-border));
		border-radius: var(--wa-panel-border-radius);
		border-style: var(--wa-panel-border-style);
		border-width: var(--wa-panel-border-width);
		padding: var(--wa-space-l);
		/* Clips the bar to the box's rounded corners. */
		overflow: hidden;
		/* Every field in these boxes is required, so an asterisk on some labels
		   — Web Awesome draws one for `required`, which superforms' constraints
		   set on the text fields but never on the password boxes — only said
		   that the password was somehow optional. */
		--wa-form-control-required-content: '';

		:global(p) {
			margin: 0;
		}
	}

	.busy {
		position: absolute;
		inset-inline: 0;
		inset-block-end: 0;
		--track-height: 3px;
	}

	.busy::part(progress-bar) {
		border-radius: 0;
	}
</style>
