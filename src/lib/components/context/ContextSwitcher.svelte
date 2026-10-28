<script lang="ts">
	import { tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { resolve } from '$app/paths';
	import { type AppContext, serialiseContext } from '$lib/context';
	import { type ContextShown, shownContexts, switchContext } from '$lib/context-client.svelte';
	import {
		type Box,
		CLOSE_MS,
		diskScale,
		FAN_CSS_EASING,
		fanCentre,
		fanDuration,
		fanEase,
		HOVER_SCALE,
		hintPlacement,
		LABEL_GAP,
		LABEL_GOOD,
		LABEL_HEIGHT,
		layoutFan,
		OPTION_MS,
		OPTION_STAGGER_MS,
		optionAt,
		optionTiming,
		type Point,
		pillDuration,
		wedgeShading
	} from '$lib/context-fan';
	import type { ContextSpaceView } from '$lib/types';
	import ContextAvatar from './ContextAvatar.svelte';

	/**
	 * The context switcher: a pill at the top right of a page whose list
	 * follows the context, showing whose things are shown. Tapping it fans
	 * every context out round a disk centred a little above and right of the
	 * pill (on a phone, the screen's top-right corner), spread evenly over all
	 * of the ring that can be seen, and the pill becomes its own avatar on
	 * that ring; holding it, or pressing and sliding, opens the same fan, and
	 * letting go over an avatar picks it. The layout is `$lib/context-fan`'s.
	 * See docs/contexts.md.
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

	// ── sizes and timings ─────────────────────────────────────────────────────

	/** The pill's height, and so its avatar's size. */
	const CONTROL = 40;
	const GAP = 8;
	const PAD_END = 12;
	const BORDER = 1;
	/** How near where a press began the finger still counts as on the pill, not the fan. */
	const PRESS_QUIET = 24;
	/** How long a press is held before it opens the fan to slide in. */
	const HOLD_MS = 280;
	/** How long a picked avatar stays on the arc before the pill flies home. */
	const PICK_MS = 240;

	/** The hint's box: at most three lines, wrapping within this width. */
	const HINT = { width: 150, height: 46 };

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

	/** Every option on the ring, in order: the contexts, then "Add partner". */
	const slotKeys = $derived([...contexts.map((shown) => shown.key), 'add']);
	/** "Add partner" is the last. */
	const addIndex = $derived(contexts.length);

	// ── state ─────────────────────────────────────────────────────────────────

	let open = $state(false);
	/** Opened by holding or sliding, and the finger is still down. */
	let sliding = $state(false);
	/** The option under the finger while sliding. */
	let hover = $state<string | null>(null);
	let labelWidth = $state(0);

	/**
	 * What the fan is laid out from, in viewport pixels: the disk's centre,
	 * what can be seen of the app shell above its bottom nav, and the pill's
	 * avatar's centre when home. Measured on opening and again on a resize or
	 * a scroll, since the fan is drawn against the shell and the pill sits in
	 * the page. Kept after closing, so the options leaving still know where
	 * they are going back to.
	 */
	let measured = $state<{ centre: Point; bounds: Box; home: Point } | null>(null);

	const layout = $derived(
		measured
			? layoutFan({ centre: measured.centre, bounds: measured.bounds, count: slotKeys.length })
			: null
	);
	const hintAt = $derived(layout && measured ? hintPlacement(layout, measured.bounds, HINT) : null);

	let root: HTMLElement | undefined = $state();
	let anchor: HTMLElement | undefined = $state();
	let trigger: HTMLButtonElement | undefined = $state();
	let group: HTMLElement | undefined = $state();
	let backdrop: HTMLElement | undefined = $state();
	let hintElement: HTMLElement | undefined = $state();
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
		const shellElement = root?.closest('[data-app-shell]');
		const rect = shellElement?.getBoundingClientRect();
		const shell: Box = rect
			? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
			: {
					left: 0,
					top: 0,
					right: document.documentElement.clientWidth,
					bottom: document.documentElement.clientHeight
				};
		// Options under the bottom nav could be neither read nor tapped.
		const nav = shellElement?.querySelector(':scope > nav')?.getBoundingClientRect();
		const bounds = nav ? { ...shell, bottom: Math.min(shell.bottom, nav.top) } : shell;
		const box = anchor?.getBoundingClientRect();
		if (!box) {
			return;
		}
		measured = {
			centre: fanCentre({ right: box.right, middle: box.top + box.height / 2 }, shell),
			bounds,
			home: { x: box.left + CONTROL / 2, y: box.top + CONTROL / 2 }
		};
	}

	// The pill's width follows the name, which moves the anchor's left edge
	// (it sits at the end of its row): measured again so a pill on the ring
	// flies back to where home now is.
	$effect(() => {
		void closedWidth;
		if (open) {
			measure();
		}
	});

	/** Where the pill is while the fan is open: on its own option, as big as the others. */
	const flight = $derived.by(() => {
		if (!(open && layout && measured)) {
			return null;
		}
		const at = layout.points[Math.max(slotKeys.indexOf(currentKey), 0)];
		if (!at) {
			return null;
		}
		const size = hover === currentKey ? layout.avatar * HOVER_SCALE : layout.avatar;
		return {
			x: at.x - measured.home.x,
			y: at.y - measured.home.y,
			scale: size / CONTROL
		};
	});

	/**
	 * The selection wedge: the selected option's sector of the disk, as wide
	 * as the angle between neighbours and centred on it, which is exactly what
	 * a slide hit-tests (`optionAt`). Drawn once pointing up and
	 * turned about the disk's centre, so it glides from option to option
	 * rather than redrawing.
	 */
	const wedge = $derived.by(() => {
		if (!layout) {
			return null;
		}
		// "Add partner" too: letting go there opens it, so it is what is selected.
		const selected = hover ?? currentKey;
		const angle = layout.angles[Math.max(slotKeys.indexOf(selected), 0)] ?? 0;
		// "Add partner" has no space of its own, so no colour (and glows rather
		// than drawing the wedge, which fades out under it).
		const colour =
			selected === 'add'
				? 'var(--accent-color)'
				: (contexts.find((candidate) => candidate.key === selected) ?? current).colour;
		const width = layout.step;
		const shading = wedgeShading(layout);
		const degrees = (value: number) => `${value.toFixed(2)}deg`;
		const share = (value: number) => `${(value * 100).toFixed(1)}%`;
		return {
			selected,
			// Up is -90° on the screen.
			rotate: angle + 90,
			// Solid in the selected context's colour, its two straight sides
			// fading in over the feather, inside the sector.
			background: `conic-gradient(from ${degrees(-width / 2)}, transparent 0deg, ${colour} ${degrees(shading.feather)}, ${colour} ${degrees(width - shading.feather)}, transparent ${degrees(width)})`,
			// Fading out towards the centre once past the avatars, and solid out
			// to the rim, which the disk's own edge cuts crisply. Round the
			// disk's centre, so turning the wedge leaves it as it is.
			mask: `radial-gradient(circle closest-side, transparent ${share(shading.clear)}, black ${share(shading.full)})`
		};
	});

	const hint = $derived.by(() => {
		// Sliding, letting go picks; opened by a tap, a mouse over an option
		// (or the keyboard's focus on one) says a click will.
		const verb = sliding ? 'Let go' : 'Click';
		if (hover === 'add') {
			return `${verb} to add a partner`;
		}
		const over = contexts.find((shown) => shown.key === hover);
		if (over && (sliding || over.key !== currentKey)) {
			return `${verb} to show ${over.name}`;
		}
		return sliding
			? 'Slide onto one, then let go'
			: 'Tap one, or next time hold the button and slide';
	});

	/** Where an option's button goes: its avatar centred on its point, its name under it. */
	function placeOf(index: number) {
		const at = layout?.points[index] ?? { x: 0, y: 0 };
		const avatar = layout?.avatar ?? 56;
		const width = Math.max(avatar, layout?.label ?? 0);
		const centre = measured?.centre ?? at;
		return {
			left: at.x - width / 2,
			top: at.y - avatar / 2,
			width,
			height: avatar + LABEL_GAP + LABEL_HEIGHT,
			// From the option back to the disk's centre, for its way in and out.
			dx: centre.x - at.x,
			dy: centre.y - at.y
		};
	}

	const addPlace = $derived(placeOf(addIndex));

	// ── opening, closing, picking ──────────────────────────────────────────────

	function openFan(bySliding: boolean) {
		measure();
		// Opened again while still closing, Svelte turns the closing fan
		// round rather than drawing a new one, so the backdrop is the one
		// `closeFan` let clicks through: it has to take them again, or a tap
		// on the nav under the open fan went through and changed page.
		if (backdrop) {
			backdrop.style.pointerEvents = '';
			backdrop.classList.remove('pointing');
		}
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
		// The backdrop stays while the options fly back in, and would take a
		// tap meant for the page, or for the pill, the moment after closing.
		if (backdrop) {
			backdrop.style.pointerEvents = 'none';
		}
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
		// ring and becomes it, then flies home and unfolds with the new name.
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

	/**
	 * The option whose sector of the disk the finger is in (`optionAt`): the
	 * wedge drawn under it is that sector. Nothing within a fingertip of where
	 * the press began, so a wobble on the pill picks nothing.
	 */
	function slotAt(x: number, y: number): string | null {
		if (!layout) {
			return null;
		}
		const still = press ? { x: press.x, y: press.y } : null;
		const index = optionAt(layout, { x, y }, { still, quiet: PRESS_QUIET });
		return index === null ? null : (slotKeys[index] ?? null);
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
	 * against it, and would drift off its option. Non-passive, so it can refuse.
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

	/**
	 * A click anywhere but on the pill, an option or the hint closes the fan. On the
	 * document, in the capture phase, rather than only on the backdrop: the
	 * backdrop covers the shell, but the app-wide notice is drawn above it,
	 * and a click there must close the fan too. A click the backdrop takes
	 * goes no further, so nothing under the fan is acted on.
	 */
	$effect(() => {
		if (!open) {
			return;
		}
		const outside = (event: MouseEvent) => {
			const { target } = event;
			// A mouse click in the sector of the option lit under it picks that
			// option, as a slide's letting go there does: the wedge says so.
			const under = event.detail > 0 && !sliding ? slotAt(event.clientX, event.clientY) : null;
			const onOption = target instanceof Node && (group?.contains(target) ?? false);
			if (under && under === hover && !onOption) {
				event.preventDefault();
				event.stopPropagation();
				if (under === 'add') {
					slotButtons[slotKeys.indexOf('add')]?.click();
				} else {
					pick(under);
				}
				return;
			}
			// The hint is part of the switcher too: its text can be selected
			// and copied without the fan closing under the pointer.
			const parts = [trigger, group, hintElement];
			if (target instanceof Node && parts.some((part) => part?.contains(target))) {
				return;
			}
			closeFan();
		};
		document.addEventListener('click', outside, true);
		return () => document.removeEventListener('click', outside, true);
	});

	/**
	 * Opened by a tap, a mouse moving over the fan lights the option whose
	 * sector it is in, as a slide does, so it is plain what a click there
	 * will do; off the disk, the one showing is lit again. Not for touch,
	 * which has no hover: a tap-opened fan shows the current context until a
	 * tap picks one. On the document, since the disk under the pointer takes
	 * no events of its own.
	 */
	$effect(() => {
		if (!open) {
			return;
		}
		const follow = (event: PointerEvent) => {
			if (sliding || press || event.pointerType === 'touch') {
				return;
			}
			hover = slotAt(event.clientX, event.clientY);
			// A click anywhere in that sector picks, so the pointer says so:
			// on the backdrop, whose cursor shows over the disk, which takes no
			// pointer events of its own.
			backdrop?.classList.toggle('pointing', hover !== null);
		};
		document.addEventListener('pointermove', follow);
		return () => document.removeEventListener('pointermove', follow);
	});

	/** Keyboard focus on an option lights it the same way. */
	function onfocusin(event: FocusEvent) {
		if (sliding) {
			return;
		}
		const index = slotButtons.findIndex((button) => button !== undefined && button === event.target);
		const key = index === -1 ? null : (slotKeys[index] ?? null);
		// The one showing is lit already; focus lands on it as the fan opens,
		// which is not a choice.
		hover = key === currentKey ? null : key;
	}

	/**
	 * A resize lays the fan out again rather than closing it: the shell, and
	 * so how much of the ring shows, has changed, and so may where the pill
	 * is. So may a scroll the page makes by itself. Once a frame at most.
	 */
	$effect(() => {
		if (!open) {
			return;
		}
		let frame = 0;
		const again = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(measure);
		};
		window.addEventListener('resize', again);
		window.visualViewport?.addEventListener('resize', again);
		document.addEventListener('scroll', again, true);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('resize', again);
			window.visualViewport?.removeEventListener('resize', again);
			document.removeEventListener('scroll', again, true);
		};
	});

	$effect(() => () => {
		clearTimeout(closing);
		cancelHold();
	});

	// ── transitions ───────────────────────────────────────────────────────────

	/**
	 * An option springing out of the disk's centre to its place, and back in
	 * on closing. The one showing now is the pill itself, flown to its place,
	 * so only its name comes in, once the pill is nearly there.
	 *
	 * `|global` where used: the options are in an `{#each}` inside the
	 * `{#if open}`, and a local transition plays only when its own block
	 * comes or goes, so they used to appear and vanish at once while only
	 * "Add partner", directly in the `{#if}`, sprang.
	 */
	function fromCentre(
		_node: Element,
		{
			dx,
			dy,
			delay,
			isCurrent,
			opening
		}: { dx: number; dy: number; delay: number; isCurrent: boolean; opening: boolean }
	) {
		if (reducedMotion()) {
			return { duration: 0 };
		}
		if (isCurrent && !opening) {
			// Its name goes as the pill leaves, in the first half of the fan's
			// closing time: it stays where it is rather than falling into the
			// centre, and left for the whole time it lingered on its own.
			return { duration: CLOSE_MS / 2, css: (t: number) => `opacity: ${t.toFixed(3)}` };
		}
		if (isCurrent) {
			// Its name fades in as the pill arrives. The wait is inside the
			// transition, not its `delay`, which Svelte spends showing the
			// element fully opaque.
			const wait = 160;
			const total = wait + 200;
			return {
				duration: total,
				css: (t: number) => `opacity: ${cubicOut(Math.max(0, (t * total - wait) / 200)).toFixed(3)}`
			};
		}
		return {
			delay,
			duration: optionTiming(0, opening).duration,
			easing: fanEase(opening),
			// Out along its ray by the eased share `t`, and grown by the same
			// share, so the disk (`unfold`, scaled by `t` on the clock of the
			// option furthest out) always holds it: avatar, name and all.
			css: (t: number) =>
				`opacity: ${Math.min(1, t * 1.5)}; transform: translate(${(dx * (1 - t)).toFixed(1)}px, ${(dy * (1 - t)).toFixed(1)}px) scale(${Math.max(t, 0).toFixed(3)})`
		};
	}

	/**
	 * The disk growing from its centre and shrinking back into it, in step
	 * with the options, on their clock and easing (`diskScale`): scaled to
	 * the option furthest out, so none is ever outside it and it never hangs
	 * out round them.
	 */
	function unfold(_node: Element, { count, opening }: { count: number; opening: boolean }) {
		if (reducedMotion()) {
			return { duration: 0 };
		}
		const duration = fanDuration(count, opening);
		return {
			duration,
			// `t` runs 1 to 0 closing, so the time gone is measured from its end.
			css: (t: number) =>
				`transform: scale(${diskScale((opening ? t : 1 - t) * duration, count, opening).toFixed(3)})`
		};
	}

	/**
	 * The hint comes last, once the options have mostly landed, so it does
	 * not compete with them for the eye while they move.
	 */
	function hintIn(_node: Element, { count }: { count: number }) {
		if (reducedMotion()) {
			return { duration: 0 };
		}
		// The wait is part of the transition rather than its `delay`: Svelte
		// draws an element as it is, fully opaque, through a delay, so the
		// hint showed at once, vanished, and then faded in.
		const wait = (count - 1) * OPTION_STAGGER_MS + OPTION_MS * 0.7;
		const fadeMs = 220;
		const total = wait + fadeMs;
		return {
			duration: total,
			css: (t: number) => `opacity: ${cubicOut(Math.max(0, (t * total - wait) / fadeMs)).toFixed(3)}`
		};
	}

	/** And goes first, gone before the options are back at the centre. */
	function hintOut(_node: Element) {
		return {
			duration: reducedMotion() ? 0 : 100,
			css: (t: number) => `opacity: ${t}`
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
	     not interactive. `data-context-switcher` is what the app shell leaves
	     live while it holds the page during a switch (`holdWhileSwitching`),
	     so the pill can fly home and take focus back. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="switcher" data-context-switcher bind:this={root} {onkeydown} {onfocusout}>
		<!-- What letting go will do, while sliding, for assistive tech: polite,
		     and only when it changes (the option under the finger, not every
		     move). Always rendered, since a live region added with its text
		     is not announced. -->
		<span class="wa-visually-hidden" aria-live="polite">{open && sliding ? hint : ''}</span>
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
				style:--flight-ease={open ? FAN_CSS_EASING.opening : FAN_CSS_EASING.home}
				style:--flight-ms="{pillDuration(open)}ms"
				style:transform={flight
					? `translate(${flight.x.toFixed(1)}px, ${flight.y.toFixed(1)}px) scale(${flight.scale.toFixed(3)})`
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

		{#if open && layout && measured}
			<!-- A slight dim over the whole shell, nav included, and what takes
			     a click off the fan. A div rather than the <button> it was: Web
			     Awesome's native styles give every <button> the form control's
			     height, which beat `inset: 0`, so it covered a 43px strip along
			     the top and every click below that went to the page. Closing on
			     a click is the document listener's job. -->
			<div class="backdrop" bind:this={backdrop} transition:fade {@attach holdStill}></div>
			<!-- The disk is clipped to what the options may use, so it never
			     covers the nav. -->
			<div
				class="stage"
				aria-hidden="true"
				style:left="{measured.bounds.left}px"
				style:top="{measured.bounds.top}px"
				style:width="{measured.bounds.right - measured.bounds.left}px"
				style:height="{measured.bounds.bottom - measured.bounds.top}px"
			>
				<div
					class="disk"
					data-fan-disk
					in:unfold|global={{ count: slotKeys.length, opening: true }}
					out:unfold|global={{ count: slotKeys.length, opening: false }}
					style:left="{measured.centre.x - measured.bounds.left - layout.disk}px"
					style:top="{measured.centre.y - measured.bounds.top - layout.disk}px"
					style:--disk="{layout.disk * 2}px"
				>
					{#if wedge}
						<div
							class="wedge"
							class:hidden={wedge.selected === 'add'}
							data-fan-wedge={wedge.selected}
							style:rotate="{wedge.rotate.toFixed(2)}deg"
							style:background={wedge.background}
							style:mask-image={wedge.mask}
						></div>
					{/if}
				</div>
			</div>
			{#if hintAt}
				<!-- Shown, not read: the live region by the pill says what matters.
				     At the top of the page: right-aligned against its right edge
				     when the disk is mostly cut off there, centred over the disk
				     otherwise (`hintPlacement`). Moved by a transform, so it glides
				     between the two, and the text is drawn twice, once each way,
				     cross-fading, so its alignment never jumps. -->
				<p
					class="hint"
					class:right={hintAt.side === 'right'}
					bind:this={hintElement}
					aria-hidden="true"
					data-fan-hint={hintAt.side}
					in:hintIn|global={{ count: slotKeys.length }}
					out:hintOut|global
					style:transform="translate({hintAt.x.toFixed(1)}px, {hintAt.y.toFixed(1)}px)"
					style:width="{HINT.width}px"
					style:height="{HINT.height}px"
				>
					<span class="hint-centred">{hint}</span>
					<span class="hint-right">{hint}</span>
				</p>
			{/if}
			<fieldset
				class="slots"
				{onfocusin}
				aria-label="Whose to show"
				class:crowded={layout.label < LABEL_GOOD}
				bind:this={group}
				style:--avatar="{layout.avatar}px"
				style:--lit-scale={HOVER_SCALE}
				style:--label="{layout.label}px"
				style:--label-gap="{LABEL_GAP}px"
				style:--label-height="{LABEL_HEIGHT}px"
			>
				{#each contexts as shown, index (shown.key)}
					{const place = $derived(placeOf(index))}
					{const isCurrent = $derived(shown.key === currentKey)}
					<button
						type="button"
						class="slot"
						class:hovered={hover === shown.key}
						class:selected={wedge?.selected === shown.key}
						data-fan-option
						bind:this={slotButtons[index]}
						aria-label="Show {shown.name}"
						aria-current={isCurrent ? 'true' : undefined}
						style:left="{place.left}px"
						style:top="{place.top}px"
						style:width="{place.width}px"
						style:height="{place.height}px"
						in:fromCentre|global={{ dx: place.dx, dy: place.dy, delay: optionTiming(index, true).delay, isCurrent, opening: true }}
						out:fromCentre|global={{ dx: place.dx, dy: place.dy, delay: optionTiming(index, false).delay, isCurrent, opening: false }}
						onclick={() => pick(shown.key)}
					>
						<!-- The one showing now is the pill itself, flown here, so its
						     own avatar stays out of sight underneath; its name shows. -->
						<span class="slot-avatar" class:standing-in={isCurrent} data-fan-avatar>
							<ContextAvatar kind={shown.kind} size={layout.avatar} people={shown.people} />
						</span>
						<span class="slot-name" data-fan-label>{shown.name}</span>
					</button>
				{/each}
				<a
					class="slot add"
					class:hovered={hover === 'add'}
					class:selected={wedge?.selected === 'add'}
					data-fan-option
					href={resolve('/(auth-required)/(app)/settings/partners/new')}
					bind:this={slotButtons[addIndex]}
					style:left="{addPlace.left}px"
					style:top="{addPlace.top}px"
					style:width="{addPlace.width}px"
					style:height="{addPlace.height}px"
					in:fromCentre|global={{ dx: addPlace.dx, dy: addPlace.dy, delay: optionTiming(addIndex, true).delay, isCurrent: false, opening: true }}
					out:fromCentre|global={{ dx: addPlace.dx, dy: addPlace.dy, delay: optionTiming(addIndex, false).delay, isCurrent: false, opening: false }}
				>
					<span class="slot-avatar" data-fan-avatar>
						<ContextAvatar kind="add" size={layout.avatar} />
					</span>
					<span class="slot-name" data-fan-label>Add partner</span>
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

	/* Very slight, and even over the whole shell: the fan is what stands out.
	   The disk takes no pointer events, so over it the cursor is this one's:
	   the pointer anywhere in an option's sector, where a click picks it. */
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
		background: color-mix(in oklab, var(--wa-color-overlay-modal) 45%, transparent);

		/* Set from the script (`follow`), so it is :global to Svelte. */
		&:global(.pointing) {
			cursor: pointer;
		}
	}

	.stage {
		position: fixed;
		z-index: 21;
		overflow: hidden;
		pointer-events: none;
	}

	.disk {
		position: absolute;
		inline-size: var(--disk);
		block-size: var(--disk);
		border-radius: 50%;
		background: var(--wa-color-surface-default);
		border: 1px solid var(--wa-color-brand-border-quiet);
		box-sizing: border-box;
		overflow: hidden;
	}

	.wedge {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		transition:
			rotate 220ms cubic-bezier(0.25, 0.9, 0.3, 1.1),
			opacity 160ms ease;

		/* Under "Add partner", which glows instead. */
		&.hidden {
			opacity: 0;
		}
	}

	.hint {
		position: fixed;
		inset-block-start: 0;
		inset-inline-start: 0;
		z-index: 22;
		display: grid;
		margin: 0;
		font-size: var(--wa-font-size-2xs);
		line-height: 1.4;
		color: var(--wa-color-text-quiet);
		/* Above the backdrop like the rest of the fan, and selectable. */
		user-select: text;
		cursor: text;
		transition: transform 320ms cubic-bezier(0.25, 0.8, 0.25, 1);

		/* The two alignments, stacked in one cell, one showing at a time. */
		span {
			grid-area: 1 / 1;
			overflow: hidden;
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 3;
			line-clamp: 3;
			transition: opacity 320ms ease;
		}

		.hint-centred {
			text-align: center;
		}

		/* The copy not showing can be neither pointed at nor selected, so a
		   selection starts in the one that shows and copies its words once. */
		.hint-right {
			text-align: end;
			opacity: 0;
			pointer-events: none;
			user-select: none;
		}

		&.right {
			.hint-centred {
				opacity: 0;
				pointer-events: none;
				user-select: none;
			}

			.hint-right {
				opacity: 1;
				pointer-events: auto;
				user-select: text;
			}
		}
	}

	.slot-avatar {
		position: relative;
		display: flex;
		flex: none;
		border-radius: 50%;
		transition: transform 120ms ease-out;

		&.standing-in {
			opacity: 0;
		}
	}

	/* One line, as wide as the layout allows; a longer name ends in "…"
	   and is still whole in the option's accessible name. */
	.slot-name {
		box-sizing: border-box;
		max-inline-size: var(--label);
		block-size: var(--label-height);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--wa-font-size-2xs);
		line-height: var(--label-height);
		font-weight: var(--wa-font-weight-semibold);
		transition: transform 120ms ease-out;
	}

	/* Sized and placed by the layout. Every property Web Awesome's native
	   <button> styles set that matters is set here: its height and
	   `justify-content: center` used to centre an avatar-and-name taller
	   than the button on the button, which moved every avatar up 18px from
	   where the pill flew to, and the pill covered its own name. */
	.slot {
		position: fixed;
		z-index: 22;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		gap: var(--label-gap);
		min-inline-size: 0;
		margin: 0;
		padding: 0;
		border: none;
		border-radius: 0;
		background: transparent;
		color: var(--wa-color-text-normal);
		font: inherit;
		text-decoration: none;
		cursor: pointer;
		/* Grown and shrunk about its avatar's centre, on the way in and out. */
		transform-origin: 50% calc(var(--avatar) / 2);
		-webkit-tap-highlight-color: transparent;
	}

	/* Keyboard focus only: a thin cream outline round the avatar, not the
	   whole button and its label. Not the theme's amber focus ring, which
	   would look like the ring that used to mark the lit option. */
	.slot:focus-visible {
		outline: none;

		.slot-avatar {
			outline: 2px solid var(--wa-color-text-normal);
			outline-offset: 3px;
		}
	}

	/* A crowded fan (many partners on a phone) has narrow names: a size
	   smaller keeps "Everyone" and "Add partner" whole in them. */
	.crowded .slot-name {
		font-size: calc(var(--wa-font-size-2xs) - 1px);
	}

	/* Lit: the avatar grows (`HOVER_SCALE`) and its name moves down by the
	   growth, on the same transition, so the two never meet. The layout
	   leaves room for both. No ring: the wedge is the marker. */
	.slot.hovered {
		.slot-avatar {
			transform: scale(var(--lit-scale));
		}

		.slot-name {
			transform: translateY(calc(var(--avatar) * (var(--lit-scale) - 1)));
			font-weight: 800;
			color: var(--accent-color);
		}
	}

	/* "Add partner" is not a context like the others, so lit it has no
	   wedge: a soft cream glow behind its "+", and a brighter dashed edge. */
	.slot.add {
		.slot-avatar::before {
			content: '';
			position: absolute;
			inset: -60%;
			z-index: -1;
			border-radius: 50%;
			background: radial-gradient(
				circle closest-side,
				color-mix(in oklab, var(--wa-color-text-normal) 45%, transparent),
				transparent
			);
			opacity: 0;
			transition: opacity 160ms ease;
		}

		&.selected {
			.slot-avatar::before {
				opacity: 1;
			}

			.slot-avatar :global(.avatar.add) {
				border-color: var(--wa-color-text-normal);
			}
		}
	}

	/* The selected option sits on the wedge, solid in its own colour, which
	   the light space colours would take the name's contrast from. So its
	   name sits on a chip of the disk's own surface: as legible as the
	   others, whatever the colour under it. */
	/* The keyline that keeps an avatar from vanishing into its own colour. */
	.slot.selected .slot-avatar {
		box-shadow: 0 0 0 2px var(--wa-color-surface-default);
	}

	.slot.selected .slot-name {
		padding-inline: 4px;
		border-radius: var(--wa-border-radius-s);
		background: var(--wa-color-surface-default);
	}

	.slot[aria-current='true'] .slot-name {
		font-weight: 800;
	}

	@media (prefers-reduced-motion: reduce) {
		.control,
		.label,
		.wedge,
		.slot-avatar,
		.hint,
		.hint span {
			transition: none;
		}
	}
</style>
