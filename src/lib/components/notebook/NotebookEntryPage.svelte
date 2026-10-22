<script lang="ts">
	import { invalidate } from '$app/navigation';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import { currentKeyring } from '$lib/crypto/session.svelte';
	import type { PartnerAccess } from '$lib/notebook';
	import type { CursorLabel } from '$lib/notebook/collab';
	import { loadNotebookEditor } from '$lib/notebook/load';
	import type { NotebookSession } from '$lib/notebook/session.svelte';
	import { textChange } from '$lib/notebook/text-diff';
	import type { RoomKey } from '$lib/realtime/live';
	import type { RichTextDocument } from '$lib/richtext';
	import type { SealScope } from '$lib/sealed-forms';
	import type { SealedRefView } from '$lib/types';
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
		kind: 'journal' | 'note';
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
		room,
		viewerId,
		sealScope,
		dependency,
		back,
		describeUser,
		cursorLabel,
		partnerLabel = null,
		onGone
	}: {
		entry: EntryData;
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
		/** The entry is gone or no longer readable: leave for the list. */
		onGone: () => void;
	} = $props();

	/** The live pieces, loaded in the browser only: see `loadNotebookEditor`. */
	let live = $state<Awaited<ReturnType<typeof loadNotebookEditor>> | null>(null);
	let session = $state<NotebookSession | null>(null);
	let editor: CollaborativeEditor | undefined = $state();
	let historyOpen = $state(false);
	let deleteDialog: (HTMLElement & { open: boolean }) | undefined = $state();

	/**
	 * Primitives, so a refresh of the load (which reassigns `entry`) does not
	 * tear the session down: only a different entry, or a change in whether
	 * this viewer may write, rebuilds it. AGENTS.md, "An `$effect` that reads
	 * the `data` prop re-runs on every `invalidate()`".
	 */
	const entryId = $derived(entry.id);
	const vaultId = $derived(entry.vaultId);
	const canWrite = $derived(entry.canWrite);
	const roomKey = $derived(room);

	// A keyring that is not open renders the placeholder, never content
	// (AGENTS.md), and an entry cannot be opened without it anyway.
	const unlocked = $derived(currentKeyring().status === 'unlocked');

	$effect(() => {
		void loadNotebookEditor().then((loaded) => {
			live = loaded;
		});
	});

	$effect(() => {
		const modules = live;
		if (!(unlocked && modules)) {
			return;
		}
		const created = new modules.NotebookSession({
			entryId,
			vaultId,
			scope: sealScope,
			room: roomKey,
			userId: viewerId,
			canWrite,
			// Read once: the session keeps its own count from here.
			headerRevision: entry.revision,
			header: entry.header
				? {
						id: entry.header.recordId,
						vaultId: entry.header.vaultId,
						ciphertext: entry.header.ciphertext,
						payloadVersion: entry.header.payloadVersion
					}
				: null,
			onAccessChanged: () => void invalidate(dependency),
			onGone
		});
		session = created;
		void created.open();
		return () => {
			created.destroy();
			if (session === created) {
				session = null;
			}
		};
	});

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

<section class="page">
	<NestedPageHeader backHref={back.href} backLabel={back.label} backText={back.text} />

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

			{#if session.writeBlocked}
				<wa-callout variant="warning">
					<wa-icon slot="icon" name="triangle-exclamation"></wa-icon>
					{session.writeBlocked}
				</wa-callout>
			{/if}

			{#if accessNote}<p class="quiet access-note">{accessNote}</p>{/if}

			<EntryTitle
				text={session.title}
				{readOnly}
				placeholder={entry.kind === 'journal' ? 'Give this entry a title' : 'Untitled note'}
			/>

			<!-- Stretched to the foot of the page, so a click anywhere below the
			     text lands in the editor rather than on nothing. -->
			<div class="entry-body">
				{#if live}
					{#key session}
						<live.CollaborativeEditor
							bind:this={editor}
							{session}
							userId={viewerId}
							{cursorLabel}
							{readOnly}
						/>
					{/key}
				{/if}
			</div>

			{#if entry.canSetAccess}
				<AccessControl access={entry.partnerAccess} partnerLabel={partnerLabel ?? 'Your partner'} />
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

	.content {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);
		padding: 0 var(--page-gutter) var(--wa-space-l);
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

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--wa-space-s);
	}

	.status,
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--wa-space-xs) var(--wa-space-s);
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
