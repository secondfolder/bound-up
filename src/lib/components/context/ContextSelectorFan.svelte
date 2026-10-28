<script lang="ts" module>
	import type { Attachment } from 'svelte/attachments';
	import type { AvatarPerson } from '$lib/context-client.svelte';
	import type { Box, Point } from '$lib/context-fan';

	/** One avatar on the fan. */
	export type FanOption = {
		key: string;
		/** What its avatar draws (`ContextAvatar`). */
		kind: 'all' | 'solo' | 'shared' | 'add';
		people?: AvatarPerson[];
		/** Shown where the hint is while it is lit: the options carry no names of their own. */
		name: string;
		/** Its accessible name, which says what picking it does ("Show Jun", "Add a task for Jun"). */
		label: string;
		/** The wedge behind it while it is selected. */
		colour: string;
		/** A link rather than a pick ("Add partner"): it glows lit, rather than drawing a wedge. */
		href?: string;
	};

	/** What the trigger is handed to draw itself with. */
	export type FanTrigger = {
		open: boolean;
		/** The element measured for where the fan is centred, and where a flying trigger goes home to. */
		anchor: Attachment<HTMLElement>;
		/** The button pressed: its press, slide and keyboard handling. */
		button: Attachment<HTMLButtonElement>;
		/**
		 * While open, for a trigger that stands in for the current option on
		 * the ring (the switcher's pill): how far it moves from home to its
		 * place, and the size its avatar takes there.
		 */
		flight: { x: number; y: number; size: number } | null;
	};
</script>

<script lang="ts">
	import { type Snippet, tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import {
		diskScale,
		fanDuration,
		fanEase,
		type HintFrom,
		HOVER_SCALE,
		hintPlacement,
		layoutFan,
		optionAt,
		optionTiming,
		sectorOf,
		wedgeGradient,
		wedgePolygon,
		wedgeShading,
		wedgeSpan
	} from '$lib/context-fan';
	import ContextAvatar from './ContextAvatar.svelte';

	/**
	 * A fan of contexts to choose from: tapping the trigger fans every option
	 * out round a disk, spread evenly over all of the ring that can be seen;
	 * holding it, or pressing and sliding, opens the same fan, and letting go
	 * over an avatar picks it. The layout is `$lib/context-fan`'s.
	 *
	 * Shared by the context switcher (`ContextSwitcher`, whose pill flies onto
	 * the ring as the option showing now) and the add button (`AddButton`,
	 * which asks whose a new item is for in Everyone). Each draws its own
	 * trigger through `trigger` and decides what a pick does through
	 * `onpick`; the fan itself only chooses. See docs/contexts.md, "The fan".
	 */
	let {
		options,
		current = null,
		standIn = false,
		label,
		help,
		letGo,
		place,
		hintFrom = 'top',
		wrapEnds = false,
		litLead = null,
		dimNav = true,
		onpick,
		trigger
	}: {
		options: readonly FanOption[];
		/** The option selected until another is lit: the one showing now. None for a fan that adds. */
		current?: string | null;
		/** Whether the trigger flies onto the ring as `current`, whose own avatar then stays hidden under it. */
		standIn?: boolean;
		/** The group of options' accessible name. */
		label: string;
		/** What to do, while nothing is lit: opened by a tap, and while sliding. */
		help: { tap: string; slide: string };
		/** What letting go over `option` will do, said to assistive tech while sliding. */
		letGo: (option: FanOption) => string;
		/**
		 * Where the disk is centred, and where home is for a trigger that flies
		 * (its avatar's centre), from the anchor's box and the app shell's; and
		 * for a fan round its own trigger, the radius to keep clear (`clear`),
		 * so the disk is only as big as its avatars need.
		 */
		place: (anchor: DOMRect, shell: Box) => { centre: Point; home: Point; clear?: number };
		/** Where the hint starts looking for room: the top of the page, or just above the disk. */
		hintFrom?: HintFrom;
		/**
		 * Whether the two end options take the rest of the disk too (see
		 * `layoutFan`): for a fan whose disk shows past the run of edge its
		 * avatars are spread along, so every part of it that shows picks one.
		 */
		wrapEnds?: boolean;
		/**
		 * Over a lit option's name in the hint, small, saying what picking it
		 * does: "New task for", over "Jun". None for the switcher, whose
		 * names say it themselves.
		 */
		litLead?: string | null;
		/** Whether the dim covers the bottom nav too, or stops above it and leaves it as it is. */
		dimNav?: boolean;
		onpick: (key: string) => void;
		trigger: Snippet<[FanTrigger]>;
	} = $props();

	/** How near where a press began the finger still counts as on the trigger, not the fan. */
	const PRESS_QUIET = 24;
	/** How long a press is held before it opens the fan to slide in. */
	const HOLD_MS = 280;

	/**
	 * The hint's box: at most three lines of help, or two of a lit option's
	 * name at its much larger size, wrapping within this width; a line taller
	 * with a lead over the name (`litLead`).
	 */
	const HINT = $derived({ width: 150, height: litLead ? 78 : 60 });

	const keys = $derived(options.map((option) => option.key));

	// ── state ─────────────────────────────────────────────────────────────────

	let open = $state(false);
	/** Opened by holding or sliding, and the finger is still down. */
	let sliding = $state(false);
	/** The option under the finger while sliding, the mouse, or keyboard focus. */
	let hover = $state<string | null>(null);

	/**
	 * What the fan is laid out from, in viewport pixels: the disk's centre,
	 * what can be seen of the app shell above its bottom nav, the whole shell,
	 * and where a flying trigger is at home. Measured on opening and again on
	 * a resize or a scroll, since the fan is drawn against the shell and the
	 * trigger sits in the page. Kept after closing, so the options leaving
	 * still know where they are going back to.
	 */
	let measured = $state<{
		centre: Point;
		bounds: Box;
		shell: Box;
		home: Point;
		clear?: number;
	} | null>(null);

	// Laid out again whenever `measured` changes, on a resize included: the
	// avatars' size, the ring, how many rows it staggers into and the disk all
	// follow the room there is, and the options move to their new places.
	const layout = $derived(
		measured
			? layoutFan({
					centre: measured.centre,
					bounds: measured.bounds,
					count: keys.length,
					clear: measured.clear ?? null,
					wrapEnds
				})
			: null
	);
	const hintAt = $derived(
		layout && measured ? hintPlacement(layout, measured.bounds, HINT, hintFrom) : null
	);

	let root: HTMLElement | undefined = $state();
	let anchorElement: HTMLElement | undefined = $state();
	let buttonElement: HTMLButtonElement | undefined = $state();
	let group: HTMLElement | undefined = $state();
	let backdrop: HTMLElement | undefined = $state();
	let hintElement: HTMLElement | undefined = $state();
	const slotElements: (HTMLElement | undefined)[] = $state([]);

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
		const box = anchorElement?.getBoundingClientRect();
		if (!box) {
			return;
		}
		measured = { ...place(box, shell), bounds, shell };
	}

	/** Measures again while open: the trigger's home has moved (the switcher's name changed width). */
	export function remeasure() {
		if (open) {
			measure();
		}
	}

	export function isOpen(): boolean {
		return open;
	}

	/** Where the trigger is while the fan is open, when it stands in for the current option. */
	const flight = $derived.by(() => {
		if (!(standIn && open && layout && measured && current !== null)) {
			return null;
		}
		const at = layout.points[Math.max(keys.indexOf(current), 0)];
		if (!at) {
			return null;
		}
		return {
			x: at.x - measured.home.x,
			y: at.y - measured.home.y,
			size: hover === current ? layout.avatar * HOVER_SCALE : layout.avatar
		};
	});

	const selectedKey = $derived(hover ?? current);
	const selectedOption = $derived(options.find((option) => option.key === selectedKey) ?? null);

	/**
	 * The selection wedge: the selected option's sector of the disk, as wide
	 * as the angle between neighbours and centred on it, which is exactly what
	 * a slide hit-tests (`optionAt`). Drawn once pointing up and
	 * turned about the disk's centre, so it glides from option to option
	 * rather than redrawing. None while nothing is selected: a fan that adds
	 * has no option showing now.
	 */
	const wedge = $derived.by(() => {
		if (!layout) {
			return null;
		}
		const index = selectedOption ? keys.indexOf(selectedOption.key) : -1;
		// Its sector, which for an end option of a fan with `wrapEnds` runs on
		// round the rest of the circle: what a pointer anywhere in it picks.
		const sector = sectorOf(layout, Math.max(index, 0));
		const angle = (sector.start + sector.end) / 2;
		const width = sector.end - sector.start;
		const shading = wedgeShading(layout);
		const share = (value: number) => `${(value * 100).toFixed(1)}%`;
		// Solid in the selected context's colour; for Everyone, a pale blend
		// of its members' colours, you first (`wedgeGradient`). Cut to the
		// sector by a clip path, whose sides Chrome anti-aliases
		// (`wedgePolygon`).
		const people = selectedOption?.people ?? [];
		const colours =
			selectedOption?.kind === 'all' && people.length > 1
				? people.map((person) => person.colour)
				: [selectedOption?.colour ?? 'transparent'];
		return {
			selected: selectedOption?.key ?? null,
			// A link ("Add partner") glows rather than drawing the wedge, which
			// fades out under it; with nothing selected there is no wedge at all.
			hidden: !selectedOption || selectedOption.href !== undefined,
			// Up is -90° on the screen.
			rotate: angle + 90,
			clip: wedgePolygon(width),
			background: wedgeGradient(colours, width, {
				wash: 'var(--wa-color-text-normal)',
				span: wedgeSpan(layout, Math.max(index, 0))
			}),
			// Fading out towards the centre once past the avatars, and solid out
			// to the rim, which the disk's own edge cuts crisply. Round the
			// disk's centre, so turning the wedge leaves it as it is.
			mask: `radial-gradient(circle closest-side, transparent ${share(shading.clear)}, black ${share(shading.full)})`
		};
	});

	/**
	 * The lit option's name: the options carry no names of their own, so the
	 * one under the finger, the mouse or the keyboard's focus is named where
	 * the hint is, in its place. Null while nothing is lit.
	 */
	const litName = $derived(options.find((option) => option.key === hover)?.name ?? null);

	const helpText = $derived(sliding ? help.slide : help.tap);

	/** What letting go will do, said to assistive tech while sliding. */
	const announcement = $derived.by(() => {
		const lit = options.find((option) => option.key === hover);
		return lit ? letGo(lit) : helpText;
	});

	/** Where an option's element goes: its avatar centred on its point. */
	function placeOf(index: number) {
		const at = layout?.points[index] ?? { x: 0, y: 0 };
		const avatar = layout?.avatar ?? 56;
		const centre = measured?.centre ?? at;
		return {
			left: at.x - avatar / 2,
			top: at.y - avatar / 2,
			width: avatar,
			height: avatar,
			// From the option back to the disk's centre, for its way in and out.
			dx: centre.x - at.x,
			dy: centre.y - at.y
		};
	}

	// ── opening, closing, picking ──────────────────────────────────────────────

	function openFan(bySliding: boolean) {
		measure();
		// Opened again while still closing, Svelte turns the closing fan
		// round rather than drawing a new one, so the backdrop is the one
		// `close` let clicks through: it has to take them again, or a tap
		// on the nav under the open fan went through and changed page.
		if (backdrop) {
			backdrop.style.pointerEvents = '';
			backdrop.classList.remove('pointing');
		}
		open = true;
		sliding = bySliding;
		hover = null;
		// Into the fan, on the one showing now (or the first), as a menu opens
		// on its selection. After the render that draws it.
		void tick().then(() => {
			const index = current === null ? 0 : keys.indexOf(current);
			// Not a choice, so it lights nothing (`onfocusin`): with no option
			// showing now (the add button's fan), lighting the first would
			// name it and draw its wedge before anything was picked.
			focusingOnOpen = true;
			slotElements[Math.max(index, 0)]?.focus({ preventScroll: true });
			focusingOnOpen = false;
		});
	}

	export function close(returnFocus = true) {
		const hadFocus = root?.contains(document.activeElement) ?? false;
		// The backdrop stays while the options fly back in, and would take a
		// tap meant for the page, or for the trigger, the moment after closing.
		if (backdrop) {
			backdrop.style.pointerEvents = 'none';
		}
		open = false;
		sliding = false;
		hover = null;
		if (returnFocus && hadFocus) {
			buttonElement?.focus({ preventScroll: true });
		}
	}

	/** An option chosen: a link is followed, anything else is the host's to act on. */
	function choose(key: string) {
		cancelHold();
		press = null;
		sliding = false;
		hover = null;
		const index = keys.indexOf(key);
		if (options[index]?.href !== undefined) {
			slotElements[index]?.click();
			return;
		}
		onpick(key);
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
	 * the press began, so a wobble on the trigger picks nothing, and nothing
	 * off the part of the disk that can be seen.
	 */
	function slotAt(x: number, y: number): string | null {
		if (!(layout && measured)) {
			return null;
		}
		// Only where the disk can be seen: its sectors run on under the bottom
		// nav (which the add button's fan leaves undimmed, and takes its own
		// taps), and a pointer there lit the option above it, and a click
		// picked it, rather than reaching the nav.
		const { bounds } = measured;
		if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) {
			return null;
		}
		const still = press ? { x: press.x, y: press.y } : null;
		const index = optionAt(layout, { x, y }, { still, quiet: PRESS_QUIET });
		return index === null ? null : (keys[index] ?? null);
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
			buttonElement?.setPointerCapture(event.pointerId);
		} catch {
			// Capture keeps a slide's moves on the trigger; without it a slide
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
				close();
			} else {
				openFan(false);
			}
			return;
		}
		const over = hover;
		sliding = false;
		hover = null;
		if (over) {
			choose(over);
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
			close();
		} else {
			openFan(false);
		}
	}

	const anchor: Attachment<HTMLElement> = (element) => {
		anchorElement = element;
		return () => {
			if (anchorElement === element) {
				anchorElement = undefined;
			}
		};
	};

	/**
	 * The trigger's handlers, attached rather than spread as props, so the
	 * host's own markup stays its own: it may add handlers and classes of its
	 * own beside these.
	 */
	const button: Attachment<HTMLButtonElement> = (element) => {
		buttonElement = element;
		element.addEventListener('pointerdown', onpointerdown);
		element.addEventListener('pointermove', onpointermove);
		element.addEventListener('pointerup', onpointerup);
		element.addEventListener('pointercancel', onpointercancel);
		element.addEventListener('click', onclick);
		return () => {
			element.removeEventListener('pointerdown', onpointerdown);
			element.removeEventListener('pointermove', onpointermove);
			element.removeEventListener('pointerup', onpointerup);
			element.removeEventListener('pointercancel', onpointercancel);
			element.removeEventListener('click', onclick);
			if (buttonElement === element) {
				buttonElement = undefined;
			}
		};
	};

	/** Escape closes, from anywhere inside: on this component, not the window. */
	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			event.stopPropagation();
			close();
		}
	}

	/** Tabbing out of the fan closes it, rather than leaving it over the page. */
	function onfocusout(event: FocusEvent) {
		const next = event.relatedTarget;
		if (open && next instanceof Node && !root?.contains(next)) {
			close(false);
		}
	}

	/**
	 * The page under the open fan does not scroll: the trigger is measured
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
	 * A click anywhere but on the trigger, an option or the hint closes the
	 * fan. On the document, in the capture phase, rather than only on the
	 * backdrop: the backdrop covers the shell, but the app-wide notice is
	 * drawn above it, and a click there must close the fan too. A click the
	 * backdrop takes goes no further, so nothing under the fan is acted on.
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
			// The hint lies over part of some sectors, and its words can be
			// selected: a click that ends a selection there is the selecting,
			// not a pick, so it leaves the fan as it is.
			const onHint = target instanceof Node && (hintElement?.contains(target) ?? false);
			const selecting = onHint && !(document.getSelection()?.isCollapsed ?? true);
			if (selecting) {
				return;
			}
			if (under && under === hover && !onOption) {
				event.preventDefault();
				event.stopPropagation();
				choose(under);
				return;
			}
			// The hint is part of the fan too: its text can be selected
			// and copied without the fan closing under the pointer.
			const parts = [buttonElement, group, hintElement];
			if (target instanceof Node && parts.some((part) => part?.contains(target))) {
				return;
			}
			close();
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
		// A press that began on the hint is selecting its words. The hint
		// shows the lit option's name, so lighting another as the drag
		// crosses sectors would swap the text under the selection and lose
		// it: what is lit holds still until the press ends.
		let selecting = false;
		const down = (event: PointerEvent) => {
			selecting = event.target instanceof Node && (hintElement?.contains(event.target) ?? false);
		};
		const up = () => {
			selecting = false;
		};
		const follow = (event: PointerEvent) => {
			if (sliding || press || selecting || event.pointerType === 'touch') {
				return;
			}
			hover = slotAt(event.clientX, event.clientY);
			// A click anywhere in that sector picks, so the pointer says so:
			// on the backdrop, whose cursor shows over the disk, which takes no
			// pointer events of its own, and on the hint, which lies over part
			// of some sectors (Add partner's, often) and otherwise showed the
			// text cursor there. Its words can still be selected by dragging.
			backdrop?.classList.toggle('pointing', hover !== null);
			hintElement?.classList.toggle('pointing', hover !== null);
		};
		document.addEventListener('pointerdown', down, true);
		document.addEventListener('pointerup', up, true);
		document.addEventListener('pointermove', follow);
		return () => {
			document.removeEventListener('pointerdown', down, true);
			document.removeEventListener('pointerup', up, true);
			document.removeEventListener('pointermove', follow);
		};
	});

	/** Set while opening moves focus into the fan, which is not a choice. */
	let focusingOnOpen = false;

	/** Keyboard focus on an option lights it the same way. */
	function onfocusin(event: FocusEvent) {
		if (sliding || focusingOnOpen) {
			return;
		}
		const index = slotElements.findIndex(
			(element) => element !== undefined && element === event.target
		);
		const key = index === -1 ? null : (keys[index] ?? null);
		// The one showing is lit already; focus lands on it as the fan opens,
		// which is not a choice.
		hover = key === current ? null : key;
	}

	/**
	 * A resize lays the fan out again rather than closing it: the shell, and
	 * so how much of the ring shows, has changed, and so may where the
	 * trigger is. So may a scroll the page makes by itself. Once a frame at most.
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
		cancelHold();
	});

	// ── transitions ───────────────────────────────────────────────────────────

	/**
	 * An option springing out of the disk's centre to its place, and back in
	 * on closing. The one the trigger stands in for is the trigger itself,
	 * flown to its place, so its own option, unseen under it, just comes and
	 * goes.
	 *
	 * `|global` where used: the options are in an `{#each}` inside the
	 * `{#if open}`, and a local transition plays only when its own block
	 * comes or goes.
	 */
	function fromCentre(
		_node: Element,
		{
			dx,
			dy,
			delay,
			hidden,
			opening
		}: { dx: number; dy: number; delay: number; hidden: boolean; opening: boolean }
	) {
		if (reducedMotion() || hidden) {
			return { duration: 0 };
		}
		return {
			delay,
			duration: optionTiming(0, opening).duration,
			easing: fanEase(opening),
			// Out along its ray by the eased share `t`, and grown by the same
			// share, so the disk (`unfold`, scaled by `t` on the clock of the
			// option furthest out) always holds it.
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
	 * The hint fades in about halfway through the fan's opening, centred on
	 * its middle: soon enough to be read as the options land, late enough
	 * not to compete with them for the eye as they set out. It used to wait
	 * until they had all but landed, which left the first thing a newcomer
	 * needed until last.
	 */
	function hintIn(_node: Element, { count }: { count: number }) {
		if (reducedMotion()) {
			return { duration: 0 };
		}
		// The wait is part of the transition rather than its `delay`: Svelte
		// draws an element as it is, fully opaque, through a delay, so the
		// hint showed at once, vanished, and then faded in.
		const fadeMs = 220;
		const wait = Math.max(0, fanDuration(count, true) / 2 - fadeMs / 2);
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

<!-- The keydown and focusout here are for Escape and tabbing away from
     whichever of the buttons inside has focus; the element itself is
     not interactive. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fan" bind:this={root} {onkeydown} {onfocusout}>
	<!-- What letting go will do, while sliding, for assistive tech: polite,
	     and only when it changes (the option under the finger, not every
	     move). Always rendered, since a live region added with its text
	     is not announced. -->
	<span class="wa-visually-hidden" aria-live="polite">{open && sliding ? announcement : ''}</span>

	{@render trigger({ open, anchor, button, flight })}

	{#if open && layout && measured}
		<!-- A slight dim, and what takes a click off the fan. A div rather than
		     a <button>: Web Awesome's native styles give every <button> the
		     form control's height, which beat `inset: 0`, so it covered a 43px
		     strip along the top and every click below that went to the page.
		     Closing on a click is the document listener's job. Over the whole
		     shell, nav included, or (`dimNav` off) only above the nav, which
		     then stays as it is and takes its own taps. -->
		<div
			class="backdrop"
			bind:this={backdrop}
			transition:fade
			{@attach holdStill}
			style:bottom={dimNav ? undefined : `${window.innerHeight - measured.bounds.bottom}px`}
		></div>
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
				in:unfold|global={{ count: keys.length, opening: true }}
				out:unfold|global={{ count: keys.length, opening: false }}
				style:left="{measured.centre.x - measured.bounds.left - layout.disk}px"
				style:top="{measured.centre.y - measured.bounds.top - layout.disk}px"
				style:--disk="{layout.disk * 2}px"
			>
				<!-- Only while something is selected, so the first one lit (in a fan
				     that adds, where nothing is at first) has it appear in its own
				     sector and fade in. Drawn throughout, it waited unseen in the
				     first option's sector, and lighting another swung it round
				     from there as it faded in. Moving from one lit option to the
				     next, it is the same element, and glides. -->
				{#if wedge && wedge.selected !== null}
					<div
						transition:fade
						class="wedge"
						class:hidden={wedge.hidden}
						data-fan-wedge={wedge.selected}
						style:rotate="{wedge.rotate.toFixed(2)}deg"
						style:background={wedge.background}
						style:clip-path={wedge.clip}
						style:mask-image={wedge.mask}
					></div>
				{/if}
			</div>
		</div>
		{#if hintAt}
			<!-- Shown, not read: the live region says what matters while
			     sliding, and each option is named by its own label. The lit
			     option's name while one is lit, what to do otherwise.
			     Right-aligned against the page's right edge when the disk is
			     mostly cut off there, centred over the disk otherwise
			     (`hintPlacement`). Moved by a transform, so it glides between
			     the two, and the text is drawn twice, once each way,
			     cross-fading, so its alignment never jumps. -->
			<p
				class="hint"
				class:right={hintAt.side === 'right'}
				class:above={hintFrom === 'disk'}
				class:naming={litName !== null}
				bind:this={hintElement}
				aria-hidden="true"
				data-fan-hint={hintAt.side}
				in:hintIn|global={{ count: keys.length }}
				out:hintOut|global
				style:transform="translate({hintAt.x.toFixed(1)}px, {hintAt.y.toFixed(1)}px)"
				style:width="{HINT.width}px"
				style:height="{HINT.height}px"
			>
				{#each ['hint-centred', 'hint-right'] as copy (copy)}
					<span class={copy}>
						{#if litName !== null && litLead}<span class="lead">{litLead}</span>{/if}
						<span class="text">{litName ?? helpText}</span>
					</span>
				{/each}
			</p>
		{/if}
		<fieldset class="slots" {onfocusin} aria-label={label} bind:this={group} style:--lit-scale={HOVER_SCALE}>
			{#each options as option, index (option.key)}
				{const at = $derived(placeOf(index))}
				{const hidden = $derived(standIn && option.key === current)}
				{#if option.href === undefined}
					<button
						type="button"
						class="slot"
						class:hovered={hover === option.key}
						class:selected={wedge?.selected === option.key}
						data-fan-option
						bind:this={slotElements[index]}
						aria-label={option.label}
						aria-current={option.key === current ? 'true' : undefined}
						style:left="{at.left}px"
						style:top="{at.top}px"
						style:width="{at.width}px"
						style:height="{at.height}px"
						in:fromCentre|global={{ dx: at.dx, dy: at.dy, delay: optionTiming(index, true).delay, hidden, opening: true }}
						out:fromCentre|global={{ dx: at.dx, dy: at.dy, delay: optionTiming(index, false).delay, hidden, opening: false }}
						onclick={() => choose(option.key)}
					>
						<!-- The one the trigger stands in for is the trigger itself,
						     flown here, so its own avatar stays out of sight underneath. -->
						<span class="slot-avatar" class:standing-in={hidden} data-fan-avatar>
							<ContextAvatar kind={option.kind} size={layout.avatar} people={option.people ?? []} />
						</span>
					</button>
				{:else}
					<a
						class="slot glows"
						class:hovered={hover === option.key}
						class:selected={wedge?.selected === option.key}
						data-fan-option
						aria-label={option.label}
						href={option.href}
						bind:this={slotElements[index]}
						style:left="{at.left}px"
						style:top="{at.top}px"
						style:width="{at.width}px"
						style:height="{at.height}px"
						in:fromCentre|global={{ dx: at.dx, dy: at.dy, delay: optionTiming(index, true).delay, hidden: false, opening: true }}
						out:fromCentre|global={{ dx: at.dx, dy: at.dy, delay: optionTiming(index, false).delay, hidden: false, opening: false }}
					>
						<span class="slot-avatar" data-fan-avatar>
							<ContextAvatar kind={option.kind} size={layout.avatar} people={option.people ?? []} />
						</span>
					</a>
				{/if}
			{/each}
		</fieldset>
	{/if}
</div>

<style>
	.fan {
		display: contents;
	}

	/* A fieldset for its grouping; none of a fieldset's own look. */
	.slots {
		margin: 0;
		padding: 0;
		border: none;
		min-inline-size: 0;
	}

	/* Very slight, and even: the fan is what stands out. The disk takes no
	   pointer events, so over it the cursor is this one's: the pointer
	   anywhere in an option's sector, where a click picks it. */
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

		/* Under a link, which glows instead, and with nothing selected. */
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

		/* Over a sector a click picks, as it does on the backdrop beside it, so
		   the pointer shows (`follow` sets the class); dragging still selects. */
		&:global(.pointing) {
			cursor: pointer;
		}
		transition: transform 320ms cubic-bezier(0.25, 0.8, 0.25, 1);

		/* The two alignments, stacked in one cell, one showing at a time. */
		.hint-centred,
		.hint-right {
			grid-area: 1 / 1;
			display: flex;
			flex-direction: column;
			transition: opacity 320ms ease;
		}

		.text {
			overflow: hidden;
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 3;
			line-clamp: 3;
		}

		/* Over a lit name: what picking it does, in the help's quiet colour
		   and a size up from it, so it reads easily while the name stays what
		   is read. */
		.lead {
			font-size: var(--wa-font-size-s);
			line-height: 1.4;
			font-weight: normal;
			color: var(--wa-color-text-quiet);
		}

		.hint-centred {
			text-align: center;
		}

		/* A lit option's name: the options carry none of their own, so this
		   is where it is read. Much larger and heavier than the help, in the
		   text's own colour, two lines at most, which `HINT`'s height holds. */
		&.naming {
			font-size: var(--wa-font-size-l);
			line-height: 1.2;
			font-weight: 800;
			color: var(--wa-color-text-normal);

			.text {
				-webkit-line-clamp: 2;
				line-clamp: 2;
			}
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

		/* Above the disk, the text sits at the bottom of the hint's box, next
		   to the disk however many lines it runs to, rather than a line of
		   help floating a line or two clear of it. */
		&.above {
			.hint-centred,
			.hint-right {
				justify-content: flex-end;
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

	/* Sized and placed by the layout: exactly its avatar, which has no name
	   under it (the lit option's name is in the hint). Every property Web
	   Awesome's native <button> styles set that matters is set here: its
	   height and `justify-content: center` once moved every avatar off the
	   point the pill flew to. */
	.slot {
		position: fixed;
		z-index: 22;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: center;
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
		transform-origin: 50% 50%;
		-webkit-tap-highlight-color: transparent;
	}

	/* Keyboard focus only: a thin cream outline round the avatar. Not the
	   theme's amber focus ring, which would look like the ring that used to
	   mark the lit option. */
	.slot:focus-visible {
		outline: none;

		.slot-avatar {
			outline: 2px solid var(--wa-color-text-normal);
			outline-offset: 3px;
		}
	}

	/* Lit: the avatar grows (`HOVER_SCALE`), into the room the layout leaves
	   round every option. No ring: the wedge is the marker. */
	.slot.hovered .slot-avatar {
		transform: scale(var(--lit-scale));
	}

	/* A link ("Add partner") is not a context like the others, so lit it has
	   no wedge: a soft cream glow behind its "+", and a brighter dashed edge. */
	.slot.glows {
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

	/* The selected option sits on the wedge, solid in its own colour: a
	   keyline keeps its avatar from vanishing into it. Not a link, which has
	   no wedge: a solid ring outside its dashed edge changed its shape, where
	   lit it should only brighten. */
	.slot.selected:not(.glows) .slot-avatar {
		box-shadow: 0 0 0 2px var(--wa-color-surface-default);
	}

	@media (prefers-reduced-motion: reduce) {
		.wedge,
		.slot-avatar,
		.hint,
		.hint-centred,
		.hint-right {
			transition: none;
		}
	}
</style>
