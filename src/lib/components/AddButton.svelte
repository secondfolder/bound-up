<script lang="ts">
	import { shownContexts } from '$lib/context-client.svelte';
	import type { Box } from '$lib/context-fan';
	import type { ContextSpaceView } from '$lib/types';
	import ContextSelectorFan, { type FanOption } from './context/ContextSelectorFan.svelte';

	/**
	 * A page's add button: round, at the bottom right over its list (tasks,
	 * rewards, the notebook, and Messages' "Write something"). Where a new
	 * item goes is a space the viewer may add to (`targets`):
	 *
	 * - one: the button adds there straight away;
	 * - several (Everyone): it fans out their avatars, as the context switcher
	 *   does (`ContextSelectorFan`), and the one picked is where it goes;
	 * - none: there is no button.
	 *
	 * Either way the space is the host's to post (`onadd`): nothing here reads
	 * the context (docs/contexts.md, "Writes name their space").
	 *
	 * Sticky to the bottom of the page root, which must be a flex column that
	 * fills `<main>` with this as its last child, so it rides over the list
	 * and the list's end clears it.
	 */
	let {
		label,
		targets,
		spaces,
		you,
		onadd,
		lead,
		icon = 'plus',
		forName = (name) => `${label} for ${name}`,
		busy = false
	}: {
		/** What the button does, as its accessible name: "Add a task". */
		label: string;
		/** Over the lit avatar's name on the fan: "New task for". */
		lead: string;
		/**
		 * Its Font Awesome icon: a + to add, Messages' pen to write. A + turns
		 * into a × while the fan is open; anything else is swapped for one.
		 */
		icon?: string;
		/** An avatar's accessible name on the fan, from whose it is ("me", "Jun"). */
		forName?: (name: string) => string;
		/** The ids of the spaces a new item may go to, in the switcher's order. */
		targets: readonly string[];
		/** The switcher's spaces, for each target's name, colour and avatar. */
		spaces: readonly ContextSpaceView[];
		/** The viewer's own name, for their avatar's initials. */
		you: string;
		/**
		 * Adds for the space, with where the button is on the screen, for
		 * whatever opens to grow out of it (Messages' composer).
		 */
		onadd: (spaceId: string, from: DOMRect | null) => void;
		/** While an add is under way: the button waits rather than adding twice. */
		busy?: boolean;
	} = $props();

	const options = $derived<FanOption[]>(
		shownContexts(spaces, you)
			.filter((shown) => shown.kind !== 'all' && targets.includes(shown.key))
			.map((shown) => ({
				key: shown.key,
				kind: shown.kind,
				people: shown.people,
				name: shown.name,
				label: forName(shown.kind === 'solo' ? 'me' : shown.name),
				colour: shown.colour
			}))
	);
	const only = $derived(options.length === 1 ? options[0] : undefined);

	let fan: ContextSelectorFan | undefined = $state();
	let round: HTMLButtonElement | undefined = $state();

	const from = () => round?.getBoundingClientRect() ?? null;

	/**
	 * The disk is centred on the button itself, which is also home, and the
	 * ring starts just outside it: no names or text go in this fan, so its
	 * disk need only be as big as its avatars.
	 */
	function place(box: DOMRect, _shell: Box) {
		const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
		return { centre, home: centre, clear: Math.max(box.width, box.height) / 2 };
	}

	function pick(key: string) {
		const at = from();
		fan?.close(false);
		onadd(key, at);
	}
</script>

{#if options.length > 0}
	<div class="add-button">
		{#if only}
			<!-- A native button, drawn as the fan's trigger is below, so the
			     two look the same: the fan's has to be native (it is a
			     disclosure trigger, and wa-button leaves `aria-expanded` on its
			     host, AGENTS.md). -->
			<button
				type="button"
				class="round"
				bind:this={round}
				disabled={busy}
				aria-label={label}
				onclick={() => onadd(only.key, from())}
			>
				<wa-icon name={icon} variant="solid"></wa-icon>
			</button>
		{:else}
			<ContextSelectorFan
				bind:this={fan}
				{options}
				label="Whose it’s for"
				help={{ tap: 'Tap whose it’s for, or next time hold the button and slide', slide: 'Slide onto whose it’s for, then let go' }}
				letGo={(option) => `Let go to ${option.label.charAt(0).toLowerCase()}${option.label.slice(1)}`}
				{place}
				hintFrom="disk"
				wrapEnds
				litLead={lead}
				dimNav={false}
				onpick={pick}
			>
				{#snippet trigger({ open, anchor, button })}
					<!-- Above the fan's backdrop while it is open, so it can close it
					     again; the × it turns into says so. -->
					<button
						type="button"
						class="round"
						class:open
						class:turns={icon === 'plus'}
						bind:this={round}
						disabled={busy}
						{@attach anchor}
						{@attach button}
						aria-expanded={open}
						aria-haspopup="true"
						aria-label="{label}: choose whose it’s for"
					>
						<wa-icon name={open && icon !== 'plus' ? 'xmark' : icon} variant="solid"></wa-icon>
					</button>
				{/snippet}
			</ContextSelectorFan>
		{/if}
	</div>
{/if}

<style>
	/* Sticky to the bottom of the page, over the list, with no band behind
	   it: its shadow lifts it off whatever passes under (Messages' button
	   does the same). The strip it sits in lets taps through to the list;
	   the button and its fan take their own. Above the page's header while
	   its fan is open, whose dim would otherwise pass under the context
	   switcher's pill. */
	.add-button {
		position: sticky;
		inset-block-end: 0;
		z-index: 30;
		margin-block-start: auto;
		display: flex;
		justify-content: flex-end;
		padding: var(--wa-space-s) var(--page-gutter) var(--wa-space-m);
		pointer-events: none;

		:global(*) {
			pointer-events: auto;
		}
	}

	.round {
		position: relative;
		z-index: 23;
		display: grid;
		place-items: center;
		inline-size: 3.75rem;
		block-size: 3.75rem;
		margin: 0;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: var(--wa-color-brand-fill-loud);
		color: var(--wa-color-brand-on-loud);
		font-size: 1.5rem;
		cursor: pointer;
		/* Darker than a light theme's shadow would be: on a background that
		   is already dark, this is what separates it from a row under it. */
		box-shadow: 0 0.6rem 1.4rem rgb(0 0 0 / 45%);
		/* A slide handle as well as a button, like the switcher's pill. */
		touch-action: none;
		user-select: none;
		-webkit-tap-highlight-color: transparent;

		wa-icon {
			display: block;
			line-height: 1;
			transition: rotate 200ms ease;
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: 3px;
		}

		&:disabled {
			cursor: progress;
			opacity: 0.7;
		}

		/* The + turns into a ×: tapping it again closes the fan. Any other
		   icon is swapped for a × instead, since it would not turn into one. */
		&.open.turns wa-icon {
			rotate: 45deg;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.round wa-icon {
			transition: none;
		}
	}
</style>
