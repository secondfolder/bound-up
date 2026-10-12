<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Origin } from '$lib/playroom/iq-test/media';
	import ItemToolbar from './ItemToolbar.svelte';

	/**
	 * One picture or video in a porn column that can be clicked to see it
	 * bigger — the element itself, not a copy. A video carries on from where
	 * it was, sound and all, because nothing is reloaded: the item is a
	 * popover, and opening one lifts it into the top layer without moving it
	 * in the DOM.
	 *
	 * Closed, it is an ordinary part of the column (the rules below undo the
	 * browser's popover styles, which would otherwise hide it). Open, it sits
	 * in the middle of the window over a dimmed backdrop, and closes on
	 * Escape, on a click outside it, or on its close button.
	 *
	 * A manual popover, with its outside click handled here, rather than
	 * `popover="auto"`'s light dismiss: that closed it but let the click go on
	 * to whatever was under the backdrop, so closing the picture also pressed
	 * an answer, or Skip. Here the click that closes it goes no further.
	 *
	 * Closed, a row of buttons over it (`ItemToolbar`) shows while a pointer
	 * is over it, while one of them has keyboard focus, or after a tap on it
	 * (`revealed`), which a touchscreen has no hover for. A click or tap
	 * anywhere else on it does nothing: the buttons are the only things to
	 * press. The pictures have
	 * empty alt text — describing them would only be noise between questions —
	 * so the buttons are what a screen reader meets, by name.
	 */
	let {
		name,
		onchange,
		testid,
		controls,
		locked = false,
		loading = false,
		origin = null,
		footer,
		children
	}: {
		/** What it is, for its buttons: "clip", "picture", "hypno". */
		name: string;
		/** Opened or closed. */
		onchange?: (open: boolean) => void;
		testid?: string;
		/** More buttons for the row, before Enlarge: the column's back, lock and next. */
		controls?: Snippet;
		/** Kept where it is: a lock shows in its corner all the time, not only with the buttons. */
		locked?: boolean;
		/** What replaces it is loading: a bar runs along its foot until it can swap. */
		loading?: boolean;
		/** Where it was posted, shown and linked over its buttons. */
		origin?: Origin | null;
		/** Along the foot of its buttons: a clip's scrub bar. */
		footer?: Snippet;
		children: Snippet;
	} = $props();

	/** The buttons shown by a tap, for a touchscreen, which has no hover. */
	let revealed = $state(false);

	/**
	 * A tap on the item (not on a button) shows its buttons, and another hides
	 * them; a tap anywhere else hides them too. A mouse's click does nothing
	 * here: hovering already shows them.
	 */
	function revealsOnTap(node: HTMLElement) {
		const onUp = (event: PointerEvent) => {
			if (event.pointerType === 'mouse' || open) {
				return;
			}
			const target = event.target instanceof Element ? event.target : null;
			if (!target?.closest('button, wa-button')) {
				revealed = !revealed;
			}
		};
		node.addEventListener('pointerup', onUp);
		return () => node.removeEventListener('pointerup', onUp);
	}

	$effect(() => {
		if (!revealed) {
			return;
		}
		const onDown = (event: PointerEvent) => {
			if (!(event.target instanceof Node && item?.contains(event.target))) {
				revealed = false;
			}
		};
		document.addEventListener('pointerdown', onDown, true);
		return () => document.removeEventListener('pointerdown', onDown, true);
	});

	let item = $state<HTMLElement>();
	let closeButton = $state<HTMLElement>();
	let enlargeButton = $state<HTMLElement>();
	let open = $state(false);
	let wasOpen = false;

	function enlarge() {
		// Not in a browser without popovers (Safari before 17): it stays put.
		if (typeof item?.showPopover === 'function') {
			item.showPopover();
		}
	}

	/**
	 * The shape of what is enlarged, width over height, read from the
	 * picture or video itself when it opens. Sized from this, it fills the
	 * window one way and fits the other with no bars: a fixed height with
	 * `object-fit: contain`, as before, left a narrow window's picture with
	 * black above and below it.
	 */
	let ratio = $state<number | null>(null);

	function measure(): number | null {
		const media = item?.querySelector<HTMLImageElement | HTMLVideoElement>(
			'img:not(.preload), video:not(.pending)'
		);
		if (media instanceof HTMLImageElement && media.naturalHeight > 0) {
			return media.naturalWidth / media.naturalHeight;
		}
		if (media instanceof HTMLVideoElement && media.videoHeight > 0) {
			return media.videoWidth / media.videoHeight;
		}
		return null;
	}

	function ontoggle(event: Event) {
		open = (event as ToggleEvent).newState === 'open';
		if (open) {
			ratio = measure();
		}
		onchange?.(open);
	}

	/**
	 * While open, a press anywhere outside it is the backdrop's, not the
	 * page's: every pointer event of it is stopped on the way down (capture,
	 * on the window, ahead of anything the page listens for), and its click
	 * closes this.
	 */
	$effect(() => {
		if (!open) {
			return;
		}
		const outside = (event: Event) => {
			const target = event.target instanceof Node ? event.target : null;
			return !(target && item?.contains(target));
		};
		const swallow = (event: Event) => {
			if (outside(event)) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
		};
		const onClick = (event: MouseEvent) => {
			if (outside(event)) {
				swallow(event);
				item?.hidePopover();
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				item?.hidePopover();
			}
		};
		const swallowed = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart'];
		for (const type of swallowed) {
			globalThis.addEventListener(type, swallow, true);
		}
		globalThis.addEventListener('click', onClick, true);
		globalThis.addEventListener('keydown', onKeyDown);
		return () => {
			for (const type of swallowed) {
				globalThis.removeEventListener(type, swallow, true);
			}
			globalThis.removeEventListener('click', onClick, true);
			globalThis.removeEventListener('keydown', onKeyDown);
		};
	});

	// Focus moves into it when it opens, so Escape and Tab start from there,
	// and back to where it was opened from when it closes.
	$effect(() => {
		if (open && closeButton) {
			// Once it has rendered: a wa-button forwards focus to the button
			// inside it, which does not exist until then.
			const button = closeButton as HTMLElement & { updateComplete?: Promise<unknown> };
			void Promise.resolve(button.updateComplete).then(() => button.focus());
		} else if (!open && wasOpen) {
			enlargeButton?.focus({ preventScroll: true });
		}
		wasOpen = open;
	});
</script>

<div
	bind:this={item}
	class="item"
	class:revealed
	popover="manual"
	{ontoggle}
	{...open ? { role: 'dialog', 'aria-label': `Enlarged ${name}` } : {}}
	data-testid={testid}
	data-open={open}
	style:--ratio={open && ratio !== null ? ratio : undefined}
	{@attach revealsOnTap}
>
	{@render children()}
	{#if open}
		<wa-button
			bind:this={closeButton}
			class="close"
			appearance="plain"
			pill
			onclick={() => item?.hidePopover()}
		>
			<wa-icon name="xmark" variant="solid" label="Close"></wa-icon>
		</wa-button>
	{:else}
		<ItemToolbar
			{name}
			{controls}
			{locked}
			{origin}
			{footer}
			onenlarge={enlarge}
			bind:enlargeButton
		/>
	{/if}
	{#if loading && !open}
		<span class="loading-bar" role="progressbar" aria-label="Loading the next {name}"></span>
	{/if}
</div>

<style>
	.item {
		flex: none;
	}

	/* Closed: part of the column. The browser's own rules for a popover would
	   hide it and draw it as a fixed box with a border. */
	.item:not(:popover-open) {
		position: relative;
		display: block;
		inset: auto;
		inline-size: auto;
		block-size: auto;
		margin: 0;
		padding: 0;
		border: none;
		overflow: visible;
		background: none;
		color: inherit;
		/* For the buttons' size: see `.toolbar`. */
		container-type: size;
	}

	/* Open: as big as the window allows, keeping its shape, over a dimmed
	   page. */
	.item:popover-open {
		position: fixed;
		inset: 0;
		margin: auto;
		inline-size: fit-content;
		block-size: fit-content;
		max-inline-size: 96vw;
		max-block-size: 96dvh;
		padding: 0;
		border: none;
		border-radius: var(--wa-border-radius-l);
		overflow: hidden;
		background: #000;
		color: #fff;

		&::backdrop {
			background: rgb(0 0 0 / 0.8);
		}

		/* As big as fits, in its own shape: the window's width or height,
		   whichever runs out first, and the other from the shape. Without a
		   shape known yet (not loaded), the height, fitted inside. */
		:global(:is(img, video)) {
			display: block;
			inline-size: min(96vw, calc(92dvh * var(--ratio, 1)));
			block-size: auto;
			aspect-ratio: var(--ratio, auto);
			max-inline-size: 96vw;
			max-block-size: 92dvh;
			border-radius: 0;
			object-fit: contain;
			animation: none;
		}

		/* Redgifs' player and the placeholder have no shape of their own. */
		:global(:is(iframe, .loading)) {
			inline-size: min(96vw, calc(92dvh * 9 / 16));
			block-size: auto;
			border-radius: 0;
		}
	}

	.close {
		position: absolute;
		inset-block-start: 0.5rem;
		inset-inline-end: 0.5rem;
		z-index: 1;
		color: #fff;
		background: rgb(0 0 0 / 0.45);
		border-radius: 50%;
	}

	/* Along the inside of the foot, a stripe running across and back, until
	   what replaces the item can take its place. */
	.loading-bar {
		position: absolute;
		inset-inline: 0;
		inset-block-end: 0;
		z-index: 2;
		block-size: 4px;
		overflow: hidden;
		background: rgb(0 0 0 / 0.35);

		&::after {
			content: '';
			position: absolute;
			inset-block: 0;
			inline-size: 40%;
			background: var(--wa-color-brand-fill-loud);
			animation: sweep 1.1s ease-in-out infinite;
		}
	}

	@keyframes sweep {
		from {
			inset-inline-start: -40%;
		}

		to {
			inset-inline-start: 100%;
		}
	}
</style>
