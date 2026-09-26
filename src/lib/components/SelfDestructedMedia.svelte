<script lang="ts">
	/**
	 * What an attachment becomes once it has self-destructed.
	 *
	 * The object is gone from storage (or about to be — see
	 * `src/lib/server/media/expiry.ts`), so there is nothing left to decrypt:
	 * this is a placeholder with some character rather than an error, because
	 * nothing went wrong. `compact` is the board tile's version, which has room
	 * for the bomb and little else.
	 */
	let { compact = false }: { compact?: boolean } = $props();
</script>

<div class="self-destructed" class:compact role="img" aria-label="This media has self-destructed">
	<span class="bomb" aria-hidden="true">
		<wa-icon name="bomb" variant="solid"></wa-icon>
		<span class="spark"></span>
	</span>
	{#if !compact}
		<span class="caption" aria-hidden="true">Kaboom! This media has self-destructed.</span>
	{/if}
</div>

<style>
	.self-destructed {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border: 1px dashed var(--wa-color-surface-border);
		border-radius: var(--wa-panel-border-radius, 0.5rem);
		background: var(--wa-color-surface-lowered);
		color: var(--wa-color-text-quiet);
		font-size: 0.8125rem;

		&.compact {
			justify-content: center;
			inline-size: 100%;
			block-size: 100%;
			padding: 0;
			border: none;
			border-radius: 0;
		}
	}

	.bomb {
		position: relative;
		display: inline-grid;
		place-items: center;
		font-size: 1.75rem;
		color: var(--wa-color-brand-fill-loud);
		transform-origin: 50% 80%;
		animation: wobble 2.4s ease-in-out infinite;

		.compact & {
			font-size: 2.25rem;
		}
	}

	/* A little fuse spark at the bomb's top-right, where Font Awesome draws the fuse. */
	.spark {
		position: absolute;
		inset-block-start: -0.1em;
		inset-inline-end: -0.05em;
		inline-size: 0.28em;
		block-size: 0.28em;
		border-radius: 50%;
		background: var(--wa-color-brand-on-quiet, currentColor);
		box-shadow: 0 0 0.35em 0.1em var(--wa-color-brand-fill-loud);
		animation: flicker 0.6s steps(2, end) infinite;
	}

	@keyframes wobble {
		0%,
		70%,
		100% {
			transform: rotate(0deg);
		}
		76% {
			transform: rotate(-9deg);
		}
		84% {
			transform: rotate(7deg);
		}
		92% {
			transform: rotate(-4deg);
		}
	}

	@keyframes flicker {
		50% {
			opacity: 0.35;
			transform: scale(0.7);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bomb,
		.spark {
			animation: none;
		}
	}
</style>
