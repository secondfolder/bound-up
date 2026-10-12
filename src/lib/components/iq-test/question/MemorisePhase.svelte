<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Memorise } from '$lib/playroom/iq-test/questions';
	import Board from '../Board.svelte';
	import Countdown from '../Countdown.svelte';

	/**
	 * Something to hold in mind before the question proper: words or digits
	 * all at once, pictures one at a time (`intervalMs`), or a board's shaded
	 * squares, under a countdown. `ondone` when the time is up, the sequence
	 * has run, or the taker says they have them.
	 */
	let { memorise, ondone }: { memorise: Memorise; ondone: () => void } = $props();

	// svelte-ignore state_referenced_locally
	let remaining = $state(memorise.seconds);
	/** The one item of a one-at-a-time sequence on screen. */
	let at = $state(0);
	let finished = false;
	const timers: ReturnType<typeof setInterval>[] = [];

	function finish() {
		if (!finished) {
			finished = true;
			for (const timer of timers) {
				clearInterval(timer);
			}
			ondone();
		}
	}

	$effect(() => {
		const clock = setInterval(() => {
			remaining -= 1;
			if (remaining <= 0) {
				finish();
			}
		}, 1000);
		timers.push(clock);
		const interval = memorise.intervalMs;
		if (interval !== undefined) {
			// Ends when the sequence has run, which is a little before the
			// rounded-up seconds would.
			const stepper = setInterval(() => {
				at += 1;
				if (at >= memorise.items.length) {
					finish();
				}
			}, interval);
			timers.push(stepper);
		}
		return () => {
			for (const timer of timers) {
				clearInterval(timer);
			}
		};
	});

	onDestroy(() => {
		for (const timer of timers) {
			clearInterval(timer);
		}
	});
</script>

<p class="prompt">{memorise.prompt}</p>
{#if memorise.grid}
	<Board grid={memorise.grid} mode="show" marked={memorise.grid.shaded} />
{:else if memorise.intervalMs !== undefined}
	<!-- One at a time: each replaces the last, keyed so it is drawn afresh. -->
	<div class="one-at-a-time" data-testid="memorise-items">
		{#key at}
			<span>{memorise.items[at] ?? ''}</span>
		{/key}
	</div>
{:else}
	<ul class="all-at-once" data-testid="memorise-items">
		{#each memorise.items as item, index (index)}
			<li>{item}</li>
		{/each}
	</ul>
{/if}
<div class="footer">
	<Countdown seconds={memorise.seconds} {remaining} />
	<wa-button appearance="outlined" onclick={finish}>I've got them</wa-button>
</div>

<style>
	.prompt {
		font-size: 1.15rem;
		font-weight: 600;
		margin: 0;
	}

	.all-at-once {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem 1.5rem;
		font-size: 1.75rem;
		font-weight: 700;
	}

	/* Big, alone, and always the same height, so nothing moves as they change. */
	.one-at-a-time {
		display: grid;
		place-items: center;
		block-size: 6rem;
		font-size: 4.5rem;
		line-height: 1;
	}

	.footer {
		display: flex;
		align-items: center;
		gap: 1.5rem;

		:global(.countdown) {
			flex: 1 1 auto;
		}
	}
</style>
