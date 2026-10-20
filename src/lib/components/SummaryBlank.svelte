<script lang="ts">
	import type { WaSelectEvent } from '@awesome.me/webawesome/dist/events/select.js';
	import type { Snippet } from 'svelte';

	/**
	 * One blank in a daydream's setup summary (`DaydreamSetupForm.svelte`):
	 * words in a sentence that change that part of the story when pressed.
	 *
	 * The words are a plain span and the control is a button laid over them,
	 * invisible, rather than the words being the button's own text, because
	 * Chromium leaves a button's text out of a copied selection: copying the
	 * summary came out as "where you  in", every blank missing. So the words
	 * are what is seen, selected and copied, and are hidden from assistive
	 * tech; the button, named with the same words, is what it and the
	 * keyboard reach. A press on the words is passed to the button, and the
	 * button lets pointers through to the words (`pointer-events: none`) so a
	 * drag can still select them. Sitting over the words, the button is also
	 * where a dropdown's menu opens from.
	 *
	 * With `items`, the button is a `wa-dropdown`'s trigger, which keeps
	 * `aria-expanded` on it; without, `onclick` is what it does.
	 */
	let {
		label,
		name = label,
		onclick,
		onselect,
		items
	}: {
		/** The words shown in the sentence. */
		label: string;
		/** The control's accessible name, when it should say more than the words. */
		name?: string;
		onclick?: () => void;
		onselect?: (event: WaSelectEvent) => void;
		/** A menu's items: the blank is then a dropdown. */
		items?: Snippet;
	} = $props();

	let control: HTMLButtonElement | undefined = $state();
	let dropdown: (HTMLElement & { open: boolean }) | undefined = $state();

	/** Where the last press on the words began, to tell a tap from a drag. */
	let pressedAt: { x: number; y: number } | null = null;
	/** How far a press may wander and still be a tap rather than a drag. */
	const DRAG = 4;

	/**
	 * A tap on the words presses the button. A drag that ends here, or a
	 * double or triple click, selected words: reading, not choosing. Told
	 * apart by the pointer rather than by whether anything is selected,
	 * because a tap inside a selection — the summary selected to copy it —
	 * still has it selected when the click arrives, and was ignored.
	 */
	function press(event: MouseEvent) {
		const from = pressedAt;
		const dragged =
			from !== null && Math.hypot(event.clientX - from.x, event.clientY - from.y) > DRAG;
		if (dragged || event.detail > 1) {
			return;
		}
		control?.click();
	}

	/**
	 * The dropdown closes on a pointerdown anywhere outside itself, which the
	 * words are, and the click that follows would then open it again: a press
	 * on the words of an open menu would never close it. Kept from the
	 * document, the press reaches the button as a click, which closes it.
	 * It also notes where the press began, for `press`.
	 */
	function pointerDown(event: PointerEvent) {
		pressedAt = { x: event.clientX, y: event.clientY };
		if (dropdown?.open) {
			event.stopPropagation();
		}
	}
</script>

<!-- Written with no whitespace between the elements: any would render as a
     space inside the sentence. --><span class="blank"
	><!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions --><!-- Hidden from assistive tech, which reaches the button below instead, named with these words; the keyboard does too. --><span
		class="words"
		aria-hidden="true"
		onclick={press}
		onpointerdown={pointerDown}>{label}</span
	>{#if items}<wa-dropdown bind:this={dropdown} onwa-select={onselect}
			><button bind:this={control} slot="trigger" type="button" class="control" aria-label={name}
			></button>{@render items()}</wa-dropdown
		>{:else}<button bind:this={control} type="button" class="control" aria-label={name} {onclick}
		></button>{/if}</span
>

<style>
	/* The box the button covers, and the menu opens from. */
	.blank {
		position: relative;

		/* An empty box in the line. Web Awesome makes it `display: contents`,
		   which lays the whitespace in its shadow template out in the
		   sentence: a space's width of its own, widening the box the button
		   covers and swallowing the space after it. An inline block of no
		   size collapses that whitespace away. Not a positioned block, which
		   did the same but put a line break into every copy at each menu. The
		   button inside is still placed over the words, against `.blank`. */
		wa-dropdown {
			display: inline-block;
			inline-size: 0;
			block-size: 0;
			vertical-align: top;
			font-size: inherit;
		}
	}

	/* A blank to fill in: underlined like a field, and tappable. */
	.words {
		padding: 0 0.15em;
		border-block-end: 2px dashed var(--wa-color-brand-border-loud, currentColor);
		background: var(--wa-color-brand-fill-quiet);
		font-weight: 600;
		cursor: pointer;
	}

	/* The button's focus is shown on the words it stands for. */
	.blank:has(.control:focus-visible) .words {
		outline: var(--wa-focus-ring);
		outline-offset: var(--wa-focus-ring-offset);
	}

	/* Over the words, the same size, and invisible. Undoes Web Awesome's
	   native button styles, which give a <button> a control's height. */
	.control {
		position: absolute;
		inset: 0;
		inline-size: 100%;
		block-size: 100%;
		min-inline-size: 0;
		min-block-size: 0;
		margin: 0;
		padding: 0;
		border: 0;
		opacity: 0;
		pointer-events: none;
	}
</style>
