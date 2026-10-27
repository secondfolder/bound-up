<script lang="ts">
	import { tick } from 'svelte';
	import { backOut, cubicOut } from 'svelte/easing';
	import { resolve } from '$app/paths';
	import { type AppContext, serialiseContext } from '$lib/context';
	import { type ContextShown, shownContexts, switchContext } from '$lib/context-client.svelte';
	import type { ContextSpaceView } from '$lib/types';
	import ContextAvatar from './ContextAvatar.svelte';

	/**
	 * The context switcher: a pill at the top right of a page whose list
	 * follows the context, showing whose things are shown. Tapping it fans
	 * every context out on a quarter-circle round the screen's top-right
	 * corner, and the pill becomes its own avatar on that arc; holding it, or
	 * pressing and sliding, opens the same fan, and letting go over an avatar
	 * picks it. See docs/contexts.md.
	 *
	 * A page opts in by rendering this (in `NestedPageHeader`'s `corner`) and
	 * by its load depending on the context. Nothing here decides where a write
	 * goes: it changes a view filter, and every action names its own space.
	 */
	let {
		spaces,
		context,
		you
	}: {
		spaces: readonly ContextSpaceView[];
		context: AppContext;
		/** The viewer's own name, for their slice of Everyone. */
		you: string;
	} = $props();

	// ── geometry ──────────────────────────────────────────────────────────────

	/** The pill's height, and so its avatar's size. */
	const CONTROL = 40;
	/** The avatars on the arc. */
	const SLOT = 56;
	const GAP = 8;
	const PAD_END = 12;
	const BORDER = 1;
	/** The arc's sweep, and how far in from the top and side edges it starts. */
	const SWEEP = 70;
	const START = 10;
	/** Close enough to an avatar's centre, while sliding, to be over it. */
	const HIT = 38;
	/** How long a press is held before it opens the fan to slide in. */
	const HOLD_MS = 280;
	/** How long a picked avatar stays on the arc before the pill flies home. */
	const PICK_MS = 240;

	const contexts = $derived(shownContexts(spaces, you));
	/**
	 * With no partner, Everyone is just you: offering both would be noise, so
	 * there is nothing to switch and no control.
	 */
	const visible = $derived(spaces.some((space) => space.kind === 'shared'));

	/** A context picked here before the page's data has caught up with it. */
	let pending = $state<string | null>(null);
	const currentKey = $derived(pending ?? serialiseContext(context));
	const current = $derived(
		contexts.find((shown) => shown.key === currentKey) ?? (contexts[0] as ContextShown)
	);

	/** Every slot on the arc, in order: the contexts, then "Add partner". */
	const slotKeys = $derived([...contexts.map((shown) => shown.key), 'add']);
	/**
	 * The arc's radius: 200px, or wider with more partners than fit, so the
	 * avatars never crowd. 66px of arc per gap is an avatar and its label.
	 */
	const radius = $derived(
		Math.max(200, (66 * Math.max(slotKeys.length - 1, 1)) / ((SWEEP * Math.PI) / 180))
	);
	/** The fan's own quarter-disc reaches past the avatars' labels. */
	const fanRadius = $derived(radius + 86);
	const step = $derived(SWEEP / Math.max(slotKeys.length - 1, 1));
	/** "Add partner" is the last slot. */
	const addIndex = $derived(contexts.length);

	/** A slot's centre, from the screen's top-right corner: left of it and down. */
	function slotOffset(index: number): { dx: number; dy: number; deg: number } {
		const deg = START + index * step;
		const angle = (deg * Math.PI) / 180;
		return { dx: radius * Math.cos(angle), dy: radius * Math.sin(angle), deg };
	}

	const addOffset = $derived(slotOffset(addIndex));

	// ── state ─────────────────────────────────────────────────────────────────

	let open = $state(false);
	/** Opened by holding or sliding, and the finger is still down. */
	let sliding = $state(false);
	/** The slot under the finger while sliding. */
	let hover = $state<string | null>(null);
	let labelWidth = $state(0);
	/**
	 * The screen's top-right corner (the app shell's), and the pill's avatar's
	 * centre when home, both in viewport pixels: measured when the fan opens,
	 * since the fan is drawn against the shell and the pill sits in the page.
	 */
	let corner = $state({ right: 0, top: 0 });
	let home = $state({ x: 0, y: 0 });

	let root: HTMLElement | undefined = $state();
	let anchor: HTMLElement | undefined = $state();
	let trigger: HTMLButtonElement | undefined = $state();
	const slotButtons: (HTMLElement | undefined)[] = $state([]);

	/** The label's width: folded into the avatar while open, measured otherwise (auto until it is). */
	const labelSize = $derived.by(() => {
		if (open) {
			return '0px';
		}
		return labelWidth > 0 ? `${labelWidth}px` : undefined;
	});

	/** The pill's whole closed width, held by its anchor so its avatar never moves as the label folds. */
	const closedWidth = $derived(
		labelWidth > 0 ? BORDER * 2 + CONTROL - BORDER + GAP + labelWidth + PAD_END : null
	);

	function reducedMotion(): boolean {
		return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
	}

	function measure() {
		const shell = root?.closest('[data-app-shell]')?.getBoundingClientRect();
		corner = shell
			? { right: shell.right, top: shell.top }
			: { right: document.documentElement.clientWidth, top: 0 };
		const box = anchor?.getBoundingClientRect();
		if (box) {
			home = { x: box.left + CONTROL / 2, y: box.top + CONTROL / 2 };
		}
	}

	// The pill's width follows the name, which moves the anchor's left edge
	// (it sits at the end of its row): measured again so a pill on the arc
	// flies back to where home now is.
	$effect(() => {
		void closedWidth;
		if (open) {
			measure();
		}
	});

	/** Where the pill is while the fan is open: on its own slot, as big as the others. */
	const flight = $derived.by(() => {
		if (!open) {
			return null;
		}
		const index = slotKeys.indexOf(currentKey);
		const { dx, dy } = slotOffset(Math.max(index, 0));
		const scale = (hover === currentKey ? 64 : SLOT) / CONTROL;
		return {
			x: corner.right - dx - home.x,
			y: corner.top + dy - home.y,
			scale
		};
	});

	/** The selection wedge: a slice of the quarter-disc, pointing at the selected slot. */
	const wedge = $derived.by(() => {
		const selected = hover && hover !== 'add' ? hover : currentKey;
		const index = Math.max(slotKeys.indexOf(selected), 0);
		const { deg } = slotOffset(index);
		const shown = contexts.find((candidate) => candidate.key === selected) ?? current;
		const half = step / 2;
		// Drawn once pointing at 45° from the top edge, then turned about the
		// corner, so it glides from slot to slot rather than redrawing.
		return {
			rotate: 45 - deg,
			background: `conic-gradient(at 100% 0%, transparent 0deg ${225 - half}deg, color-mix(in oklab, ${shown.colour} 34%, transparent) ${225 - half}deg ${225 + half}deg, transparent ${225 + half}deg 360deg)`
		};
	});

	const hint = $derived.by(() => {
		if (!sliding) {
			return 'Tap one, or next time hold the button and slide';
		}
		if (hover === 'add') {
			return 'Let go to add a partner';
		}
		const over = contexts.find((shown) => shown.key === hover);
		return over ? `Let go to show ${over.name}` : 'Slide onto one, then let go';
	});

	// ── opening, closing, picking ──────────────────────────────────────────────

	function openFan(bySliding: boolean) {
		measure();
		open = true;
		sliding = bySliding;
		hover = null;
		// Into the fan, on the one showing now, as a menu opens on its
		// selection. After the render that draws it.
		void tick().then(() => {
			const index = slotKeys.indexOf(currentKey);
			slotButtons[Math.max(index, 0)]?.focus({ preventScroll: true });
		});
	}

	function closeFan(returnFocus = true) {
		const hadFocus = root?.contains(document.activeElement) ?? false;
		open = false;
		sliding = false;
		hover = null;
		if (returnFocus && hadFocus) {
			trigger?.focus({ preventScroll: true });
		}
	}

	let closing: ReturnType<typeof setTimeout> | undefined;

	function pick(key: string) {
		cancelHold();
		press = null;
		const shown = contexts.find((candidate) => candidate.key === key);
		if (!shown || key === currentKey) {
			closeFan();
			return;
		}
		// Two steps: the pill first glides to the picked avatar's place on the
		// arc and becomes it, then flies home and unfolds with the new name.
		pending = key;
		sliding = false;
		hover = null;
		clearTimeout(closing);
		closing = setTimeout(() => closeFan(), reducedMotion() ? 0 : PICK_MS);
		void switchContext(shown.context).finally(() => {
			// By now the page's data says what the server has; anything else
			// (a refusal) puts the pill back to it.
			pending = null;
		});
	}

	// ── the press: a tap toggles, a hold or a slide opens to slide in ─────────

	let press: { x: number; y: number; wasOpen: boolean; sliding: boolean } | null = null;
	let hold: ReturnType<typeof setTimeout> | undefined;

	function cancelHold() {
		clearTimeout(hold);
		hold = undefined;
	}

	function slotAt(x: number, y: number): string | null {
		for (const [index, key] of slotKeys.entries()) {
			const { dx, dy } = slotOffset(index);
			if (Math.hypot(corner.right - dx - x, corner.top + dy - y) < HIT) {
				return key;
			}
		}
		return null;
	}

	function startSliding() {
		if (!press) {
			return;
		}
		press.sliding = true;
		if (open) {
			sliding = true;
		} else {
			openFan(true);
		}
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) {
			return;
		}
		try {
			trigger?.setPointerCapture(event.pointerId);
		} catch {
			// Capture keeps a slide's moves on the pill; without it a slide
			// still works while the finger stays over it.
		}
		press = { x: event.clientX, y: event.clientY, wasOpen: open, sliding: false };
		cancelHold();
		hold = setTimeout(startSliding, HOLD_MS);
	}

	function onpointermove(event: PointerEvent) {
		if (!press) {
			return;
		}
		if (!press.sliding && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
			cancelHold();
			startSliding();
		}
		if (press.sliding) {
			hover = slotAt(event.clientX, event.clientY);
		}
	}

	function onpointerup() {
		const ended = press;
		press = null;
		cancelHold();
		if (!ended) {
			return;
		}
		if (!ended.sliding) {
			if (ended.wasOpen) {
				closeFan();
			} else {
				openFan(false);
			}
			return;
		}
		const over = hover;
		sliding = false;
		hover = null;
		if (over === 'add') {
			slotButtons[slotKeys.indexOf('add')]?.click();
		} else if (over) {
			pick(over);
		}
		// Let go over nothing: the fan stays open, for tapping.
	}

	function onpointercancel() {
		press = null;
		cancelHold();
		sliding = false;
		hover = null;
	}

	/**
	 * A keyboard press: Enter and Space click a native button with no
	 * pointer, which `detail` 0 says. A pointer's click is already handled by
	 * the press above, so it is ignored here rather than toggling twice.
	 */
	function onclick(event: MouseEvent) {
		if (event.detail !== 0) {
			return;
		}
		if (open) {
			closeFan();
		} else {
			openFan(false);
		}
	}

	/** Escape closes, from anywhere inside: on this component, not the window. */
	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			event.stopPropagation();
			closeFan();
		}
	}

	/** Tabbing out of the fan closes it, rather than leaving it over the page. */
	function onfocusout(event: FocusEvent) {
		const next = event.relatedTarget;
		if (open && next instanceof Node && !root?.contains(next)) {
			closeFan(false);
		}
	}

	/**
	 * The page under the open fan does not scroll: the pill is measured
	 * against it, and would drift off its slot. Non-passive, so it can refuse.
	 */
	function holdStill(node: HTMLElement) {
		const stop = (event: Event) => event.preventDefault();
		node.addEventListener('wheel', stop, { passive: false });
		node.addEventListener('touchmove', stop, { passive: false });
		return () => {
			node.removeEventListener('wheel', stop);
			node.removeEventListener('touchmove', stop);
		};
	}

	$effect(() => {
		if (!open) {
			return;
		}
		// A resize moves the corner out from under the arc.
		const close = () => closeFan(false);
		window.addEventListener('resize', close);
		return () => window.removeEventListener('resize', close);
	});

	$effect(() => () => {
		clearTimeout(closing);
		cancelHold();
	});

	// ── transitions ───────────────────────────────────────────────────────────

	/** An avatar popping out of the corner to its slot, and back in on closing. */
	function fromCorner(_node: Element, { dx, dy, delay }: { dx: number; dy: number; delay: number }) {
		return {
			delay: reducedMotion() ? 0 : delay,
			duration: reducedMotion() ? 0 : 440,
			easing: backOut,
			css: (t: number) =>
				`opacity: ${Math.min(1, t * 1.5)}; transform: translate(${(dx * (1 - t)).toFixed(1)}px, ${(-dy * (1 - t)).toFixed(1)}px) scale(${0.2 + 0.8 * t})`
		};
	}

	/** The quarter-disc unfolding from the corner. */
	function unfold(_node: Element) {
		return {
			duration: reducedMotion() ? 0 : 300,
			easing: cubicOut,
			css: (t: number) => `transform: scale(${t})`
		};
	}

	function fade(_node: Element) {
		return {
			duration: reducedMotion() ? 0 : 180,
			css: (t: number) => `opacity: ${t}`
		};
	}
</script>

{#if visible}
	<!-- The keydown and focusout here are for Escape and tabbing away from
	     whichever of the buttons inside has focus; the element itself is
	     not interactive. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="switcher" bind:this={root} {onkeydown} {onfocusout}>
		<span
			class="anchor"
			bind:this={anchor}
			style:inline-size={closedWidth === null ? undefined : `${closedWidth}px`}
		>
			<!-- A native button, not a wa-button: it is a disclosure trigger, and
			     wa-button leaves `aria-expanded` on its host, never reaching the
			     inner <button> (AGENTS.md). -->
			<button
				type="button"
				class="control"
				class:open
				bind:this={trigger}
				aria-expanded={open}
				aria-haspopup="true"
				aria-label="Showing {current.name}. Choose whose to show"
				style:transform={flight
					? `translate(${flight.x.toFixed(1)}px, ${flight.y.toFixed(1)}px) scale(${flight.scale})`
					: undefined}
				{onpointerdown}
				{onpointermove}
				{onpointerup}
				{onpointercancel}
				{onclick}
			>
				<span class="control-avatar">
					<ContextAvatar kind={current.kind} size={CONTROL} people={current.people} />
				</span>
				<span
					class="label"
					style:inline-size={labelSize}
				>
					<span class="label-inner" bind:offsetWidth={labelWidth}>
						{current.name}
						<wa-icon name="chevron-down" variant="solid"></wa-icon>
					</span>
				</span>
			</button>
		</span>

		{#if open}
			<!-- Out of the tab order: Escape is the keyboard's way to close. -->
			<button
				type="button"
				class="backdrop"
				tabindex="-1"
				aria-label="Close"
				transition:fade
				onclick={() => closeFan()}
				{@attach holdStill}
			></button>
			<div
				class="fan"
				aria-hidden="true"
				transition:unfold
				style:top="{corner.top}px"
				style:left="{corner.right - fanRadius}px"
				style:--fan="{fanRadius}px"
			>
				<div
					class="wedge"
					style:rotate="{wedge.rotate.toFixed(2)}deg"
					style:background={wedge.background}
				></div>
			</div>
			<p
				class="hint"
				aria-hidden="true"
				transition:fade
				style:top="{corner.top + 72}px"
				style:left="{corner.right - 136}px"
			>
				{hint}
			</p>
			<fieldset class="slots" aria-label="Whose to show">
				{#each contexts as shown, index (shown.key)}
					{const offset = $derived(slotOffset(index))}
					{const isCurrent = $derived(shown.key === currentKey)}
					<button
						type="button"
						class="slot"
						class:hovered={hover === shown.key}
						bind:this={slotButtons[index]}
						aria-label="Show {shown.name}"
						aria-current={isCurrent ? 'true' : undefined}
						style:left="{corner.right - offset.dx - 44}px"
						style:top="{corner.top + offset.dy - SLOT / 2}px"
						transition:fromCorner={{ dx: offset.dx, dy: offset.dy, delay: index * 35 }}
						onclick={() => pick(shown.key)}
					>
						<!-- The one showing now is the pill itself, flown here, so its
						     own avatar stays out of sight underneath. -->
						<span class="slot-avatar" class:standing-in={isCurrent}>
							<ContextAvatar kind={shown.kind} size={SLOT} people={shown.people} />
						</span>
						<span class="slot-name">{shown.name}</span>
					</button>
				{/each}
				<a
					class="slot"
					class:hovered={hover === 'add'}
					href={resolve('/(auth-required)/(app)/settings/partners/new')}
					bind:this={slotButtons[addIndex]}
					style:left="{corner.right - addOffset.dx - 44}px"
					style:top="{corner.top + addOffset.dy - SLOT / 2}px"
					transition:fromCorner={{ dx: addOffset.dx, dy: addOffset.dy, delay: addIndex * 35 }}
				>
					<span class="slot-avatar">
						<ContextAvatar kind="add" size={SLOT} />
					</span>
					<span class="slot-name">Add partner</span>
				</a>
			</fieldset>
		{/if}
	</div>
{/if}

<style>
	.switcher {
		display: contents;
	}

	/* A fieldset for its grouping; none of a fieldset's own look. */
	.slots {
		margin: 0;
		padding: 0;
		border: none;
		min-inline-size: 0;
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
			transform 380ms cubic-bezier(0.25, 0.9, 0.3, 1.08),
			gap 340ms ease,
			padding 340ms ease,
			background-color 300ms ease,
			border-color 300ms ease;

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: 2px;
		}
	}

	/* Open, the pill is only its avatar, ringed, standing in on the arc. */
	.control.open {
		gap: 0;
		padding: 0;
		border-color: transparent;
		background: transparent;

		.control-avatar {
			box-shadow:
				0 0 0 2px var(--wa-color-surface-default),
				0 0 0 3.5px var(--accent-color);
		}

		.label {
			opacity: 0;
		}
	}

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
		border: none;
		padding: 0;
		background: var(--wa-color-overlay-modal);
		cursor: default;
	}

	.fan {
		position: fixed;
		z-index: 21;
		inline-size: var(--fan);
		block-size: var(--fan);
		border-end-start-radius: var(--fan);
		background: var(--wa-color-surface-default);
		border-inline-start: 1px solid var(--wa-color-brand-border-quiet);
		border-block-end: 1px solid var(--wa-color-brand-border-quiet);
		transform-origin: top right;
		overflow: hidden;
		pointer-events: none;
	}

	.wedge {
		position: absolute;
		inset: 0;
		border-end-start-radius: var(--fan);
		transform-origin: 100% 0;
		transition: rotate 220ms cubic-bezier(0.25, 0.9, 0.3, 1.1);
	}

	.hint {
		position: fixed;
		z-index: 22;
		inline-size: 118px;
		margin: 0;
		text-align: end;
		font-size: var(--wa-font-size-2xs);
		line-height: 1.4;
		color: var(--wa-color-text-quiet);
		pointer-events: none;
	}

	.slot-avatar {
		display: flex;
		border-radius: 50%;
		transition: transform 120ms ease-out;

		&.standing-in {
			opacity: 0;
		}
	}

	.slot-name {
		font-size: var(--wa-font-size-2xs);
		font-weight: var(--wa-font-weight-semibold);
		white-space: nowrap;
	}

	.slot {
		position: fixed;
		z-index: 22;
		inline-size: 88px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--wa-color-text-normal);
		font: inherit;
		text-decoration: none;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	/* The ring goes round the avatar, not the whole button and its label. */
	.slot:focus-visible {
		outline: none;

		.slot-avatar {
			outline: var(--wa-focus-ring);
			outline-offset: 3px;
		}
	}

	.slot.hovered {
		.slot-avatar {
			transform: scale(1.18);
			box-shadow:
				0 0 0 3px var(--wa-color-surface-default),
				0 0 0 5px var(--accent-color);
		}

		.slot-name {
			font-weight: 800;
			color: var(--accent-color);
		}
	}

	.slot[aria-current='true'] .slot-name {
		font-weight: 800;
	}

	@media (prefers-reduced-motion: reduce) {
		.control,
		.label,
		.wedge,
		.slot-avatar {
			transition: none;
		}
	}
</style>
