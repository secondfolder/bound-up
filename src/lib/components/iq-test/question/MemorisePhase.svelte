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
	 *
	 * `untimed` (the "Clear timer" testing aid) takes the countdown away, so
	 * it lasts until "I've got them". A one-at-a-time sequence still steps:
	 * that is how it is shown, not a clock on it.
	 *
	 * After a reload it carries on from where it was (`resume`), reported as
	 * it goes (`ontick`): starting over would be a second look at the items.
	 */
	let {
		memorise,
		untimed = false,
		resume = null,
		ondone,
		ontick
	}: {
		memorise: Memorise;
		untimed?: boolean;
		/** The seconds left, and the item a sequence was on, before a reload. */
		resume?: { remaining?: number | undefined; at?: number | undefined } | null;
		ondone: () => void;
		ontick?: (progress: { remaining: number; at: number }) => void;
	} = $props();

	// Read once, at mount: the clock runs on from there on its own.
	// svelte-ignore state_referenced_locally
	let remaining = $state(Math.min(memorise.seconds, resume?.remaining ?? memorise.seconds));
	/** The one item of a one-at-a-time sequence on screen. */
	// svelte-ignore state_referenced_locally
	let at = $state(Math.min(Math.max(0, memorise.items.length - 1), resume?.at ?? 0));
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
		if (!untimed) {
			const clock = setInterval(() => {
				remaining -= 1;
				ontick?.({ remaining: Math.max(0, remaining), at });
				if (remaining <= 0) {
					finish();
				}
			}, 1000);
			timers.push(clock);
		}
		const interval = memorise.intervalMs;
		if (interval !== undefined) {
			// Ends when the sequence has run, which is a little before the
			// rounded-up seconds would.
			const stepper = setInterval(() => {
				at += 1;
				ontick?.({ remaining: Math.max(0, remaining), at });
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
	{#if !untimed}
		<Countdown seconds={memorise.seconds} {remaining} />
	{/if}
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
