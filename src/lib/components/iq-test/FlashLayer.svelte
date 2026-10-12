<script lang="ts">
	import { trackImage } from '$lib/playroom/iq-test/media-image';
	import type { Phase } from './QuestionCard.svelte';

	/**
	 * Level 4's flashes (the subliminals): a picture and a taunt thrown over
	 * the page, more and more often as the test goes on, and in a burst as soon
	 * as a memory question's words are hidden — the moment a distraction costs
	 * the most.
	 *
	 * Never blocks anything: the layer takes no pointer events, so a flash
	 * mid-click still lets the click land. With no pictures (the feed failed,
	 * or reddit refused) the flashes are colour and text alone.
	 *
	 * Under `prefers-reduced-motion` flashes come half as often and fade
	 * rather than cut. The setup dialog warns about flashing before this mode
	 * can be chosen.
	 */
	let {
		images,
		taunts,
		progress,
		phase
	}: {
		images: readonly string[];
		taunts: readonly string[];
		/** How far through the test, 0–1. Flashes speed up with it. */
		progress: number;
		phase: Phase;
	} = $props();

	let flash = $state<{ id: number; image: string | null; taunt: string | null } | null>(null);
	let counter = 0;
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	const reducedMotion =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	function show(duration: number) {
		counter += 1;
		flash = {
			id: counter,
			image: images.length > 0 ? (images[Math.floor(Math.random() * images.length)] ?? null) : null,
			taunt: taunts.length > 0 ? (taunts[Math.floor(Math.random() * taunts.length)] ?? null) : null
		};
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			flash = null;
		}, duration);
	}

	/** From one every ~9s at the start to one every ~1.8s at the end. */
	const interval = $derived(
		(9000 - 7200 * Math.min(1, Math.max(0, progress))) * (reducedMotion ? 2 : 1)
	);

	$effect(() => {
		const every = interval;
		const timer = setInterval(() => show(350 + Math.random() * 600), every);
		return () => clearInterval(timer);
	});

	// A burst the moment the words disappear: three quick flashes while the
	// taker is trying to hold them. Only on leaving `memorise` — every other
	// question also reaches `answer`, and a burst on each would just be the
	// regular flashes, faster.
	let lastPhase: Phase | null = null;
	// Kept outside the effect's cleanup: the burst should outlast the next
	// phase change, which can come within a second.
	let burst: ReturnType<typeof setTimeout>[] = [];
	$effect(() => {
		const leftMemorise = lastPhase === 'memorise' && phase !== 'memorise';
		lastPhase = phase;
		if (leftMemorise) {
			burst = [0, 900, 1800].map((delay) => setTimeout(() => show(450), delay));
		}
	});

	$effect(() => () => {
		clearTimeout(hideTimer);
		for (const timer of burst) {
			clearTimeout(timer);
		}
	});
</script>

<div class="flash-layer" class:reduced={reducedMotion} aria-hidden="true">
	{#if flash}
		{#key flash.id}
			<div class="flash" class:bare={!flash.image}>
				{#if flash.image}
					<img {@attach trackImage} src={flash.image} alt="" referrerpolicy="no-referrer" />
				{/if}
				{#if flash.taunt}
					<span class="taunt">{flash.taunt}</span>
				{/if}
			</div>
		{/key}
	{/if}
</div>

<style>
	.flash-layer {
		position: fixed;
		inset: 0;
		z-index: 10;
		pointer-events: none;
	}

	.flash {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		animation: cut 120ms steps(1) both;

		&.bare {
			background: color-mix(in oklab, var(--wa-color-brand-fill-loud) 55%, transparent);
		}

		img {
			grid-area: 1 / 1;
			max-inline-size: 100%;
			max-block-size: 100%;
			object-fit: contain;
			opacity: 0.88;
		}

		.taunt {
			grid-area: 1 / 1;
			/* The image's opacity makes it a layer of its own, painted over
			   anything unpositioned; this keeps the words on top of it. */
			position: relative;
			z-index: 1;
			padding: 0.25em 0.5em;
			font-family: var(--wa-font-family-heading);
			font-size: clamp(2rem, 9vw, 5rem);
			font-weight: 900;
			text-align: center;
			text-transform: uppercase;
			color: #fff;
			text-shadow:
				0 0 0.3em var(--wa-color-brand-fill-loud),
				0 0.05em 0.1em #000;
		}
	}

	.reduced .flash {
		animation: fade 300ms ease both;
	}

	@keyframes cut {
		from {
			opacity: 0;
		}
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}
</style>
