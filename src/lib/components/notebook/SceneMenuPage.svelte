<script lang="ts">
	import type { LexicalEditor } from 'lexical';
	import { invalidate } from '$app/navigation';
	import type { CursorLabel } from '$lib/notebook/collab';
	import { entrySession } from '$lib/notebook/entry-session.svelte';
	import type { RoomKey } from '$lib/realtime/live';
	import type { SealScope } from '$lib/sealed-forms';
	import type { SealedRefView } from '$lib/types';

	/**
	 * One menu of a scene, on a page of its own and filling it, for either
	 * scope: what a menu's link opens. Read only at first, with its to-dos
	 * still tickable by anyone who could edit it, and an Edit button for them
	 * that makes the menu itself editable. Bound to the whole scene's live
	 * document, as the scene's page is, but showing only the menu
	 * (`registerOnlyMenu`). See docs/scenes.md, "A menu's own page".
	 */
	let {
		entry,
		menuId,
		partnerId = null,
		room,
		viewerId,
		sealScope,
		dependency,
		sceneHref,
		cursorLabel,
		onGone
	}: {
		entry: {
			id: string;
			vaultId: string;
			revision: number;
			header: SealedRefView | null;
			canWrite: boolean;
		};
		menuId: string;
		/** A shared scene's partner, whom the toolbar can make a line a surprise for. */
		partnerId?: string | null;
		room: RoomKey;
		viewerId: string;
		sealScope: SealScope;
		/** The load's `depends` key, refreshed when access changes. */
		dependency: string;
		/** The scene the menu is in, for when it is not there any more. */
		sceneHref: string;
		cursorLabel: CursorLabel;
		/** The scene is gone or no longer readable. */
		onGone: () => void;
	} = $props();

	const opened = entrySession(() => ({
		entryId: entry.id,
		vaultId: entry.vaultId,
		canWrite: entry.canWrite,
		room,
		viewerId,
		sealScope,
		revision: entry.revision,
		header: entry.header,
		onAccessChanged: () => void invalidate(dependency),
		onGone
	}));
	const live = $derived(opened.live);
	const session = $derived(opened.session);

	/** Whether the menu is in the scene; null until the scene has been applied. */
	let found = $state<boolean | null>(null);
	let editing = $state(false);

	const canWrite = $derived(session?.canWrite ?? false);

	/** The bound editor, for the menu's options. */
	let lexicalEditor = $state.raw<LexicalEditor | null>(null);
	/** Whether the menu's options are open, beside it; only in edit mode. */
	let optionsOpen = $state(false);
	$effect(() => {
		if (!editing) {
			optionsOpen = false;
		}
	});
	const showing = $derived(session?.phase === 'ready' && found === true);
</script>

<svelte:head>
	<title>Menu</title>
</svelte:head>

<section class="scene-menu-page">
	{#if canWrite && showing}
		<!-- Over the menu's own corner: the menu is the page, edge to edge.
		     Filled either way, so it reads on a light design as on a dark
		     (the brand's light fill did not, behind its own amber text). -->
		<div class="corner">
			{#if editing}
				<wa-button
					size="s"
					variant="neutral"
					appearance="filled-outlined"
					onclick={() => {
						optionsOpen = true;
					}}
				>
					<wa-icon slot="start" name="sliders"></wa-icon>
					Options
				</wa-button>
			{/if}
			{#if editing}
				<wa-button
					size="s"
					variant="brand"
					appearance="accent"
					onclick={() => {
						editing = false;
					}}
				>
					<wa-icon slot="start" name="check"></wa-icon>
					Done
				</wa-button>
			{:else}
				<!-- Just its icon, out of the menu's way while it is read: named by
				     the icon's label, which is what the inner button takes its
				     name from (AGENTS.md). Round, as an icon button is. -->
				<wa-button
					size="s"
					variant="neutral"
					appearance="filled-outlined"
					pill
					onclick={() => {
						editing = true;
					}}
				>
					<wa-icon name="pen" label="Edit"></wa-icon>
				</wa-button>
			{/if}
		</div>
	{/if}

	{#if session?.phase === 'failed'}
		<div class="notice">
			<wa-callout variant="warning">
				<wa-icon slot="icon" name="triangle-exclamation"></wa-icon>
				{session.failure}
			</wa-callout>
			<wa-button href={sceneHref} appearance="outlined">Open the scene</wa-button>
		</div>
	{:else if found === false}
		<div class="notice">
			<p>This menu isn't in the scene any more.</p>
			<wa-button href={sceneHref} appearance="outlined">Open the scene</wa-button>
		</div>
	{:else if !showing}
		<!-- Nothing to see while it opens, not a skeleton: the page is the
		     menu, and a skeleton the shape of no design in particular only
		     flashed up before it. Said, for a screen reader. -->
		<p class="wa-visually-hidden" role="status">Opening the menu…</p>
	{/if}

	{#if optionsOpen && live && lexicalEditor}
		<live.MenuOptionsDrawer
			editor={lexicalEditor}
			{menuId}
			{partnerId}
			onclose={() => {
				optionsOpen = false;
			}}
		/>
	{/if}

	<!-- Mounted as soon as the session has its document, so the editor can
	     say whether the menu is there; out of sight until it has. -->
	{#if live && session && session.phase === 'ready'}
		<div class="menu" class:pending={!showing}>
			{#key session}
				<live.CollaborativeEditor
					{session}
					userId={viewerId}
					{cursorLabel}
					readOnly={!(canWrite && editing)}
					tickable={canWrite}
					scene
					{partnerId}
					onlyMenu={menuId}
					onEditor={(bound) => {
						lexicalEditor = bound;
					}}
					onMenuFound={(menuFound: boolean) => {
						found = menuFound;
					}}
				/>
			{/key}
		</div>
	{/if}
</section>

<style>
	/* The whole pane, and the menu the whole of it: the app shell leaves out
	   its nav and notices on this page (`(app)/+layout.svelte`), and nothing
	   here adds a column, a gutter or a margin around the menu. */
	.scene-menu-page {
		position: relative;
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
	}

	.corner {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--wa-space-xs);
		position: absolute;
		inset-block-start: var(--wa-space-s);
		inset-inline-end: var(--wa-space-s);
		/* Above the menu's own drawings, which stack inside it. */
		z-index: 10;

		wa-button {
			box-shadow: var(--wa-shadow-m);
		}
	}

	/* `flex: 1 1 auto` down the chain to the menu, rather than percentage
	   heights, which the shell's <main> gives nothing to be a percentage of
	   (AGENTS.md, "Adding a route"). */
	.menu {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;

		&.pending {
			display: none;
		}

		> :global(.richtext-editor) {
			flex: 1 1 auto;
			grid-template-rows: 1fr;
		}

		/* The editor's root (`menu-page`, from `registerOnlyMenu`), and in
		   it the one menu shown, stretched to fill it with none of a
		   block's margin on the page. */
		:global(.surface.menu-page) {
			display: flex;
			flex-direction: column;
		}

		:global(.surface.menu-page > .only-menu) {
			flex: 1 1 auto;
			margin: 0;
		}
	}

	.notice {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
		inline-size: 100%;
		max-inline-size: var(--page-width);
		margin: 0 auto;
		padding: var(--wa-space-l) var(--page-gutter);
		box-sizing: border-box;
		align-items: flex-start;

		p {
			margin: 0;
		}
	}
</style>
