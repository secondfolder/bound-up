<script lang="ts">
	import type { LexicalEditor } from 'lexical';
	import InputField from '$lib/components/InputField.svelte';
	import { MENU_LINK_EVENT, type MenuLinkRequest } from '$lib/lexical/nodes/scene/menu';
	import { copyText } from '$lib/share';

	/**
	 * A menu's link, when its link button is pressed (`MENU_LINK_EVENT`): put
	 * on the clipboard straight away, and shown in a popover pointing at the
	 * button, saying whether it was copied, in a field to copy it from by hand
	 * if not, with a way to open it. See docs/scenes.md, "A menu's own page".
	 */
	let {
		editor,
		menuHref
	}: {
		editor: LexicalEditor;
		/** The menu's page, as a path: the link is this, on this site. */
		menuHref: (menuId: string) => string;
	} = $props();

	type WaPopover = HTMLElement & { anchor: Element | null; open: boolean };

	let popover: WaPopover | undefined = $state();
	let link = $state<string | null>(null);
	/** Null while the copy is still being tried. */
	let copied = $state<boolean | null>(null);
	let anchor: HTMLElement | null = null;

	/**
	 * The menu whose corner the popover points at keeps its buttons showing
	 * while it is open: they show only while the menu is pointed at, and a
	 * popover whose anchor has gone has nothing to point at.
	 */
	const OPEN_CLASS = 'link-open';

	function ask(event: Event) {
		if (!(event instanceof CustomEvent && popover)) {
			return;
		}
		const detail = event.detail as MenuLinkRequest;
		// A second tap on what asked closes it.
		if (popover.open && anchor === detail.anchor) {
			popover.open = false;
			return;
		}
		const url = new URL(menuHref(detail.menuId), location.href).href;
		// Started here, in the click, before anything is awaited: a browser
		// may refuse a write that is not part of the user's gesture.
		const copying = copyText(url);
		link = url;
		copied = null;
		anchor?.closest('.scene-menu')?.classList.remove(OPEN_CLASS);
		({ anchor } = detail);
		anchor.closest('.scene-menu')?.classList.add(OPEN_CLASS);
		popover.anchor = anchor;
		popover.open = true;
		void copying.then((done) => {
			if (link === url) {
				copied = done;
			}
		});
	}

	$effect(() =>
		editor.registerRootListener((root, previous) => {
			previous?.removeEventListener(MENU_LINK_EVENT, ask);
			root?.addEventListener(MENU_LINK_EVENT, ask);
		})
	);
</script>

<wa-popover
	bind:this={popover}
	class="menu-link-popover"
	placement="bottom-end"
	onwa-after-hide={() => {
		anchor?.closest('.scene-menu')?.classList.remove(OPEN_CLASS);
		anchor = null;
		link = null;
		copied = null;
	}}
>
	{#if link}
		<div class="body">
			<p class="status" role="status">
				{#if copied === true}
					<wa-icon name="check" aria-hidden="true"></wa-icon>
					Link copied to your clipboard.
				{:else if copied === false}
					Couldn't copy the link. Select it below to copy it yourself.
				{:else}
					Copying the link…
				{/if}
			</p>
			<InputField type="text" title="Link to this menu" readonly value={link} selectOnFocus />
			<wa-button href={link} target="_blank" size="s" appearance="outlined">
				<wa-icon slot="start" name="arrow-up-right-from-square" aria-hidden="true"></wa-icon>
				Open
			</wa-button>
		</div>
	{/if}
</wa-popover>

<style>
	.menu-link-popover {
		--max-width: min(24rem, 90vw);
	}

	.body {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--wa-space-s);
		inline-size: min(20rem, 80vw);

		> :global(.field) {
			align-self: stretch;
		}
	}

	.status {
		display: flex;
		align-items: center;
		gap: var(--wa-space-2xs);
		margin: 0;
		font-size: var(--wa-font-size-s);
	}
</style>
