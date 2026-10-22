<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A sheet from the bottom of the screen on a phone, a dialog in the middle of
	 * it anywhere wider. For a detail that opens over a list (a task, a reward)
	 * and anything else that is a short look at one thing. See docs/dialogs.md.
	 *
	 * One `wa-dialog` in both shapes, and CSS decides which: no `matchMedia`
	 * state, so nothing differs between the server and hydration, and nothing
	 * re-renders when a window is resized across the line. Focus trapping,
	 * Escape, the close button and the accessible name come from the one element.
	 * `wa-dialog` renders a native `<dialog>` in the top layer, which is also
	 * what lets it escape the app shell, whose `<body>` does not scroll and
	 * whose `AppNav` would otherwise sit on top (AGENTS.md, "Adding a route").
	 *
	 * Mounted only while open: the parent renders it inside an `{#if}` and
	 * unmounts it from `onclose`, so `open` is never false in markup (AGENTS.md,
	 * boolean properties) and every opening starts fresh.
	 */
	let {
		label,
		children,
		footer,
		headerActions,
		onclose,
		lightDismiss = true,
		width = '32rem',
		class: className = ''
	}: {
		/** The dialog's title, and its accessible name. */
		label: string;
		children: Snippet;
		/** Actions, at the bottom. They stay in view while a long body scrolls. */
		footer?: Snippet;
		/** Buttons beside the close button. */
		headerActions?: Snippet;
		/** After it has closed, however it was closed, and its hide animation has run. */
		onclose: () => void;
		/**
		 * Whether a tap on the backdrop closes it. Leave it on for a look at
		 * something; turn it off when a stray tap would throw away work, or when
		 * the content opens a popup the dialog counts as outside (a
		 * `wa-dropdown`: see NewMessageDialog).
		 */
		lightDismiss?: boolean;
		/** Its width as a dialog. As a sheet it is always the full width. */
		width?: string;
		class?: string;
	} = $props();

	let dialog: (HTMLElement & { open: boolean }) | undefined = $state();

	/** Closes it, with its animation; `onclose` follows once it has gone. */
	export function close() {
		if (dialog) {
			dialog.open = false;
		}
	}

	const SHEET_QUERY = '(width < 40rem)';

	/** Set once the slide down has run, so the second `wa-hide` it causes goes through. */
	let slidOut = false;

	/**
	 * As a sheet, slide down rather than shrink into the middle.
	 *
	 * Web Awesome's own hide animation is a class on the panel, which the sheet's
	 * `::part(dialog)` animation outranks (an outside `::part` rule beats the
	 * component's own), so without this the sheet would vanish on the spot.
	 * Every way of closing asks first with a cancelable `wa-hide` — the close
	 * button, Escape, the backdrop and `open = false` alike — so it is refused
	 * once, the panel slides with Web Animations, and then closed for real.
	 */
	function onHide(event: Event) {
		// Nested Web Awesome elements (a `wa-details`) fire their own, and it bubbles.
		if (event.target !== event.currentTarget || slidOut || !dialog) {
			return;
		}
		if (!matchMedia(SHEET_QUERY).matches || matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return;
		}
		const panel = dialog.shadowRoot?.querySelector<HTMLElement>('[part~="dialog"]');
		if (!panel) {
			return;
		}
		event.preventDefault();
		slidOut = true;
		const host = dialog;
		const slide = panel.animate([{ translate: '0 -100%' }, { translate: '0 0' }], {
			duration: 200,
			easing: 'ease-in',
			fill: 'forwards'
		});
		void slide.finished.then(() => {
			host.open = false;
		});
	}

	/**
	 * Dragging the sheet down by its handle or its header, and letting go.
	 *
	 * The panel follows the finger. Let go past a third of its height, or with
	 * a flick, and it carries on down and closes; otherwise it springs back.
	 * Only the handle and the header start a drag, so the body still scrolls
	 * and the close button still closes. The header is `touch-action: none`
	 * as a sheet, or a touch drag there would scroll the page instead.
	 */
	let drag: { panel: HTMLElement; startY: number; startTime: number; dy: number } | null = null;

	const DISMISS_FRACTION = 1 / 3;
	/** px/ms: a flick, however short. */
	const DISMISS_VELOCITY = 0.5;

	function panelOf(host: HTMLElement): HTMLElement | null {
		return host.shadowRoot?.querySelector<HTMLElement>('[part~="dialog"]') ?? null;
	}

	function hasPart(target: EventTarget, part: string): boolean {
		return target instanceof Element && target.part.contains(part);
	}

	function onPointerDown(event: PointerEvent) {
		const host = event.currentTarget as HTMLElement;
		const panel = panelOf(host);
		if (!(panel && matchMedia(SHEET_QUERY).matches) || event.button !== 0) {
			return;
		}
		const path = event.composedPath();
		if (path.some((target) => hasPart(target, 'close-button') || hasPart(target, 'header-actions'))) {
			return;
		}
		// The handle is drawn on the panel itself, above the header.
		const onHandle = path[0] === panel && event.clientY - panel.getBoundingClientRect().top < 24;
		if (!(onHandle || path.some((target) => hasPart(target, 'header')))) {
			return;
		}
		drag = { panel, startY: event.clientY, startTime: event.timeStamp, dy: 0 };
		try {
			host.setPointerCapture(event.pointerId);
		} catch {
			// A pointer the browser no longer tracks; the moves still arrive here.
		}
	}

	function onPointerMove(event: PointerEvent) {
		if (!drag) {
			return;
		}
		drag.dy = Math.max(0, event.clientY - drag.startY);
		drag.panel.style.translate = `0 calc(-100% + ${drag.dy}px)`;
	}

	function onPointerUp(event: PointerEvent) {
		if (!drag) {
			return;
		}
		const { panel, dy, startTime } = drag;
		drag = null;
		const velocity = dy / Math.max(event.timeStamp - startTime, 1);
		const dismissed =
			event.type === 'pointerup' &&
			dy > 0 &&
			(dy > panel.getBoundingClientRect().height * DISMISS_FRACTION || velocity > DISMISS_VELOCITY);
		const from = `0 calc(-100% + ${dy}px)`;
		const to = dismissed ? '0 0' : '0 -100%';
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const settle = panel.animate([{ translate: from }, { translate: to }], {
			duration: reduced ? 0 : 180,
			easing: dismissed ? 'ease-in' : 'ease-out',
			fill: 'forwards'
		});
		void settle.finished.then(() => {
			if (dismissed && dialog) {
				// Already down: the hide must not slide it a second time.
				slidOut = true;
				dialog.open = false;
				return;
			}
			settle.cancel();
			panel.style.translate = '';
		});
	}

	function onAfterHide(event: Event) {
		// Only the dialog's own: `wa-after-hide` bubbles from nested Web Awesome
		// elements too. The same trap as UrlEmbed, NewMessageDialog and the roadmap.
		if (event.target !== event.currentTarget) {
			return;
		}
		onclose();
	}
</script>

<!--
	`light-dismiss` spread rather than bound: on the server `light-dismiss={false}`
	would render the attribute, which Lit reads as true.
-->
<wa-dialog
	bind:this={dialog}
	{label}
	open
	class={['responsive-dialog', className]}
	style:--width={`min(${width}, 100vw - 2rem)`}
	{...lightDismiss ? { 'light-dismiss': true } : {}}
	onwa-hide={onHide}
	onwa-after-hide={onAfterHide}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
>
	{#if headerActions}
		<div slot="header-actions" class="header-actions">{@render headerActions()}</div>
	{/if}
	{@render children()}
	{#if footer}
		<div slot="footer" class="footer">{@render footer()}</div>
	{/if}
</wa-dialog>

<style>
	/* Before it upgrades it is an unknown element, and its content would show
	   inline in the page. */
	wa-dialog:not(:defined) {
		display: none;
	}

	wa-dialog.responsive-dialog {
		--spacing: var(--wa-space-m);
		--backdrop-filter: brightness(0.6) blur(0.2rem);
	}

	wa-dialog.responsive-dialog::part(dialog) {
		max-block-size: min(80svh, 42rem);
		border: 1px solid var(--wa-color-surface-border);
		background: var(--wa-color-surface-raised);
	}

	wa-dialog.responsive-dialog::part(title) {
		text-wrap: balance;
	}

	.header-actions,
	.footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--wa-space-xs);
	}

	.footer {
		inline-size: 100%;
		justify-content: flex-end;
	}

	/*
	 * A sheet from the bottom on a phone, where the thumb is, rather than a box
	 * in the middle of the screen.
	 *
	 * Placed in the visual viewport the app shell already tracks
	 * (`--viewport-top`, `--viewport-height`, set on the shell this sits inside,
	 * so they inherit; outside the shell they fall back to the whole window):
	 * iOS does not shrink the page for the keyboard, and a sheet pinned to the
	 * bottom of the layout viewport would sit behind it. See
	 * `$lib/visual-viewport.ts`. The same placement as NewMessageDialog's.
	 *
	 * A grab handle at the top says it can be swiped away, and it can: by the
	 * handle or the header (`onPointerDown`).
	 */
	@media (width < 40rem) {
		wa-dialog.responsive-dialog::part(dialog) {
			inline-size: 100%;
			max-inline-size: none;
			margin: 0;
			inset-block: auto;
			inset-block-start: calc(var(--viewport-top, 0px) + var(--viewport-height, 100dvh));
			translate: 0 -100%;
			max-block-size: calc(var(--viewport-height, 100dvh) - 2rem);
			padding-block-end: var(--safe-area-inset-bottom-min, 0px);
			border-end-start-radius: 0;
			border-end-end-radius: 0;
			border-block-end: none;
		}

		wa-dialog.responsive-dialog::part(dialog)::before {
			content: '';
			position: absolute;
			inset-block-start: 0.5rem;
			inset-inline-start: 50%;
			translate: -50% 0;
			inline-size: 2.5rem;
			block-size: 0.25rem;
			border-radius: var(--wa-border-radius-pill);
			background: var(--wa-color-text-quiet);
			opacity: 0.5;
		}

		wa-dialog.responsive-dialog::part(header) {
			padding-block-start: 1.25rem;
			touch-action: none;
			cursor: grab;
		}

		.footer > :global(*) {
			flex: 1 1 auto;
		}
	}

	/*
	 * The sheet slides up. This outranks Web Awesome's own show animation (and
	 * its hide one, which `onHide` replaces with a slide down), because an
	 * outside `::part` rule beats the component's.
	 */
	@media (width < 40rem) and (prefers-reduced-motion: no-preference) {
		wa-dialog.responsive-dialog::part(dialog) {
			animation: sheet-up 220ms cubic-bezier(0.2, 0.9, 0.3, 1);
		}
	}

	@keyframes sheet-up {
		from {
			translate: 0 0;
		}
		to {
			translate: 0 -100%;
		}
	}
</style>
