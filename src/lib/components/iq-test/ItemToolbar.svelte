<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Origin } from '$lib/playroom/iq-test/media';

	/**
	 * The row of buttons over a porn item, closed: the column's own
	 * (`controls`: back, lock, next) and Enlarge, with what the one pointed at
	 * does said under them, and a lock in the corner for a kept one. Shown
	 * while a pointer is over the item, while one of them has keyboard focus,
	 * or after a tap on the item (`EnlargeableItem` marks it `revealed`),
	 * which a touchscreen has no hover for. Until shown they take no pointer,
	 * so the tap that shows them cannot also press one.
	 */
	let {
		name,
		controls,
		locked,
		onenlarge,
		origin = null,
		footer,
		enlargeButton = $bindable()
	}: {
		/** What it is, for its buttons: "clip", "picture", "hypno". */
		name: string;
		/** More buttons for the row, before Enlarge. */
		controls?: Snippet;
		/** Kept where it is: the lock in the corner, shown when the buttons are not. */
		locked: boolean;
		onenlarge: () => void;
		/** Where it was posted: its title, over the buttons, linking to it. */
		origin?: Origin | null;
		/** Along the foot: a clip's scrub bar. */
		footer?: Snippet;
		/** The Enlarge button, for focus to come back to when the item is put back. */
		enlargeButton?: HTMLElement;
	} = $props();

	let toolbar = $state<HTMLElement>();

	/**
	 * What the button pointed at or focused does, in words, under the row: an
	 * icon alone does not say that Next fetches another or that the lock keeps
	 * this one. A button's `data-caption` if it has one, else its name.
	 */
	let caption = $state<string | null>(null);
	let captionBox = $state<HTMLElement>();

	/**
	 * The caption is a popover, so it sits in the top layer: a long one runs
	 * past the item's edges rather than being cut off by the column, which
	 * clips its items to round their corners. So it is placed by hand, fixed
	 * under the buttons and centred on them, kept inside the window.
	 */
	$effect(() => {
		const box = captionBox;
		if (!box || typeof box.showPopover !== 'function') {
			return;
		}
		if (caption === null) {
			if (box.matches(':popover-open')) {
				box.hidePopover();
			}
			return;
		}
		const rects = [...(toolbar?.querySelectorAll('.control') ?? [])].map((control) =>
			control.getBoundingClientRect()
		);
		if (rects.length === 0) {
			return;
		}
		const bottom = Math.max(...rects.map((rect) => rect.bottom));
		const centre =
			(Math.min(...rects.map((rect) => rect.left)) + Math.max(...rects.map((rect) => rect.right))) /
			2;
		if (!box.matches(':popover-open')) {
			box.showPopover();
		}
		const half = box.offsetWidth / 2;
		const left = Math.min(
			Math.max(centre - half, 4),
			document.documentElement.clientWidth - 4 - half * 2
		);
		box.style.left = `${left}px`;
		box.style.top = `${bottom + 6}px`;
	});

	// Fixed to where the buttons were: gone as soon as the page moves under it.
	$effect(() => {
		if (caption === null) {
			return;
		}
		const onScroll = () => {
			caption = null;
		};
		globalThis.addEventListener('scroll', onScroll, { capture: true, passive: true });
		return () => globalThis.removeEventListener('scroll', onScroll, { capture: true });
	});

	function captions(node: HTMLElement) {
		const show = (event: Event) => {
			const button =
				event.target instanceof Element ? event.target.closest<HTMLElement>('button') : null;
			caption = button ? (button.dataset.caption ?? button.getAttribute('aria-label')) : null;
		};
		// Deferred: opening the item removes these buttons, and the focused
		// one's `focusout` then fires in the middle of Svelte's update, where
		// setting state is refused.
		const hide = () =>
			queueMicrotask(() => {
				caption = null;
			});
		// A press can change what a button does (the lock): read it again once
		// drawn. A task later, not a tick: the button's own handler is Svelte's
		// delegated one, which runs after this, on the way up from here.
		const onClick = (event: Event) => setTimeout(() => show(event));
		node.addEventListener('click', onClick);
		node.addEventListener('pointerover', show);
		node.addEventListener('pointerleave', hide);
		node.addEventListener('focusin', show);
		node.addEventListener('focusout', hide);
		return () => {
			node.removeEventListener('click', onClick);
			node.removeEventListener('pointerover', show);
			node.removeEventListener('pointerleave', hide);
			node.removeEventListener('focusin', show);
			node.removeEventListener('focusout', hide);
		};
	}
</script>

{#if locked}
	<!-- Always in sight, so a locked one is known without hovering. -->
	<span class="locked-mark" aria-hidden="true">
		<wa-icon name="lock" variant="solid"></wa-icon>
	</span>
{/if}
<!-- A fieldset: a group of controls, named for what they act on. -->
<fieldset bind:this={toolbar} class="toolbar" aria-label="{name} controls" {@attach captions}>
	{#if origin}
		<!--
			Where it was posted, to see it there: a new tab, with no referrer,
			so the source learns nothing of this page.
		-->
		<a class="origin" href={origin.page} target="_blank" rel="noopener noreferrer external"
			>{origin.title}</a
		>
	{/if}
	<div class="buttons">
		{@render controls?.()}
		<button
			bind:this={enlargeButton}
			type="button"
			class="control"
			aria-label="Enlarge {name}"
			onclick={onenlarge}
		>
			<wa-icon name="expand" variant="solid"></wa-icon>
		</button>
	</div>
	{#if footer}
		<div class="footer">{@render footer()}</div>
	{/if}
	<!--
		Under the row, in the top layer so nothing moves when it appears
		and nothing clips it (see `captionBox`). Hidden from a screen
		reader, which hears each button's name already.
	-->
	<span bind:this={captionBox} class="caption" popover="manual" aria-hidden="true"
		>{caption}</span
	>
</fieldset>

<style>
	/* The row of buttons, over the middle of the item: hidden, and taking no
	   pointer, until shown. Sized from the item's own box (a container, see
	   EnlargeableItem), so a small item's buttons shrink rather than spill out. A
	   fieldset, its own border and spacing undone. */
	.toolbar {
		margin: 0;
		border: none;
		min-inline-size: 0;
		position: absolute;
		inset: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.5rem;
		opacity: 0;
		pointer-events: none;
		transition: opacity 150ms ease;
		/* Full size, wrapping onto more rows where one would not fit, and
		   smaller only where even two by two would not: a strip's small
		   picture. */
		--control-size: clamp(
			1.25rem,
			min((100cqi - 1rem - 0.375rem) / 2, (100cqb - 1rem - 0.375rem) / 2),
			2.75rem
		);
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		align-content: center;
		justify-content: center;
		gap: 0.375rem;
	}

	/* The title over the buttons: white on a dark pill, two lines at most,
	   underlined when pointed at, as a link. */
	.origin {
		max-inline-size: 100%;
		padding: 0.125rem 0.5rem;
		border-radius: var(--wa-border-radius-s);
		background: rgb(0 0 0 / 0.6);
		color: #fff;
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1.3;
		text-align: center;
		text-decoration: none;
		overflow: hidden;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;

		&:hover {
			text-decoration: underline;
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}
	}

	/* The scrub bar, along the item's foot rather than with the buttons. */
	.footer {
		position: absolute;
		inset-inline: 0.5rem;
		inset-block-end: 0.375rem;
	}

	@media (hover: hover) {
		:global(.item:hover) .toolbar {
			opacity: 1;
			pointer-events: auto;
		}
	}

	/* Shown by a tap, or by the keyboard reaching a button: not by a mouse's
	   click, whose focus would otherwise keep them up once it has moved away. */
	:global(.item.revealed) .toolbar,
	.toolbar:has(:focus-visible) {
		opacity: 1;
		pointer-events: auto;
	}

	/* Round, white on dark, growing and taking the brand colour when pointed
	   at; native buttons, for `aria-pressed` on the lock (see MediaPanel). */
	.toolbar :global(.control) {
		display: grid;
		place-items: center;
		inline-size: var(--control-size);
		block-size: var(--control-size);
		padding: 0;
		border: none;
		border-radius: 50%;
		background: rgb(0 0 0 / 0.6);
		color: #fff;
		font-size: calc(var(--control-size) * 0.42);
		cursor: pointer;
		transition:
			transform 150ms cubic-bezier(0.2, 0.7, 0.2, 1.4),
			background-color 150ms ease;

		@media (hover: hover) {
			&:hover {
				transform: scale(1.14);
				background: var(--wa-color-brand-fill-loud);
			}
		}

		&:active {
			transform: scale(0.94);
		}

		&:focus-visible {
			outline: var(--wa-focus-ring);
			outline-offset: var(--wa-focus-ring-offset);
		}

		/* The lock, kept: from MediaPanel's controls. */
		&:global([aria-pressed='true']) {
			background: var(--wa-color-brand-fill-loud);
		}

		&:disabled {
			opacity: 0.4;
			cursor: default;
			transform: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.toolbar,
		.toolbar :global(.control) {
			transition: none;
		}
	}

	/* The caption: a dark pill under the buttons, so it reads over any
	   picture; placed by `captionBox`, the browser's popover box undone. */
	.caption {
		position: fixed;
		inset: auto;
		margin: 0;
		border: none;
		inline-size: max-content;
		max-inline-size: min(16rem, calc(100vw - 0.5rem));
		padding: 0.125rem 0.5rem;
		border-radius: var(--wa-border-radius-s);
		background: rgb(0 0 0 / 0.7);
		color: #fff;
		font-size: 0.75rem;
		line-height: 1.3;
		text-align: center;
		pointer-events: none;
	}

	/* Just the lock, see-through and shadowed so it shows on light and dark
	   alike without looking like one of the buttons, which are solid. Out of
	   the way while they are up: the lock button among them says the same. */
	.locked-mark {
		position: absolute;
		inset-block-start: 0.4rem;
		inset-inline-end: 0.45rem;
		z-index: 1;
		color: rgb(255 255 255 / 0.75);
		font-size: 0.85rem;
		filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.55));
		pointer-events: none;
		transition: opacity 150ms ease;
	}

	@media (hover: hover) {
		:global(.item:hover) .locked-mark {
			opacity: 0;
		}
	}

	:global(.item.revealed) .locked-mark,
	:global(.item:has(.toolbar :focus-visible)) .locked-mark {
		opacity: 0;
	}
</style>
