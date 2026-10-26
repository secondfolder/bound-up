<script lang="ts">
	import type { LexicalEditor } from 'lexical';
	import FieldError from '$lib/components/FieldError.svelte';
	import Slider from '$lib/components/Slider.svelte';
	import { MENU_EXTRA_EVENT, type MenuExtraRequest } from '$lib/lexical/nodes/scene/menu-line';
	import { setItemProps } from '$lib/lexical/plugins/scene-blocks';
	import { readNumberText } from '$lib/number-text';
	import { MAX_RATING } from '$lib/scenes/blocks';

	/**
	 * Asks for a menu item's rating or number when it is tapped
	 * (`MENU_EXTRA_EVENT`), in a popover pointing at what was tapped: a slider
	 * for the rating, which is easier to hit than five small marks, with the
	 * slider's own Clear; and a field for the number. Each change is made as it happens, so there is
	 * nothing to confirm; a tap elsewhere or Escape closes it. Outside the
	 * page's text, because a field inside an editor's text has its typing
	 * taken by the editor. See docs/scenes.md, "Blocks".
	 */
	let { editor }: { editor: LexicalEditor } = $props();

	type WaPopover = HTMLElement & { anchor: Element | null; open: boolean };

	let request = $state.raw<MenuExtraRequest | null>(null);
	/** The rating as it is now, moved by the slider. */
	let rating = $state<number | null>(null);
	/** What is wrong with the number typed, if anything: it is left as it was until it reads. */
	let numberError = $state<string | null>(null);
	let popover: WaPopover | undefined = $state();

	function ask(event: Event) {
		if (!(event instanceof CustomEvent && popover)) {
			return;
		}
		const detail = event.detail as MenuExtraRequest;
		// A second tap on what asked closes it, as a tap on a menu's button does.
		if (popover.open && request?.anchor === detail.anchor) {
			popover.open = false;
			return;
		}
		request = detail;
		({ rating } = detail);
		numberError = null;
		popover.anchor = detail.anchor;
		popover.open = true;
	}

	$effect(() =>
		editor.registerRootListener((root, previous) => {
			previous?.removeEventListener(MENU_EXTRA_EVENT, ask);
			root?.addEventListener(MENU_EXTRA_EVENT, ask);
		})
	);

	function rate(value: number | null) {
		if (request && value !== rating) {
			rating = value;
			setItemProps(editor, request.key, { rating: value });
		}
	}

	/**
	 * The number as it is typed, set on the item each time it reads as one:
	 * empty (or cleared) is none, and anything else is said to be wrong under
	 * the field (`readNumberText`), the item keeping what it had. Listened for by hand, as a `wa-input`'s typing happens
	 * in its shadow root (AGENTS.md). Focused once the popover has opened,
	 * rather than with `autofocus`, which Web Awesome's controls can throw on
	 * as they upgrade.
	 */
	function numberField(asked: MenuExtraRequest) {
		return (field: HTMLElement & { value: string | null; focus: () => void }) => {
			field.value = asked.value === null ? '' : String(asked.value);
			const set = () => {
				const read = readNumberText(field.value ?? '');
				numberError = read.error;
				if (read.error === null) {
					setItemProps(editor, asked.key, { value: read.value });
				}
			};
			const focus = () => field.focus();
			// Web Awesome's clear button sends `input` as well.
			field.addEventListener('input', set);
			popover?.addEventListener('wa-after-show', focus);
			return () => {
				field.removeEventListener('input', set);
				popover?.removeEventListener('wa-after-show', focus);
			};
		};
	}
</script>

<wa-popover
	bind:this={popover}
	class="item-extras"
	placement="top"
	onwa-after-hide={() => {
		request = null;
	}}
>
	{#if request}
		{#key request}
			{#if request.extra === 'rating'}
				<Slider
					class="rating"
					label={request.label || 'Rating'}
					value={rating}
					min={1}
					max={MAX_RATING}
					format={(value) => `${value} out of ${MAX_RATING}`}
					oninput={rate}
					onchange={rate}
					onclear={() => rate(null)}
				/>
			{:else}
				<div class="number">
					<wa-input
						{@attach numberField(request)}
						inputmode="decimal"
						size="s"
						label={request.label || 'A number for this item'}
						aria-invalid={numberError ? 'true' : undefined}
						with-clear
					></wa-input>
					<FieldError message={numberError} />
				</div>
			{/if}
		{/key}
	{/if}
</wa-popover>

<style>
	.item-extras {
		--max-width: 16rem;
	}

	.item-extras :global(.rating) {
		inline-size: 13rem;
	}

	.number {
		inline-size: 13rem;
	}
</style>
