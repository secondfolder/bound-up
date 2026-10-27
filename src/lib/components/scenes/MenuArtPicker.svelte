<script lang="ts">
	import type { LexicalEditor } from 'lexical';
	import { MENU_ART_EVENT, type MenuArtRequest } from '$lib/lexical/nodes/scene/menu-course';
	import { setCourseArt, setMenuMascot, setMenuPicture } from '$lib/lexical/plugins/scene-blocks';

	/**
	 * Offers the other pictures a course can show when its picture is tapped,
	 * or the other mascots a menu can have when its mascot is (`MENU_ART_EVENT`), in a popover pointing at it, as an item's rating and
	 * number are asked for (`MenuItemExtras`). Choosing one changes it at once
	 * and closes the popover; a tap elsewhere or Escape leaves it as it was.
	 * See docs/scenes.md, "Menu designs".
	 */
	let { editor }: { editor: LexicalEditor } = $props();

	type WaPopover = HTMLElement & { anchor: Element | null; open: boolean };

	let request = $state.raw<MenuArtRequest | null>(null);
	let popover: WaPopover | undefined = $state();

	function ask(event: Event) {
		if (!(event instanceof CustomEvent && popover)) {
			return;
		}
		const detail = event.detail as MenuArtRequest;
		// A second tap on what asked closes it.
		if (popover.open && request?.anchor === detail.anchor) {
			popover.open = false;
			return;
		}
		request = detail;
		popover.anchor = detail.anchor;
		popover.open = true;
	}

	$effect(() =>
		editor.registerRootListener((root, previous) => {
			previous?.removeEventListener(MENU_ART_EVENT, ask);
			root?.addEventListener(MENU_ART_EVENT, ask);
		})
	);

	function choose(choice: string) {
		if (request && popover) {
			if (request.kind === 'picture') {
				setMenuPicture(editor, request.key, request.design, request.place ?? 0, choice);
			} else {
				const set = request.kind === 'mascot' ? setMenuMascot : setCourseArt;
				set(editor, request.key, request.design, choice);
			}
			popover.open = false;
		}
	}
</script>

<wa-popover
	bind:this={popover}
	class="art-picker"
	placement="top"
	onwa-after-hide={() => {
		request = null;
	}}
>
	{#if request}
		<fieldset class="choices">
			<legend class="wa-visually-hidden">Choose a {request.label.toLowerCase()}</legend>
			{#each request.choices as choice (choice.id)}
				<!-- A choice of one, so a native button with aria-pressed: wa-button
				     forwards no ARIA state. -->
				<button
					type="button"
					class="choice"
					aria-pressed={choice.id === request.current}
					onclick={() => choose(choice.id)}
				>
					<img src={choice.url} alt="" />
					<span>{choice.name}</span>
				</button>
			{/each}
		</fieldset>
	{/if}
</wa-popover>

<style>
	.art-picker {
		--max-width: 20rem;
	}

	.choices {
		margin: 0;
		padding: 0;
		border: 0;
		display: grid;
		grid-template-columns: repeat(4, 4rem);
		gap: var(--wa-space-2xs);
	}

	.choice {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--wa-space-3xs);
		block-size: auto;
		margin: 0;
		padding: var(--wa-space-2xs);
		border: var(--wa-border-width-m) solid transparent;
		border-radius: var(--wa-border-radius-m);
		background: none;
		color: inherit;
		font: inherit;
		font-size: var(--wa-font-size-2xs);
		/* Close enough that a name on two lines ("Gacha capsule") reads as one. */
		line-height: 1.15;
		white-space: normal;
		text-align: center;
		cursor: pointer;

		&:hover {
			background: var(--wa-color-surface-lowered);
		}

		&[aria-pressed='true'] {
			border-color: var(--wa-color-brand-border-loud);
			background: var(--wa-color-brand-fill-quiet);
		}

		& img {
			inline-size: 3rem;
			block-size: 3rem;
			object-fit: contain;
		}
	}
</style>
