<script lang="ts">
	import type { LexicalEditor } from 'lexical';
	import { onMount } from 'svelte';
	import { type BlockAtCaret, menuById } from '$lib/lexical/plugins/scene-blocks';
	import MenuOptions from './MenuOptions.svelte';

	/**
	 * A menu's own page's options: the same as the scene's column shows for a
	 * menu the caret is in (`MenuOptions`), in a drawer, for the page's one
	 * menu wherever the caret is. Mounted only while open, as the app's other
	 * drawers are. Not "Convert menu to plain text", which would take away
	 * the page's menu. See docs/scenes.md, "A menu's own page".
	 */
	let {
		editor,
		menuId,
		partnerId,
		onclose
	}: {
		editor: LexicalEditor;
		menuId: string;
		/** The partner the menu can be hidden from; null in a solo scene. */
		partnerId: string | null;
		onclose: () => void;
	} = $props();

	let drawer: (HTMLElement & { open: boolean; updateComplete?: Promise<unknown> }) | undefined =
		$state();

	/**
	 * Opened once it is drawn, not mounted open: Web Awesome shows a drawer
	 * that starts open at once, without sliding it in, and only slides it out.
	 */
	onMount(() => {
		let gone = false;
		void customElements
			.whenDefined('wa-drawer')
			.then(() => drawer?.updateComplete)
			.then(() => {
				if (!gone && drawer) {
					drawer.open = true;
				}
			});
		return () => {
			gone = true;
		};
	});

	/** The menu as it is now, followed through the editor's updates. */
	let menu = $state.raw<Extract<BlockAtCaret, { kind: 'menu' }> | null>(null);
	$effect(() => {
		const bound = editor;
		const id = menuId;
		const read = () => {
			menu = menuById(bound, id);
		};
		read();
		return bound.registerUpdateListener(read);
	});
</script>

<wa-drawer
	bind:this={drawer}
	label="Menu options"
	class="menu-options-drawer"
	light-dismiss
	onwa-after-hide={(event: Event) => event.target === drawer && onclose()}
>
	{#if menu}
		<MenuOptions {editor} {menu} {partnerId} readOnly={false} convertible={false} />
	{/if}
</wa-drawer>

<style>
	.menu-options-drawer {
		--size: min(26rem, 100vw);
	}
</style>
