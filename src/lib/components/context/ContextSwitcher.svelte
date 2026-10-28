<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { type AppContext, serialiseContext } from '$lib/context';
	import { type ContextShown, shownContexts, switchContext } from '$lib/context-client.svelte';
	import { FAN_CSS_EASING, fanCentre, pillDuration } from '$lib/context-fan';
	import type { ContextSpaceView } from '$lib/types';
	import ContextAvatar from './ContextAvatar.svelte';
	import ContextSelectorFan, { type FanOption } from './ContextSelectorFan.svelte';

	/**
	 * The context switcher: a pill at the top right of a page whose list
	 * follows the context, showing whose things are shown. Tapping it fans
	 * every context out round a disk centred a little above and right of the
	 * pill (on a phone, the screen's top-right corner), and the pill becomes
	 * its own avatar on that ring; holding it, or pressing and sliding, opens
	 * the same fan, and letting go over an avatar picks it. The fan itself is
	 * `ContextSelectorFan`, which the add button shares; this is the pill, and
	 * what a pick does. See docs/contexts.md.
	 *
	 * A page opts in by rendering this (in its header's `corner`) and by its
	 * load depending on the context. Nothing here decides where a write goes:
	 * it changes a view filter, and every action names its own space.
	 */
	let {
		spaces,
		context,
		you,
		onswitch
	}: {
		spaces: readonly ContextSpaceView[];
		context: AppContext;
		/** The viewer's own name, for their slice of Everyone. */
		you: string;
		/**
		 * Called once a switch the server took has landed, for a page that is
		 * somewhere else in each context (the kink list's own list and each
		 * partner's view) and so goes there itself.
		 */
		onswitch?: (context: AppContext) => void;
	} = $props();

	/** The pill's height, and so its avatar's size. */
	const CONTROL = 40;
	const GAP = 8;
	const PAD_END = 12;
	const BORDER = 1;

	const contexts = $derived(shownContexts(spaces, you));
	/**
	 * With no partner the switcher offers Me and "Add partner" alone: there is
	 * no Everyone (`shownContexts`), which would just be Me again. Shown even
	 * then, so adding a partner is a tap away. Only with no space at all is
	 * there nothing to draw.
	 */
	const visible = $derived(contexts.length > 0);

	/** A context picked here before the page's data has caught up with it. */
	let pending = $state<string | null>(null);
	const storedKey = $derived(pending ?? serialiseContext(context));
	// With no partner, a stored Everyone is shown as Me, the same things:
	// Everyone is not on offer then, so it is Me that is current, sits under
	// the pill and is not switched to when picked.
	const current = $derived(
		contexts.find((shown) => shown.key === storedKey) ?? (contexts[0] as ContextShown)
	);
	const currentKey = $derived(current.key);

	/** Every option on the ring, in order: the contexts, then "Add partner". */
	const options = $derived<FanOption[]>([
		...contexts.map((shown) => ({
			key: shown.key,
			kind: shown.kind,
			people: shown.people,
			name: shown.name,
			label: `Show ${shown.name}`,
			colour: shown.colour
		})),
		{
			key: 'add',
			kind: 'add',
			name: 'Add partner',
			label: 'Add partner',
			colour: 'var(--accent-color)',
			href: resolve('/(auth-required)/(app)/settings/partners/new')
		}
	]);

	let fan: ContextSelectorFan | undefined = $state();
	let labelWidth = $state(0);
	let labelInner: HTMLElement | undefined = $state();
	let pill: HTMLButtonElement | undefined = $state();

	/** The label's width: folded into the avatar while open, measured otherwise (auto until it is). */
	function labelSize(open: boolean): string | undefined {
		if (open) {
			return '0px';
		}
		return labelWidth > 0 ? `${labelWidth}px` : undefined;
	}

	/** The pill's whole closed width, held by its anchor so its avatar never moves as the label folds. */
	const closedWidth = $derived(
		labelWidth > 0 ? BORDER * 2 + CONTROL - BORDER + GAP + labelWidth + PAD_END : null
	);

	// The pill's width follows the name, which moves the anchor's left edge
	// (it sits at the end of its row): measured again so a pill on the ring
	// flies back to where home now is.
	$effect(() => {
		void closedWidth;
		fan?.remeasure();
	});

	function place(box: DOMRect, shell: { left: number; top: number; right: number; bottom: number }) {
		return {
			centre: fanCentre({ right: box.right, middle: box.top + box.height / 2 }, shell),
			home: { x: box.left + CONTROL / 2, y: box.top + CONTROL / 2 }
		};
	}

	function pick(key: string) {
		const shown = contexts.find((candidate) => candidate.key === key);
		if (!shown || key === currentKey) {
			fan?.close();
			return;
		}
		// One flight, from the picked avatar's place on the ring into the
		// control. The pill becomes the picked avatar where it is, unseen (no
		// transition), and then flies home with the fan closing round it.
		//
		// It used to glide from the old one's place to the picked one's first,
		// and it jumped before that: the new name changed the pill's closed
		// width, which moved its anchor (it ends its row, so its left edge
		// moves) a frame later, when the label's size was next observed, and
		// the pill with it, before its transform caught up. So the new name's
		// width is read at once, and the anchor resized and measured, all
		// before the next paint.
		pending = key;
		// No transition while it does: a class set here rather than state,
		// since nothing else reads it.
		pill?.classList.add('landing');
		void tick().then(async () => {
			labelWidth = labelInner?.offsetWidth ?? labelWidth;
			await tick();
			fan?.remeasure();
			await tick();
			// Committed where it is before the transitions come back on.
			pill?.getBoundingClientRect();
			// And from there straight home, from the next frame: no pause on
			// the ring, which only left a tap on the pill in that time closing
			// the fan it meant to open.
			requestAnimationFrame(() => {
				pill?.classList.remove('landing');
				fan?.close();
			});
		});
		void switchContext(shown.context)
			.then((switched) => {
				if (switched) {
					onswitch?.(shown.context);
				}
			})
			.finally(() => {
				// By now the page's data says what the server has; anything else
				// (a refusal) puts the pill back to it.
				pending = null;
			});
	}
</script>

{#if visible}
	<!-- `data-context-switcher` is what the app shell leaves live while it
	     holds the page during a switch (`holdWhileSwitching`), so the pill can
	     fly home and take focus back. -->
	<div class="switcher" data-context-switcher>
		<ContextSelectorFan
			bind:this={fan}
			{options}
			current={currentKey}
			standIn
			label="Whose to show"
			help={{ tap: 'Tap one, or next time hold the button and slide', slide: 'Slide onto one, then let go' }}
			letGo={(option) =>
				option.key === 'add' ? 'Let go to add a partner' : `Let go to show ${option.name}`}
			{place}
			onpick={pick}
		>
			{#snippet trigger({ open, anchor, button, flight })}
				<span
					class="anchor"
					{@attach anchor}
					style:inline-size={closedWidth === null ? undefined : `${closedWidth}px`}
				>
					<!-- A native button, not a wa-button: it is a disclosure trigger, and
					     wa-button leaves `aria-expanded` on its host, never reaching the
					     inner <button> (AGENTS.md). -->
					<button
						type="button"
						class="control"
						class:open
						bind:this={pill}
						{@attach button}
						aria-expanded={open}
						aria-haspopup="true"
						aria-label="Showing {current.name}. Choose whose to show"
						style:--flight-ease={open ? FAN_CSS_EASING.opening : FAN_CSS_EASING.home}
						style:--flight-ms="{pillDuration(open)}ms"
						style:transform={flight
							? `translate(${flight.x.toFixed(1)}px, ${flight.y.toFixed(1)}px) scale(${(flight.size / CONTROL).toFixed(3)})`
							: undefined}
					>
						<span class="control-avatar">
							<ContextAvatar kind={current.kind} size={CONTROL} people={current.people} />
						</span>
						<span class="label" style:inline-size={labelSize(open)}>
							<span class="label-inner" bind:this={labelInner} bind:offsetWidth={labelWidth}>
								{current.name}
								<wa-icon name="chevron-down" variant="solid"></wa-icon>
							</span>
						</span>
					</button>
				</span>
			{/snippet}
		</ContextSelectorFan>
	</div>
{/if}

<style>
	.switcher {
		display: contents;
	}

	/* Holds the pill's closed width in the page, so the pill can be pinned
	   by its avatar's left edge: the label folds into the avatar rather than
	   the avatar sliding right as the pill shrinks. */
	.anchor {
		position: relative;
		display: inline-flex;
		flex: none;
		block-size: 40px;
	}

	.control-avatar {
		display: flex;
		/* Over the border, so the avatar is the pill's whole left end. */
		margin: -1px 0 -1px -1px;
		border-radius: 50%;
	}

	.label {
		display: flex;
		overflow: hidden;
		white-space: nowrap;
		transition:
			inline-size 340ms cubic-bezier(0.25, 0.8, 0.25, 1),
			opacity 260ms ease;
	}

	.label-inner {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 8px;

		wa-icon {
			font-size: 0.75em;
		}
	}

	.control {
		position: relative;
		z-index: 23;
		display: flex;
		align-items: center;
		gap: 8px;
		block-size: 40px;
		padding: 0 12px 0 0;
		border: 1px solid var(--wa-color-brand-border-normal);
		border-radius: 999px;
		background: var(--wa-color-surface-default);
		color: var(--wa-color-text-normal);
		font: inherit;
		font-size: var(--wa-font-size-s);
		font-weight: var(--wa-font-weight-bold);
		cursor: pointer;
		/* The pill is a slide handle as well as a button: a drag must not
		   scroll the page or start a browser gesture. */
		touch-action: none;
		user-select: none;
		-webkit-tap-highlight-color: transparent;
		transform-origin: 20px 20px;
		transition:
			/* The options' curve and time (`FAN_CSS_EASING`, `pillDuration`), so the
			   pill lands on the ring with the same bounce as they do. */
			transform var(--flight-ms) var(--flight-ease),
			gap 340ms ease,
			padding 340ms ease,
			background-color 300ms ease,
			border-color 300ms ease;

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: 2px;
		}
	}

	/* Open, the pill is only its avatar, standing in on the ring. No amber
	   ring round it: the wedge under it says it is the one showing. Only a
	   keyline of the disk's own colour, since the wedge is the avatar's own
	   colour and the avatar vanished into it without one. */
	.control.open {
		gap: 0;
		padding: 0;
		border-color: transparent;
		background: transparent;

		.control-avatar {
			box-shadow: 0 0 0 2px var(--wa-color-surface-default);
		}

		.label {
			opacity: 0;
		}
	}

	/* Becoming a picked avatar in its place: at once, unseen. Set from the
	   script (`pick`), so :global to Svelte. */
	.control:global(.landing),
	.control:global(.landing) .label {
		transition: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.control,
		.label {
			transition: none;
		}
	}
</style>
