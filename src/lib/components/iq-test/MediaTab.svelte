<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import type { TransitionConfig } from 'svelte/transition';
	import type { TabLayout } from '$lib/playroom/iq-test/dock';
	import type { SoundChannel } from '$lib/playroom/iq-test/sound.svelte';
	import SoundControl from './SoundControl.svelte';

	/**
	 * One tab of the media dock at the foot of the IQ test: the hypno's or the
	 * porn's.
	 *
	 * Collapsed, it is a bar as wide as its contents, and its contents step
	 * down with the room it has (`layout`, worked out by the page from the
	 * dock's width — see `dock.ts`): the full title, then a single word; the
	 * action labelled, then an icon; the slider, then only the mute toggle; the
	 * full detail, then a short one; and at the last only the icon, the toggle
	 * and the button that opens the panel.
	 *
	 * Expanded, the tab becomes its panel: the same controls, at full size, as
	 * the panel's header, the collapse button in its top-right corner, and
	 * `children` below. The panel is centred over the dock, on top of the
	 * other tabs rather than squeezing them, and grows there out of the tab's
	 * own place (see `grow`). The tab keeps its place in the row, unseen, so
	 * nothing beside it moves.
	 */
	let {
		name,
		icon = null,
		glyph = null,
		iconSnippet,
		layout,
		title,
		shortTitle = name,
		detail = null,
		shortDetail = detail,
		channel = null,
		action = null,
		more = true,
		expanded,
		panelId,
		ontoggle,
		testid,
		headerExtra,
		barExtra,
		titleHref = null,
		byline = null,
		scrollAnchor = 'top',
		actionInHead = false,
		element = $bindable(),
		children
	}: {
		/** What the tab is for: "Hypno", "Porn". Names the region and its buttons. */
		name: string;
		/** A Font Awesome icon name, as `wa-icon` takes it. */
		icon?: string | null;
		/** Text drawn in the icon's place, for a mark no icon set has ("XXX"). */
		glyph?: string | null;
		/** A drawn icon, for one Font Awesome does not have (the hypno's spiral). */
		iconSnippet?: Snippet;
		layout: TabLayout;
		/** The full title, at the widest layout and in the panel. */
		title: string;
		/** The one-word title, once there is less room. Defaults to `name`. */
		shortTitle?: string;
		/** The full detail, while there is room: progress over total time, say. */
		detail?: string | null;
		/** The short detail: just what is left. */
		shortDetail?: string | null;
		/** The sound it controls, or none (porn with no clip that has sound). */
		channel?: SoundChannel | null;
		/** The tab's one action, shown in the bar when there is room and always in the panel. */
		action?: { label: string; icon: string; onclick: () => void } | null;
		/**
		 * Whether there is a panel to open. Not when the bar already shows
		 * everything the panel would.
		 */
		more?: boolean;
		expanded: boolean;
		/** The id of the panel the "more" button opens, for `aria-controls`. */
		panelId: string;
		ontoggle: () => void;
		testid?: string;
		/** More buttons for the panel's header, after the action. */
		headerExtra?: Snippet;
		/** More controls for the collapsed bar, before its action: the settings' slider. */
		barExtra?: Snippet;
		/** Where the title links to in the panel: the hypno's bambicloud page, for credit. */
		titleHref?: string | null;
		/** A line under the panel's title, beside the detail: "by" the hypno's author. */
		byline?: string | null;
		/**
		 * Which end of the panel's content stays put when the content changes
		 * size. `bottom` for the settings, whose slider is last: options
		 * appearing above it, once there are too many to fit, scroll in above
		 * it rather than pushing it down out of view.
		 */
		scrollAnchor?: 'top' | 'bottom';
		/**
		 * Put the action in the middle of the panel's first row, rather than
		 * in the row of controls under it: for the settings, whose only
		 * control it is (fullscreen), so the header is one row.
		 */
		actionInHead?: boolean;
		/** The tab's own box, for the dock: what is inside it, and where it is. */
		element?: HTMLElement;
		/** What the panel shows below its header, scrolling under it when it does not fit. */
		children?: Snippet;
	} = $props();

	const shownTitle = $derived.by(() => {
		if (layout.title === 'full') {
			return title;
		}
		return layout.title === 'short' ? shortTitle : null;
	});
	const shownDetail = $derived.by(() => {
		if (layout.detail === 'full') {
			return detail;
		}
		return layout.detail === 'short' ? shortDetail : null;
	});

	/** What in the bar does something of its own, and so is not a click on the bar. */
	const INTERACTIVE =
		'button, a, input, label, select, fieldset, wa-button, wa-slider, wa-select, .sound-control';

	/**
	 * A click on the bar's own surface — its icon, its title, the gaps —
	 * opens the panel too, as a bigger target for the same thing as the
	 * chevron. The chevron is still the control: it is what the keyboard and a
	 * screen reader reach, which is why this is a listener for a pointer
	 * rather than the bar made into a second, unlabelled button.
	 */
	function opensOnClick(bar: HTMLElement) {
		const onClick = (event: MouseEvent) => {
			const target = event.target instanceof Element ? event.target : null;
			if (more && !target?.closest(INTERACTIVE)) {
				ontoggle();
			}
		};
		bar.addEventListener('click', onClick);
		return () => bar.removeEventListener('click', onClick);
	}

	/**
	 * The open panel's header collapses it on a click on its own surface (the
	 * icon, the title's line, the gaps), mirroring the bar, which opens on
	 * one. The chevron is still the control for the keyboard and a screen
	 * reader.
	 */
	function collapsesOnClick(header: HTMLElement) {
		const onClick = (event: MouseEvent) => {
			const target = event.target instanceof Element ? event.target : null;
			if (!target?.closest(INTERACTIVE)) {
				ontoggle();
			}
		};
		header.addEventListener('click', onClick);
		return () => header.removeEventListener('click', onClick);
	}

	/**
	 * Keep the content's distance from its bottom as it grows and shrinks, so
	 * what is at the bottom stays where it is. Starts at the bottom: a panel
	 * that was not scrolling, and then has to, opens scrolled to its end.
	 *
	 * The scroller's own box does not change when its content does, so each
	 * child is watched for size, and the children themselves for coming and
	 * going.
	 */
	function keepsBottom(scroller: HTMLElement) {
		let fromBottom = 0;
		const measure = () => {
			fromBottom = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
		};
		const restore = () => {
			scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight - fromBottom;
		};
		const sizes = new ResizeObserver(restore);
		const watchChildren = () => {
			sizes.disconnect();
			sizes.observe(scroller);
			for (const child of scroller.children) {
				sizes.observe(child);
			}
		};
		const comings = new MutationObserver(watchChildren);
		watchChildren();
		comings.observe(scroller, { childList: true });
		scroller.addEventListener('scroll', measure, { passive: true });
		return () => {
			scroller.removeEventListener('scroll', measure);
			comings.disconnect();
			sizes.disconnect();
		};
	}

	let from: DOMRect | null = null;
	/**
	 * What, when it changes, changes the bar's size. Not `expanded`: the
	 * panel floats over the dock, and the bar keeps its place under it.
	 */
	const shape = $derived(`${JSON.stringify(layout)}|${more}`);

	/**
	 * Grow or shrink the bar between its old size and its new one, both
	 * measured, as the dock's room steps its contents up or down.
	 *
	 * The size is read before the DOM changes (`$effect.pre`) and again after,
	 * and the Web Animations API runs between the two with the overflow
	 * clipped. No library: the whole of it is these two effects.
	 */
	$effect.pre(() => {
		void shape;
		from = element ? element.getBoundingClientRect() : null;
	});

	$effect(() => {
		void shape;
		const node = element;
		const start = from;
		from = null;
		if (!(node && start) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return;
		}
		const end = node.getBoundingClientRect();
		if (Math.abs(start.width - end.width) < 1 && Math.abs(start.height - end.height) < 1) {
			return;
		}
		const timing = { duration: 160, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' };
		const fixed = { flex: 'none', overflow: 'hidden' };
		node.animate(
			[
				{ ...fixed, width: `${start.width}px`, height: `${start.height}px` },
				{ ...fixed, width: `${end.width}px`, height: `${end.height}px` }
			],
			timing
		);
		node.firstElementChild?.animate([{ opacity: 0 }, { opacity: 1 }], timing);
	});

	/**
	 * The panel growing out of the bar's place to its own, centred over the
	 * dock, and shrinking back into it when put away: its position, width and
	 * height all run from the bar's box to its own, with its contents fading
	 * in behind. A transition rather than the effects above, because the
	 * panel has to outlive `expanded` to shrink away at all.
	 *
	 * Position and size are animated, not a transform: a scaled panel would
	 * squash its text on the way. Animating `flex-grow`, as the dock once
	 * did, jumped from the bar's height to its width partway, because a zero
	 * basis and an `auto` one are not points on one line.
	 */
	function grow(panel: HTMLElement): TransitionConfig {
		const frame = panel.offsetParent;
		if (!(element && frame) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return { duration: 0 };
		}
		const bar = element.getBoundingClientRect();
		const own = panel.getBoundingClientRect();
		const origin = frame.getBoundingClientRect().left;
		const along = (start: number, end: number, t: number) => start + (end - start) * t;
		return {
			duration: 160,
			easing: cubicOut,
			css: (t) =>
				[
					`inset-inline: ${along(bar.left, own.left, t) - origin}px auto`,
					'margin-inline: 0',
					`inline-size: ${along(bar.width, own.width, t)}px`,
					`block-size: ${along(bar.height, own.height, t)}px`,
					'overflow: hidden',
					`--content-opacity: ${t * t}`
				].join(';')
		};
	}
</script>

{#snippet mark()}
	{#if iconSnippet}
		<span class="icon">{@render iconSnippet()}</span>
	{:else if glyph}
		<!-- Decorative: the region's name says what the tab is. -->
		<span class="glyph" aria-hidden="true">{glyph}</span>
	{:else if icon}
		<wa-icon class="icon" name={icon} variant="solid"></wa-icon>
	{/if}
{/snippet}

{#snippet actionButton(button: NonNullable<typeof action>)}
	<wa-button size="s" appearance="outlined" onclick={button.onclick}>
		<wa-icon slot="start" name={button.icon} variant="solid"></wa-icon>
		{button.label}
	</wa-button>
{/snippet}

{#snippet toggle()}
	<!--
		A native button: it is a disclosure trigger, and its state is
		`aria-expanded`, which wa-button does not forward to the button inside it.
	-->
	<button
		type="button"
		class="more"
		aria-expanded={expanded}
		aria-controls={panelId}
		aria-label="More {name.toLowerCase()} controls"
		onclick={ontoggle}
	>
		<wa-icon name={expanded ? 'chevron-down' : 'chevron-up'} variant="solid"></wa-icon>
	</button>
{/snippet}

<section
	bind:this={element}
	class="media-tab"
	class:expanded
	class:no-slider={!layout.slider}
	aria-label={name}
	data-testid={testid}
>
	{#if expanded}
		<!-- Before the bar, so its controls come first: the bar under it is only a placeholder. -->
		<section id={panelId} class="panel" aria-label="{name} controls" transition:grow>
			<!--
				The header stays at the top however long the panel is: only what is
				below it scrolls. A click on its own surface collapses the panel,
				as the chevron does (see `collapsesOnClick`).
			-->
			<div class="panel-header" {@attach collapsesOnClick}>
				<div class="panel-head" class:centred={actionInHead && action}>
					<span class="lead">
						{@render mark()}
						<span class="text">
							<span class="title" data-testid={testid ? `${testid}-title` : undefined}>
								{#if titleHref}
									<a href={titleHref} target="_blank" rel="noopener noreferrer">{title}</a>
								{:else}
									{title}
								{/if}
							</span>
							{#if byline || detail}
								<span class="subline">
									<span class="byline">{byline ?? ''}</span>
									{#if detail}
										<span class="detail" data-testid={testid ? `${testid}-detail` : undefined}
											>{detail}</span
										>
									{/if}
								</span>
							{/if}
						</span>
					</span>
					{#if action && actionInHead}
						{@render actionButton(action)}
					{/if}
					{@render toggle()}
				</div>
				{#if channel || (action && !actionInHead) || headerExtra}
					<div class="panel-controls">
						{#if channel}
							<SoundControl {channel} label={name} />
						{/if}
						{#if action && !actionInHead}
							{@render actionButton(action)}
						{/if}
						{@render headerExtra?.()}
					</div>
				{/if}
			</div>
			{#if children}
				<!--
					Hidden while empty (see the style): a snippet that renders
					nothing — the hypno's, for a vibe with one source and the list
					put away — still leaves this, and its padding and rule.
				-->
				<div
					class="panel-content"
					data-testid={testid ? `${testid}-scroll` : undefined}
					{@attach scrollAnchor === 'bottom' ? keepsBottom : undefined}
				>
					{@render children()}
				</div>
			{/if}
		</section>
	{/if}
	<!--
		Kept while the panel is up, unseen and inert, so the tab holds its place
		in the row and the tabs beside it stay where they are.
	-->
	<div class="bar" class:opens={more} inert={expanded} {@attach opensOnClick}>
		{@render mark()}
		{#if shownTitle || shownDetail}
			<span class="text">
				{#if shownTitle}
					<span class="title" data-testid={testid && !expanded ? `${testid}-title` : undefined}
						>{shownTitle}</span
					>
				{/if}
				{#if shownDetail}
					<span class="detail" data-testid={testid && !expanded ? `${testid}-detail` : undefined}
						>{shownDetail}</span
					>
				{/if}
			</span>
		{/if}
		{#if channel}
			<SoundControl {channel} label={name} />
		{/if}
		{#if barExtra && layout.slider}
			{@render barExtra()}
		{/if}
		{#if action && layout.action === 'label'}
			{@render actionButton(action)}
		{:else if action && layout.action === 'icon'}
			<wa-button size="s" appearance="plain" pill class="action-icon" onclick={action.onclick}>
				<wa-icon name={action.icon} variant="solid" label={action.label}></wa-icon>
			</wa-button>
		{/if}
		{#if more}
			{@render toggle()}
		{/if}
	</div>
</section>

<style>
	.media-tab {
		/* As wide as what it is showing, never more. */
		flex: 0 0 auto;
		box-sizing: border-box;
		min-inline-size: 0;
		max-inline-size: 100%;
		display: flex;
		flex-direction: column;
		/* Clear of a phone's home indicator, which sits over the foot of the page. */
		padding: 0.5rem 0.625rem calc(0.5rem + env(safe-area-inset-bottom));
		border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
		border-block-end: none;
		border-start-start-radius: var(--wa-border-radius-l);
		border-start-end-radius: var(--wa-border-radius-l);
		background: var(--wa-color-surface-raised);
		box-shadow: var(--wa-shadow-s);

		/* The bar holds the tab's place under the panel, unseen. */
		&.expanded {
			visibility: hidden;
		}

		/* Centred over the whole dock (`.dock-tabs` is the positioned one, not
		   the tab), standing on its foot, on top of the other tabs rather than
		   taking room from them. */
		.panel {
			visibility: visible;
			position: absolute;
			z-index: 1;
			inset-block-end: 0;
			inset-inline: 0;
			margin-inline: auto;
			box-sizing: border-box;
			/* Not the whole of a wide window: past this a panel is only longer
			   lines and emptier rows. */
			inline-size: min(100%, 48rem);
			max-block-size: min(75svh, 44rem);
			display: flex;
			flex-direction: column;
			/* Clear of a phone's home indicator, whichever part is last. */
			padding-block-end: env(safe-area-inset-bottom);
			border: var(--wa-border-width-s) solid var(--wa-color-brand-border-loud);
			border-block-end: none;
			border-start-start-radius: var(--wa-border-radius-l);
			border-start-end-radius: var(--wa-border-radius-l);
			background: var(--wa-color-surface-raised);
			box-shadow: var(--wa-shadow-l);

			/* Faded in behind the panel as it grows (see `grow`). */
			> * {
				opacity: var(--content-opacity, 1);
			}
		}

		/* Fixed at the top: never scrolls away, whatever is below. */
		.panel-header {
			flex: none;
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
			padding: 0.75rem 0.875rem;
			cursor: pointer;
		}

		/* Everything below the header, scrolling as one when it does not fit. */
		.panel-content {
			flex: 1 1 auto;
			min-block-size: 0;
			overflow-y: auto;
			/* A grid, not a flex column: flex items shrink to fit, which squashed
			   the hypno list instead of letting this scroll. */
			display: grid;
			align-content: start;
			gap: 0.75rem;
			padding: 0.75rem 0.875rem;
			border-block-start: var(--wa-border-width-s) solid var(--wa-color-surface-border);

			/* Svelte's anchors are comments, which :empty ignores. */
			&:empty {
				display: none;
			}
		}

		.panel-controls {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.75rem;

			:global(.sound-control) {
				margin: 0;
			}
		}

		.bar {
			display: flex;
			align-items: center;
			gap: 0.5rem;

			&.opens {
				cursor: pointer;
			}
		}

		.icon {
			flex: none;
			color: var(--wa-color-brand-on-quiet);
		}

		.glyph {
			flex: none;
			font-weight: 900;
			font-size: 0.9375rem;
			letter-spacing: 0.04em;
			line-height: 1;
			color: var(--wa-color-brand-on-quiet);
		}

		.text {
			min-inline-size: 0;
			display: flex;
			flex-direction: column;
			line-height: 1.2;
			font-size: 0.8125rem;

			.title {
				max-inline-size: 14rem;
				font-weight: 700;
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
			}

			.detail {
				color: var(--wa-color-text-quiet);
				white-space: nowrap;
				font-variant-numeric: tabular-nums;
			}
		}

		/* The bar's own volume: its slider is the first thing to go. */
		.bar :global(.sound-control) {
			flex: none;
			margin: 0;
			inline-size: auto;
			/* Its own gaps do nothing when clicked. */
			cursor: auto;
		}

		.bar :global(.sound-control wa-slider) {
			flex: none;
			inline-size: 9rem;
		}

		&.no-slider .bar :global(.sound-control wa-slider) {
			display: none;
		}

		/* Every control in the bar as tall as the rest (the mute toggle, the
		   chevron, two lines of title and detail): 2rem, so a collapsed tab is
		   the same height at every width. At Web Awesome's small size a button
		   was 38px against their 32, which made a tab showing a labelled action
		   (Next, New porn) — or the settings tab, which keeps its icon action on
		   a narrow screen — taller than the others. */
		.bar wa-button {
			flex: none;
			--wa-form-control-height: 2rem;
		}

		.more {
			flex: none;
			display: grid;
			place-items: center;
			inline-size: 2rem;
			block-size: 2rem;
			padding: 0;
			border: none;
			border-radius: 50%;
			background: none;
			color: var(--wa-color-text-normal);
			cursor: pointer;

			&:focus-visible {
				outline: var(--wa-focus-ring);
				outline-offset: var(--wa-focus-ring-offset);
			}
		}

		.panel-head {
			display: flex;
			align-items: flex-start;
			gap: 0.625rem;

			.lead {
				flex: 1 1 auto;
				min-inline-size: 0;
				display: flex;
				align-items: flex-start;
				gap: 0.625rem;
			}

			/* The action in the middle of the row, whatever the title's length —
			   unless the title needs more than half what is left, when it gets
			   it whole and the action moves over. */
			&.centred {
				display: grid;
				grid-template-columns: minmax(max-content, 1fr) auto minmax(max-content, 1fr);
				align-items: center;

				.more {
					justify-self: end;
				}
			}

			.text {
				flex: 1 1 auto;
				font-size: 0.9375rem;
			}

			/* The track name gets the room it needs here, a step up from the bar. */
			.title {
				max-inline-size: none;
				white-space: normal;
				font-size: 1.125rem;

				a {
					color: inherit;
				}
			}

			/* "by" on the left, the time on the right. */
			.subline {
				display: flex;
				justify-content: space-between;
				align-items: baseline;
				gap: 1rem;
			}

			.byline {
				color: var(--wa-color-text-quiet);
			}
		}
	}
</style>
