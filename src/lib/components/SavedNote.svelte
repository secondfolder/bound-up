<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The confirmation a settings form shows once a save has landed: a check
	 * and a word, beside the save button. The caller decides when it shows —
	 * from a successful save until the next edit — so it never sits beside a
	 * form whose fields no longer match what was saved.
	 *
	 * Mounting is what plays its arrival, so a caller wraps it in an `{#if}`
	 * (or `{#key}` for a second save in a row) rather than toggling a class.
	 */
	let { children }: { children?: Snippet } = $props();
</script>

<span class="saved" role="status">
	<wa-icon name="circle-check" variant="solid"></wa-icon>
	{#if children}{@render children()}{:else}Saved{/if}
</span>

<style>
	.saved {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		color: var(--wa-color-success-on-quiet);
	}

	@media (prefers-reduced-motion: no-preference) {
		.saved {
			animation: saved-in var(--wa-transition-slow) ease-out;

			wa-icon {
				animation: saved-tick 0.45s ease-out;
			}
		}
	}

	@keyframes saved-in {
		from {
			opacity: 0;
			translate: 0 0.25rem;
		}
	}

	@keyframes saved-tick {
		0% {
			scale: 0.4;
		}
		60% {
			scale: 1.2;
		}
		100% {
			scale: 1;
		}
	}
</style>
