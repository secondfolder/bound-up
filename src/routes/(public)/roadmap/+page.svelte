<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import RoadmapDetails from '$lib/components/roadmap/RoadmapDetails.svelte';
	import RoadmapTree from '$lib/components/roadmap/RoadmapTree.svelte';
	import { findItem, ROADMAP_STATUSES, roadmap, STATUS_LABELS, statusCounts } from '$lib/roadmap';

	const user = $derived(page.data.user);
	const counts = statusCounts();

	// Statuses switched off in the legend. Dimmed rather than removed, so the
	// tree keeps its shape and nothing jumps while you toggle.
	const hidden = new SvelteSet<(typeof ROADMAP_STATUSES)[number]>();

	function toggle(status: (typeof ROADMAP_STATUSES)[number]) {
		if (hidden.has(status)) {
			hidden.delete(status);
		} else {
			hidden.add(status);
		}
	}

	// The drawer is driven by the fragment, so a node is a plain link, an item
	// can be linked to from anywhere (the landing page does), and the back
	// button closes the drawer. The fragment is never sent to the server, so
	// this is always undefined during SSR and the drawer only ever opens after
	// hydration.
	// Ids are kebab-case (enforced in $lib/roadmap), so the fragment needs no
	// decoding — and a malformed one like `#%` cannot throw.
	const selected = $derived(findItem(page.url.hash.slice(1)));

	// A bottom sheet on a phone, a side panel otherwise.
	let narrow = $state(false);
	$effect(() => {
		const query = matchMedia('(max-width: 719px)');
		narrow = query.matches;
		const update = () => {
			narrow = query.matches;
		};
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	});

	function onDrawerHide(event: Event) {
		// `wa-after-hide` bubbles from nested Web Awesome elements; only the
		// drawer's own counts. Same trap as UrlEmbed and NewMessageDialog.
		if (event.target !== event.currentTarget) {
			return;
		}
		// `goto`, not `replaceState` from $app/navigation: shallow routing
		// leaves `page.url` as it was, so the fragment — and with it the
		// drawer — would come straight back. There is no load to re-run.
		void goto(resolve('/(public)/roadmap'), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}
</script>

<svelte:head>
	<title>Roadmap · Bound Up</title>
	<meta
		name="description"
		content="What Bound Up has shipped, what's being built and what's planned next."
	/>
</svelte:head>

<div class="roadmap">
	<nav class="onwards">
		<a href={resolve('/')}>
			<wa-icon name="chevron-left" variant="solid" aria-hidden="true"></wa-icon>
			Back to Bound Up
		</a>
		{#if !user}
			<a href={resolve('/(public)/signup')}>Sign up to Bound Up</a>
		{/if}
	</nav>

	<header>
		<h1>Roadmap</h1>
		<p>
			What we've built and what's growing next. Tap anything on the tree to find out more.
		</p>
	</header>

	<fieldset class="legend">
		<legend class="wa-visually-hidden">Show on the tree</legend>
		{#each ROADMAP_STATUSES as status (status)}
			<!-- A native button: it is a toggle, and wa-button does not forward
			     aria-pressed to the inner <button> (see AGENTS.md). -->
			<button
				type="button"
				class="toggle"
				data-status={status}
				aria-pressed={!hidden.has(status)}
				onclick={() => toggle(status)}
			>
				<span class="swatch" aria-hidden="true"></span>
				{STATUS_LABELS[status]}
				<span class="count">{counts[status]}</span>
			</button>
		{/each}
	</fieldset>

	<RoadmapTree branches={roadmap.branches} {hidden} />
</div>

{#if selected}
	<wa-drawer
		open
		label={selected.item.title}
		placement={narrow ? 'bottom' : 'end'}
		light-dismiss
		class="roadmap-drawer"
		class:bottom={narrow}
		onwa-after-hide={onDrawerHide}
	>
		<RoadmapDetails placed={selected} />
	</wa-drawer>
{/if}

<style>
	.roadmap {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding-block-end: 3rem;
	}

	.onwards {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;

		a {
			display: inline-flex;
			align-items: center;
			gap: 0.35rem;
			color: var(--accent-color);
			font-weight: 700;

			&:hover {
				color: var(--accent-tint);
			}
		}
	}

	header {
		text-align: center;

		h1 {
			margin: 0;
			font-size: clamp(2.5rem, 12vw, 4.5rem);
		}

		p {
			margin: 0.5rem auto 0;
			max-inline-size: 32rem;
			font-size: var(--wa-font-size-l);
			color: var(--wa-color-text-normal);
		}
	}

	.legend {
		margin: 0;
		padding: 0;
		border: none;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.35rem 0.8rem;
		border: 1px solid var(--wa-color-brand-border-normal);
		border-radius: 999px;
		background: var(--wa-color-brand-fill-quiet);
		color: var(--wa-color-text-normal);
		font: inherit;
		font-size: var(--wa-font-size-s);
		cursor: pointer;

		&[aria-pressed='false'] {
			background: transparent;
			border-color: var(--wa-color-neutral-border-quiet);
			color: var(--wa-color-text-quiet);
			text-decoration: line-through;
		}

		&:focus-visible {
			outline: 2px solid var(--accent-tint);
			outline-offset: 2px;
		}
	}

	/* The legend's key: the same four marker shapes as the tree's nodes. */
	.swatch {
		inline-size: 0.8rem;
		block-size: 0.8rem;
		box-sizing: border-box;
		border-radius: 50%;
		border: 2px solid var(--accent-color);

		[data-status='shipped'] & {
			background: var(--accent-color);
		}

		[data-status='in-progress'] & {
			background: linear-gradient(to top, var(--accent-color) 50%, transparent 50%);
		}

		[data-status='exploring'] & {
			border-color: color-mix(in oklab, var(--accent-color) 50%, transparent);
		}
	}

	.count {
		color: var(--wa-color-text-quiet);
		font-variant-numeric: tabular-nums;
	}

	.roadmap-drawer {
		--size: min(26rem, 100vw);

		&.bottom {
			--size: min(70svh, 32rem);
		}
	}
</style>
