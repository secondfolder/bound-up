<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';

	/**
	 * A page with a panel at its right that can be shown and hidden, the same
	 * way at every width. Where the screen has room for both, the panel sits
	 * beside the page and the page narrows to make room; where it does not,
	 * the panel comes out of the page altogether and slides in over all of
	 * it, over everything the page's scroller shows (so not the app's nav
	 * under it), never quite its whole width: a strip of the page stays
	 * showing under a backdrop, and a press there puts the panel away before
	 * anything under it is touched. Either way it slides in and out.
	 *
	 * The button that shows it is a tab fixed to the screen's right edge,
	 * there however far down the page someone has scrolled. See
	 * docs/theme.md, "Side panels".
	 *
	 * Which of the two it is, is a media query, not the layout's width: a
	 * container query would make the layout contain fixed-position boxes, and
	 * the panel over the page is one. It is CSS either way, so the server and
	 * hydration agree. They are opened apart: beside the page, the panel
	 * starts as it was last left on this device (`storageKey`); over the page
	 * it always starts away, since it would hide the page someone came to see.
	 */
	let {
		main,
		panel,
		title,
		icon,
		storageKey
	}: {
		main: Snippet;
		panel: Snippet;
		/** The panel's name: its heading, and what its buttons say they show and hide. */
		title: string;
		/** Drawn on the tab that shows it, to say what opens. */
		icon: string;
		/** Where whether it is beside the page is remembered on the device. */
		storageKey: string;
	} = $props();

	function startsBeside(): boolean {
		try {
			return globalThis.localStorage?.getItem(storageKey) !== '0';
		} catch {
			return true;
		}
	}

	// svelte-ignore state_referenced_locally
	// Read once, as it starts: the key does not change under a mounted panel.
	let beside = $state(startsBeside());
	let over = $state(false);

	let layout: HTMLElement | undefined = $state();
	let panelElement: HTMLElement | undefined = $state();

	/** Whether the panel goes over the page here, as the stylesheet decided. */
	const overlays = () =>
		layout
			? getComputedStyle(layout).getPropertyValue('--side-panel-mode').trim() !== 'beside'
			: true;

	function remember(next: boolean) {
		beside = next;
		try {
			globalThis.localStorage?.setItem(storageKey, next ? '1' : '0');
		} catch {
			// Remembering is a convenience; without storage it starts beside the page.
		}
	}

	function show() {
		if (overlays()) {
			over = true;
			// Into the panel, which now covers what had the focus.
			queueMicrotask(() => panelElement?.focus({ preventScroll: true }));
		} else {
			remember(true);
		}
	}

	function hide() {
		if (overlays()) {
			over = false;
		} else {
			remember(false);
		}
	}

	/**
	 * Nudges the tab in and back out whenever what it opens changes (the
	 * caret going into a menu turns the ideas into the menu's options), so
	 * the change is seen even with the panel away. Not as it first appears,
	 * nor for anyone who has asked for less motion.
	 */
	const nudge: Attachment<HTMLElement> = (tab) => {
		let seen: string | null = null;
		$effect(() => {
			const now = `${title} ${icon}`;
			if (
				seen !== null &&
				seen !== now &&
				!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
			) {
				tab.animate(
					[
						{ translate: '0' },
						{ translate: '-0.9rem', offset: 0.35 },
						{ translate: '0.15rem', offset: 0.7 },
						{ translate: '0' }
					],
					{ duration: 520, easing: 'ease-out' }
				);
			}
			seen = now;
		});
	};

	const SCROLLS = new Set(['auto', 'scroll']);

	/**
	 * Measures the part of the screen the page scrolls in, for what is fixed
	 * to it: the panel and its backdrop over the page, and the tab that shows
	 * the panel. The app's pages scroll in `<main>`, between nothing above and
	 * the nav below, so no viewport unit says where that is. Beside the page,
	 * the panel sticks at the top of it, and is kept no taller than the room
	 * from its own top to the foot, which grows as the page scrolls.
	 */
	const measure: Attachment<HTMLElement> = (element) => {
		let scroller = element.parentElement;
		while (scroller && !SCROLLS.has(getComputedStyle(scroller).overflowY)) {
			scroller = scroller.parentElement;
		}
		const target = scroller ?? document.documentElement;
		const fitArea = () => {
			const area = scroller
				? scroller.getBoundingClientRect()
				: new DOMRect(0, 0, globalThis.innerWidth, globalThis.innerHeight);
			const set = (name: string, px: number) =>
				element.style.setProperty(name, `${Math.max(px, 0)}px`);
			set('--side-panel-area-top', area.top);
			set('--side-panel-area-left', area.left);
			set('--side-panel-area-right', globalThis.innerWidth - area.right);
			set('--side-panel-area-bottom', globalThis.innerHeight - area.bottom);
			set('--side-panel-area-height', area.height);
			set(
				'--side-panel-room',
				area.bottom - Math.max(panelElement?.getBoundingClientRect().top ?? 0, 0)
			);
		};
		fitArea();
		const observer = new ResizeObserver(fitArea);
		observer.observe(target);
		target.addEventListener('scroll', fitArea, { passive: true });
		globalThis.addEventListener('resize', fitArea);
		return () => {
			observer.disconnect();
			target.removeEventListener('scroll', fitArea);
			globalThis.removeEventListener('resize', fitArea);
		};
	};

	/**
	 * Over the page, a press anywhere outside the panel puts it away, on the
	 * backdrop or not. Read through `composedPath` so a press in a shadow root
	 * inside the panel counts as inside.
	 */
	function onPointerdown(event: PointerEvent) {
		if (over && panelElement && !event.composedPath().includes(panelElement) && overlays()) {
			over = false;
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && over && overlays()) {
			over = false;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} onpointerdown={onPointerdown} />

<div
	class="side-panel-layout"
	class:beside-open={beside}
	class:over-open={over}
	bind:this={layout}
	{@attach measure}
>
	<div class="main">{@render main()}</div>

	<!-- Dims the page under the panel while it is over it, and keeps a press
	     there from reaching the page: the press puts the panel away
	     (`onPointerdown`), so this needs no handler of its own. -->
	<div class="scrim" aria-hidden="true"></div>

	<aside class="panel" aria-label={title} tabindex="-1" bind:this={panelElement}>
		<div class="panel-header">
			<span class="panel-title">{title}</span>
			<wa-button appearance="plain" size="s" pill onclick={hide}>
				<wa-icon name="angles-right" label="Hide {title.toLowerCase()}"></wa-icon>
			</wa-button>
		</div>
		<div class="panel-body">{@render panel()}</div>
	</aside>

	<!-- Named by its words, which show only where there is room for them
	     beside the page; the icon is decoration. -->
	<wa-button class="show-tab" appearance="outlined" size="s" onclick={show} {@attach nudge}>
		<wa-icon slot="start" name={icon} aria-hidden="true"></wa-icon>
		<span class="show-label"><span class="wa-visually-hidden">{'Show '}</span>{title}</span>
	</wa-button>
</div>

<style>
	.side-panel-layout {
		/* How wide the panel is, how much of the page it always leaves
		   showing when it is over it, the room between them beside it, and
		   how quickly it slides: a page may set any of these on an ancestor. */
		--_panel-width: var(--side-panel-width, 20rem);
		--_panel-strip: var(--side-panel-strip, 3rem);
		--_panel-gap: var(--side-panel-gap, var(--wa-space-l));
		--_panel-speed: var(--side-panel-speed, 220ms);
		/* Read by the script, to know which a press means. */
		--side-panel-mode: over;

		flex: 1 1 auto;
		position: relative;
		display: grid;
		/* The second column is the room the panel takes beside the page, none
		   while it is over it or away. */
		grid-template-columns: minmax(0, 1fr) 0;
		/* The panel slides out past the edge: clipped rather than hidden, which
		   would make this a scroller and stop the panel sticking. */
		overflow-x: clip;
		transition: grid-template-columns var(--_panel-speed) ease;
	}

	.main {
		grid-area: 1 / 1;
		display: flex;
		flex-direction: column;
		min-inline-size: 0;
	}

	.panel {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
		overflow-y: auto;
		overscroll-behavior: contain;
		outline: none;
		/* Away: past the right edge, and out of reach once it is there. */
		transform: translateX(calc(100% + var(--_panel-gap)));
		visibility: hidden;
		transition:
			transform var(--_panel-speed) ease,
			visibility 0s linear var(--_panel-speed);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.panel-title {
		font-weight: var(--wa-font-weight-semibold);
	}

	.scrim {
		display: none;
	}

	/* A tab on the screen's right edge, a third of the way down what the
	   page shows: below its title and its toolbar, above the thumb. */
	.show-tab {
		/* How far it runs on past the screen's edge, so it reads as the end
		   of something tucked away there, and its nudge (`nudge`) never
		   shows its end coming loose from the edge. */
		--tuck: 1.25rem;

		position: fixed;
		inset-inline-end: calc(var(--side-panel-area-right, 0px) - var(--tuck));
		inset-block-start: calc(
			var(--side-panel-area-top, 0px) +
			var(--side-panel-area-height, 100dvh) /
			3
		);
		z-index: 3;
		--wa-form-control-height: 2.75rem;
		transform: translateY(-50%);

		&::part(base) {
			padding-inline-end: calc(var(--wa-space-s) + var(--tuck));
			border-inline-end: 0;
			border-start-end-radius: 0;
			border-end-end-radius: 0;
			background: var(--wa-color-surface-raised);
			box-shadow: var(--wa-shadow-m);
		}
	}

	/* Its words, only once the tab fits beside the widest page
	   (`--page-width-wide`, 72rem, which a media query cannot read) without
	   covering it: room for about 10rem of tab at the side. */
	.show-label {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (width >= 92rem) {
		.show-label {
			position: static;
			inline-size: auto;
			block-size: auto;
			overflow: visible;
			clip-path: none;
		}
	}

	/* Over the page, where the screen has no room beside it: out of the
	   page's flow, over everything its scroller shows. */
	@media not (width >= 60rem) {
		.panel {
			position: fixed;
			inset-block: var(--side-panel-area-top, 0) var(--side-panel-area-bottom, 0);
			inset-inline-end: var(--side-panel-area-right, 0);
			z-index: 5;
			inline-size: min(
				var(--_panel-width),
				100vw -
				var(--side-panel-area-left, 0px) -
				var(--side-panel-area-right, 0px) -
				var(--_panel-strip)
			);
			padding: var(--wa-space-s) var(--wa-space-m) var(--wa-space-m);
			border-inline-start: 1px solid var(--wa-color-surface-border);
			/* Its own ground, over the page's words. */
			background: var(--wa-color-surface-default);
			box-shadow: var(--wa-shadow-l);
		}

		.scrim {
			position: fixed;
			inset-block: var(--side-panel-area-top, 0) var(--side-panel-area-bottom, 0);
			inset-inline: var(--side-panel-area-left, 0) var(--side-panel-area-right, 0);
			z-index: 4;
			background: rgb(0 0 0 / 45%);
		}

		.over-open {
			& .panel {
				transform: none;
				visibility: visible;
				transition: transform var(--_panel-speed) ease;
			}
			& .scrim {
				display: block;
			}
			& .show-tab {
				display: none;
			}
		}
	}

	/* Beside the page, once the screen has room for a page beside it: in the
	   room the page makes, sticking at the top as the page scrolls. */
	@media (width >= 60rem) {
		.side-panel-layout {
			--side-panel-mode: beside;
		}

		.panel {
			grid-area: 1 / 1 / 2 / 3;
			justify-self: end;
			align-self: start;
			position: sticky;
			inset-block-start: 0;
			z-index: 2;
			inline-size: var(--_panel-width);
			max-block-size: var(--side-panel-room, 100dvh);
			/* Running on to the foot of what the page shows, so clear of the
			   nav below at the end, and of its own scrollbar at the side. */
			padding-block-end: var(--wa-space-m);
			padding-inline-end: var(--wa-space-s);
		}

		.beside-open {
			grid-template-columns: minmax(0, 1fr) calc(var(--_panel-width) + var(--_panel-gap));

			& .panel {
				transform: none;
				visibility: visible;
				transition: transform var(--_panel-speed) ease;
			}
			& .show-tab {
				display: none;
			}
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.side-panel-layout {
			--_panel-speed: 0s;
		}
	}
</style>
