<script lang="ts">
	import type { LexicalEditor } from 'lexical';
	import type { Snippet } from 'svelte';
	import { invalidate } from '$app/navigation';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import SidePanelLayout from '$lib/components/SidePanelLayout.svelte';
	import type { NotebookKind, PartnerAccess } from '$lib/notebook';
	import type { CursorLabel } from '$lib/notebook/collab';
	import { entrySession } from '$lib/notebook/entry-session.svelte';
	import { textChange } from '$lib/notebook/text-diff';
	import type { RoomKey } from '$lib/realtime/live';
	import type { RichTextDocument } from '$lib/richtext';
	import type { ScenePreferencesData } from '$lib/scenes/preferences-store.svelte';
	import type { SealScope } from '$lib/sealed-forms';
	import type { DaydreamLibraryItemView, KinkListView, SealedRefView } from '$lib/types';
	import AccessControl from './AccessControl.svelte';
	import type CollaborativeEditor from './CollaborativeEditor.svelte';
	import EntryTitle from './EntryTitle.svelte';

	/**
	 * One notebook entry, open for writing (or reading), for either scope. The
	 * route hands in everything that differs between the solo notebook and a
	 * partnership's; everything live lives in the `NotebookSession` this makes.
	 * See docs/notebook.md.
	 */
	type EntryData = {
		id: string;
		header: SealedRefView | null;
		kind: NotebookKind;
		entryDate: string | null;
		vaultId: string;
		revision: number;
		canWrite: boolean;
		canSetAccess: boolean;
		partnerAccess: PartnerAccess;
		restrictedByViewer: boolean;
	};

	let {
		entry,
		scene = null,
		room,
		viewerId,
		sealScope,
		dependency,
		back,
		describeUser,
		cursorLabel,
		partnerLabel = null,
		menuHref = null,
		onGone,
		whose
	}: {
		entry: EntryData;
		/** A scene's extras, for its prompt column; null for a journal entry or a note. */
		scene?: {
			preferences: ScenePreferencesData;
			partnerId: string | null;
			partnershipId: string | null;
			kinkLists: {
				own: KinkListView | null;
				mineForPartner: KinkListView | null;
				theirs: KinkListView | null;
			};
			characters: DaydreamLibraryItemView[];
			help: { available: boolean; accepted: boolean };
		} | null;
		room: RoomKey;
		viewerId: string;
		sealScope: SealScope;
		/** The load's `depends` key, refreshed when access changes. */
		dependency: string;
		back: { href: string; label: string; text: string };
		/** "You", the partner's name, or null for anyone else. */
		describeUser: (userId: string | null) => string | null;
		cursorLabel: CursorLabel;
		/** The partner's name, for a partnership entry's access control. */
		partnerLabel?: string | null;
		/** A scene menu's own page (docs/scenes.md, "A menu's own page"). */
		menuHref?: ((menuId: string) => string) | null;
		/** The entry is gone or no longer readable: leave for the list. */
		onGone: () => void;
		/**
		 * Whose space the entry is in, at the end of the back link's line: an
		 * entry shows as its own space's whatever the context is.
		 */
		whose?: Snippet;
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
	/** The live pieces, loaded in the browser only: see `loadNotebookEditor`. */
	const live = $derived(opened.live);
	const session = $derived(opened.session);
	const entryId = $derived(entry.id);
	let editor: CollaborativeEditor | undefined = $state();
	/** The entry's settings popover, for its Cancel to close. */
	let settings: (HTMLElement & { open: boolean }) | undefined = $state();
	/** The bound Lexical editor, for a scene's prompt column to write into. */
	let lexicalEditor = $state.raw<LexicalEditor | null>(null);
	/** What a scene's column is showing, for its title. */
	let columnMode = $state<'prompts' | 'menu'>('prompts');
	let historyOpen = $state(false);
	let deleteDialog: (HTMLElement & { open: boolean }) | undefined = $state();

	const readOnly = $derived(!session?.canWrite);

	const presence = $derived.by(() => {
		const others = [...new Set(session?.peers ?? [])];
		return others.flatMap((userId) => {
			const name = userId === viewerId ? 'You, on another device' : describeUser(userId);
			return name ? [name] : [];
		});
	});

	const saveText = $derived.by(() => {
		if (session?.phase !== 'ready') {
			return '';
		}
		if (!session.canWrite) {
			return 'Read only';
		}
		switch (session.saveState) {
			case 'saving':
				return 'Saving…';
			case 'offline':
				return 'Offline: changes kept on this device';
			case 'too-large':
				return 'That last change is too large to save. Undo it and add it in smaller parts.';
			default:
				return 'Saved';
		}
	});

	function dateLabel(date: string | null): string {
		if (!date) {
			return '';
		}
		const [year, month, day] = date.split('-').map(Number);
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeZone: 'UTC' }).format(
			new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1))
		);
	}

	async function restore(version: { id: string; title: string; body: RichTextDocument | null }) {
		const current = session;
		if (!(current && editor)) {
			return;
		}
		if (version.body) {
			editor.replaceBody(version.body);
		}
		const change = textChange(current.title.toString(), version.title);
		if (change) {
			current.doc.transact(() => {
				current.title.delete(change.index, change.remove);
				current.title.insert(change.index, change.insert);
			});
		}
		await current.flushNow();
		await current.cutVersion(version.id);
	}

	function openHistory() {
		historyOpen = true;
	}

	function closeHistory() {
		historyOpen = false;
	}

	function openDelete() {
		if (deleteDialog) {
			deleteDialog.open = true;
		}
	}

	function closeDelete() {
		if (deleteDialog) {
			deleteDialog.open = false;
		}
	}

	const TITLE_PLACEHOLDER: Record<NotebookKind, string> = {
		journal: 'Give this entry a title',
		note: 'Untitled note',
		scene: 'Name this scene'
	};

	const accessNote = $derived.by(() => {
		if (entry.partnerAccess === 'edit') {
			return null;
		}
		if (entry.restrictedByViewer) {
			return entry.partnerAccess === 'read'
				? `${partnerLabel ?? 'Your partner'} can only read this`
				: `Hidden from ${partnerLabel ?? 'your partner'}`;
		}
		return 'You can read this, but not change it';
	});
</script>

<!-- Stretched to the foot of the page, so a click anywhere below the text
     lands in the editor rather than on nothing. -->
{#snippet body()}
	{#if scene && live && lexicalEditor}
		<live.SceneBlockBar editor={lexicalEditor} partnerId={scene.partnerId} {readOnly} />
	{/if}
	<div class="entry-body">
		{#if live && session}
			{#key session}
				<live.CollaborativeEditor
					bind:this={editor}
					{session}
					userId={viewerId}
					{cursorLabel}
					{readOnly}
					scene={entry.kind === 'scene'}
					partnerId={scene?.partnerId ?? null}
					{menuHref}
					placeholder={entry.kind === 'scene'
						? 'Write as much or as little as you like. Ideas are beside you if you want them.'
						: undefined}
					onEditor={(bound) => {
						lexicalEditor = bound;
					}}
				/>
			{/key}
		{/if}
	</div>
{/snippet}

<section class="page" class:wide={entry.kind === 'scene'}>
	<NestedPageHeader
		backHref={back.href}
		backLabel={back.label}
		backText={back.text}
		corner={whose}
	/>

	<div class="content">
		{#if !session || session.phase === 'loading'}
			<!-- Shaped like what is coming, a title and a few lines of text, out of
			     line-sized skeletons: one block-sized skeleton is a giant pill (see
			     docs/theme.md, "Skeletons"). -->
			<div class="loading" role="status" aria-busy="true" aria-label="Opening the entry">
				<wa-skeleton effect="sheen" class="title-line"></wa-skeleton>
				{#each [96, 88, 92, 64] as width (width)}
					<wa-skeleton effect="sheen" class="text-line" style:inline-size="{width}%"></wa-skeleton>
				{/each}
			</div>
		{:else if session.phase === 'failed'}
			<wa-callout variant="warning">
				<wa-icon slot="icon" name="triangle-exclamation"></wa-icon>
				{session.failure}
			</wa-callout>
			<wa-button href={back.href} appearance="outlined">Back to the notebook</wa-button>
		{:else}
			<!-- The title, with the save status and the entry's buttons at its
			     end: on one row where they fit, and where they do not, the
			     buttons on a row of their own above it (`wrap-reverse`). -->
			<div class="head">
				<EntryTitle
					text={session.title}
					{readOnly}
					placeholder={TITLE_PLACEHOLDER[entry.kind]}
				/>
				<div class="toolbar">
					<div class="status" aria-live="polite">
						{#if entry.kind === 'journal'}<span class="date">{dateLabel(entry.entryDate)}</span>{/if}
						<span class="save" class:problem={session.saveState === 'offline' || session.saveState === 'too-large'}
							>{saveText}</span
						>
						{#if session.live === 'polling'}<span class="quiet">Live editing paused</span>{/if}
						{#each presence as name (name)}
							<wa-badge variant="brand" appearance="filled" pill>{name} is here</wa-badge>
						{/each}
					</div>
					<div class="actions">
						{#if entry.canSetAccess}
							<!-- The entry's settings, out of the way of the writing: who
							     else can see it, for the member with the say over that. -->
							<wa-button id="entry-settings" size="s" appearance="outlined">
								<wa-icon slot="start" name="gear"></wa-icon>
								Settings
							</wa-button>
							<wa-popover
								for="entry-settings"
								placement="bottom-end"
								class="settings"
								bind:this={settings}
							>
								<AccessControl
									access={entry.partnerAccess}
									partnerLabel={partnerLabel ?? 'Your partner'}
									oncancel={() => {
										if (settings) {
											settings.open = false;
										}
									}}
								/>
							</wa-popover>
						{/if}
						<wa-button size="s" appearance="outlined" onclick={openHistory}>
							<wa-icon slot="start" name="clock-rotate-left"></wa-icon>
							History
						</wa-button>
						{#if entry.canWrite}
							<wa-button size="s" appearance="outlined" variant="danger" onclick={openDelete}>
								<wa-icon slot="start" name="trash-can"></wa-icon>
								Delete
							</wa-button>
						{/if}
					</div>
				</div>
			</div>

			{#if session.writeBlocked}
				<wa-callout variant="warning">
					<wa-icon slot="icon" name="triangle-exclamation"></wa-icon>
					{session.writeBlocked}
				</wa-callout>
			{/if}

			{#if accessNote}<p class="quiet access-note">{accessNote}</p>{/if}

			{#if scene && live}
				{const Prompts = $derived(live.ScenePrompts)}
				{const current = $derived(session)}
				<!-- The column's own place, out of the way of the page: beside it
				     where there is room, over it where there is not, shown from a
				     tab on the screen's edge. See docs/scenes.md. -->
				<SidePanelLayout
					title={columnMode === 'menu' ? 'Menu options' : 'Ideas and prompts'}
					icon={columnMode === 'menu' ? 'utensils' : 'lightbulb'}
					storageKey="bound-up:scene-prompts-beside"
				>
					{#snippet main()}
						{@render body()}
					{/snippet}
					{#snippet panel()}
						<Prompts
							session={current}
							editor={lexicalEditor}
							preferences={scene.preferences}
							partnershipId={scene.partnershipId}
							kinkLists={scene.kinkLists}
							characters={scene.characters}
							help={scene.help}
							partnerId={scene.partnerId}
							onMode={(mode: 'prompts' | 'menu') => {
								columnMode = mode;
							}}
							userId={viewerId}
							{readOnly}
						/>
					{/snippet}
				</SidePanelLayout>
			{:else}
				{@render body()}
			{/if}

		{/if}
	</div>
</section>

{#if historyOpen && session && live}
	<live.VersionHistory
		{session}
		{entryId}
		canRestore={session.canWrite}
		{describeUser}
		{viewerId}
		onRestore={restore}
		onclose={closeHistory}
	/>
{/if}

<wa-dialog bind:this={deleteDialog} label="Delete this entry?">
	<p>It goes for good, with its history, for everyone who can see it.</p>
	<form method="POST" action="?/delete" slot="footer" class="dialog-actions">
		<wa-button appearance="outlined" onclick={closeDelete}>Keep it</wa-button>
		<wa-button type="submit" variant="danger" appearance="accent">Delete</wa-button>
	</form>
</wa-dialog>

<style>
	/* `flex: 1 1 auto` down the chain rather than a percentage height: the
	   shell's <main> is a flex column with no specified height, so a
	   `min-height: 100%` would have nothing to be a percentage of (AGENTS.md,
	   "Adding a route"). */
	.page {
		flex: 1 1 auto;
		max-width: var(--page-width);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Room for the prompt column beside the page. */
	.page.wide {
		max-width: var(--page-width-wide);
	}

	.content {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);
		padding: 0 var(--page-gutter) var(--wa-space-l);

		/* With a scene's prompts column beside the page, the space at the
		   foot is the page's alone, so the column runs on to the app's nav
		   rather than stopping short of it. */
		&:has(> :global(.side-panel-layout)) {
			padding-block-end: 0;

			& > :global(.side-panel-layout > .main) {
				padding-block-end: var(--wa-space-l);
			}
		}
	}

	.entry-body {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		/* A writing surface at least a few lines tall even when the page is
		   short, as on a phone with the keyboard up. */
		min-block-size: 10rem;
	}

	/* The editor's own box, and its one grid row, take all of it, so the
	   editable surface reaches the bottom. Global because the element is
	   `RichTextEditor`'s. */
	.entry-body > :global(.richtext-editor) {
		flex: 1 1 auto;
		grid-template-rows: 1fr;
	}

	.head {
		display: flex;
		flex-wrap: wrap-reverse;
		align-items: center;
		gap: var(--wa-space-s) var(--wa-space-m);

		/* The title takes the row, down to a width a title can be read at. */
		& > :global(.entry-title) {
			flex: 1 1 18rem;
			min-inline-size: 0;
		}
	}

	/* Everything at the end of its row, the status beside the buttons. */
	.toolbar {
		display: flex;
		flex: 0 1 auto;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: var(--wa-space-s);
		margin-inline-start: auto;
	}

	.status,
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--wa-space-xs) var(--wa-space-s);
	}

	/* As wide as its choice needs and no wider, the same either side. */
	.settings {
		--max-width: 90vw;

		& :global(.access) {
			inline-size: min(18rem, 80vw);
		}
	}

	.status {
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
	}

	.date {
		color: var(--wa-color-text-normal);
		font-weight: var(--wa-font-weight-semibold);
	}

	.save.problem {
		color: var(--wa-color-text-danger);
	}

	.quiet {
		color: var(--wa-color-text-quiet);
	}

	.access-note {
		margin: 0;
		font-size: var(--wa-font-size-s);
	}

	.loading {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-s);
	}

	/* A line each, at the height of the text they stand in for. */
	.title-line {
		inline-size: 40%;
		block-size: var(--wa-font-size-xl);
		margin-block-end: var(--wa-space-s);
	}

	.text-line {
		block-size: 1em;
	}

	.dialog-actions {
		display: flex;
		gap: var(--wa-space-s);
		justify-content: end;
	}
</style>
