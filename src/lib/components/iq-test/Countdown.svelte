<script lang="ts">
	/**
	 * How long is left to look: the seconds, large, beside a bar that drains
	 * to nothing over the whole time. For a question whose items or display
	 * are only on screen for a while.
	 *
	 * The bar is a CSS animation over `seconds`, started when this mounts,
	 * rather than stepped from `remaining`: a once-a-second step reads as a
	 * stutter, and the smooth drain is what makes the time felt. The number
	 * is the parent's count, so the two can never disagree about the end.
	 *
	 * A countdown that mounts part way through — a clock carried on after a
	 * reload, or after "Clear timer" is turned off again — starts its bar
	 * part way through too, with a negative delay of the time already gone.
	 * Without it the number carried on and the bar went back to full.
	 */
	let {
		seconds,
		remaining
	}: {
		/** The whole time, which the bar drains over. */
		seconds: number;
		/** Whole seconds left. */
		remaining: number;
	} = $props();

	// Read once, at mount: the animation runs on its own from there, and a
	// delay that followed `remaining` would restart it every second.
	// svelte-ignore state_referenced_locally
	const gone = Math.min(seconds, Math.max(0, seconds - remaining));
</script>

<!-- A timer: assistive tech does not announce it every second (its implicit aria-live is off). -->
<div class="countdown" class:ending={remaining <= 3} role="timer" data-testid="countdown">
	<span class="number">{remaining}<span class="unit">s</span></span>
	<span class="track" aria-hidden="true">
		<span class="fill" style:animation-duration="{seconds}s" style:animation-delay="{-gone}s"
		></span>
	</span>
</div>

<style>
	.countdown {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-inline-size: 0;
		color: var(--wa-color-brand-on-quiet);

		/* The last few seconds in the warning colour, number and bar alike. */
		&.ending {
			color: var(--wa-color-warning-on-quiet);
		}
	}

	.number {
		flex: none;
		/* Wide enough for two digits, so the bar does not shift at 9. */
		min-inline-size: 2.5ch;
		font-size: 2rem;
		font-weight: 800;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.unit {
		font-size: 0.5em;
		font-weight: 700;
	}

	.track {
		flex: 1 1 auto;
		block-size: 0.5rem;
		border-radius: 999px;
		overflow: hidden;
		background: var(--wa-color-neutral-fill-normal);
	}

	.fill {
		display: block;
		block-size: 100%;
		background: currentColor;
		transform-origin: left;
		animation-name: drain;
		animation-timing-function: linear;
		animation-fill-mode: forwards;
	}

	@keyframes drain {
		from {
			transform: scaleX(1);
		}

		to {
			transform: scaleX(0);
		}
	}

	/* The number still counts; the bar simply stays put. */
	@media (prefers-reduced-motion: reduce) {
		.fill {
			animation: none;
		}
	}
</style>
