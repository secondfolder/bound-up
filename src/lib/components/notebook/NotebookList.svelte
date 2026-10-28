<script lang="ts">
	import { onMount, type Snippet, tick } from 'svelte';
	import { navigating } from '$app/state';
	import AddButton from '$lib/components/AddButton.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ResponsiveDialog from '$lib/components/ResponsiveDialog.svelte';
	import Tab from '$lib/components/tabs/Tab.svelte';
	import TabGroup from '$lib/components/tabs/TabGroup.svelte';
	import TabPanel from '$lib/components/tabs/TabPanel.svelte';
	import { shownSpace } from '$lib/context-client.svelte';
	import { invalidate } from '$lib/navigation';
	import { groupByMonth, NOTEBOOK_LIST_TOPIC, type NotebookKind } from '$lib/notebook';
	import { type RoomKey, watchRoom } from '$lib/realtime/live';
	import type { SealScope } from '$lib/sealed-forms';
	import type { ContextSpaceView, NotebookEntryView } from '$lib/types';
	import NewEntryForm, { type NewEntryTarget } from './NewEntryForm.svelte';
	import NotebookEntryRow from './NotebookEntryRow.svelte';

	/**
	 * The notebook's lists, journal, notes and scenes, for whatever the
	 * context shows: one space (your own, or a partnership's), or every space
	 * at once, where each row says whose it is. The route resolves every link
	 * it needs and hands it in, so this never builds a path itself.
	 *
	 * Live, for one space: another device (or the partner) creating, deleting
	 * or restricting an entry refreshes the lists through the notebook topic,
	 * which says only that something changed. A list of several spaces holds no
	 * stream (one per partnership would cost one each, docs/realtime.md), and
	 * refreshes when the page is looked at again instead.
	 */
	let {
		journal,
		notes,
		scenes,
		room,
		today,
		viewerId,
		you,
		spaces,
		contextSpaces,
		dependency,
		entryHref,
		corner
	}: {
		journal: NotebookEntryView[];
		notes: NotebookEntryView[];
		scenes: NotebookEntryView[];
		/**
		 * The room the list watches: the one space's, or for several the
		 * viewer's own, where each of their spaces fans its list events out.
		 */
		room: RoomKey;
		today: string;
		viewerId: string;
		/** The viewer's own name, for their avatar on the add button's fan. */
		you: string;
		/** The spaces the list shows, in the switcher's order. */
		spaces: readonly ContextSpaceView[];
		/** Every space the switcher knows, for the add button's avatars. */
		contextSpaces: readonly ContextSpaceView[];
		/** The load's `depends` key, refreshed when the list changes elsewhere. */
		dependency: string;
		entryHref: (entryId: string) => string;
		/** At the end of the header's top line: the context switcher. */
		corner?: Snippet;
	} = $props();

	const tabStorageKey = 'bound-up:notebook-tab';

	const ADD_LABEL: Record<NotebookKind, string> = {
		journal: 'New journal entry',
		note: 'New note',
		scene: 'New scene'
	};

	// Every visit starts on the journal and moves to the remembered tab once
	// mounted, rather than reading storage while the state initialises: the
	// tabs render on the server, which has no storage, so a different first
	// tab in the browser would hydrate the wrong one as selected.
	let tab = $state<NotebookKind>('journal');

	onMount(() => {
		try {
			const saved = globalThis.localStorage?.getItem(tabStorageKey);
			if (saved === 'note' || saved === 'scene') {
				tab = saved;
			}
		} catch {
			// A remembered tab is a convenience; without storage it starts on the journal.
		}
	});

	function rememberTab(name: NotebookKind) {
		try {
			globalThis.localStorage?.setItem(tabStorageKey, name);
		} catch {
			// As above.
		}
	}

	const spaceById = $derived(new Map(spaces.map((space) => [space.id, space])));
	/** Several spaces at once: each row says whose it is, and the add button asks whose a new one is. */
	const several = $derived(spaces.length > 1);

	function sealScopeOf(space: ContextSpaceView): SealScope {
		return space.kind === 'solo'
			? { kind: 'self' }
			: { kind: 'partnership', partnershipId: space.id };
	}

	/** What the viewer calls whoever else is in an entry's space, or null for their own. */
	function partnerIn(entry: NotebookEntryView): string | null {
		const space = spaceById.get(entry.spaceId);
		return space && space.kind === 'shared' ? shownSpace(space).name : null;
	}

	// ── starting an entry ────────────────────────────────────────────────────

	/**
	 * Where the next entry goes: the space the add button was pressed for,
	 * the only one shown or the one picked from its fan in Everyone. Named
	 * in the form, never read from the context on the server
	 * (docs/contexts.md, "Writes name their space").
	 */
	let addFor = $state<ContextSpaceView | null>(null);
	/** A journal entry asks for its date first, in a dialog. */
	let askingDate = $state(false);
	let creating = $state(false);
	const bareForms: Partial<Record<'note' | 'scene', NewEntryForm>> = $state({});

	function target(): Promise<NewEntryTarget | null> {
		return Promise.resolve(addFor ? { spaceId: addFor.id, sealScope: sealScopeOf(addFor) } : null);
	}

	async function add(spaceId: string) {
		addFor = spaceById.get(spaceId) ?? null;
		if (!addFor) {
			return;
		}
		if (tab === 'journal') {
			askingDate = true;
			return;
		}
		// After the render that hands the form its target.
		await tick();
		bareForms[tab]?.submit();
	}

	// ── live ─────────────────────────────────────────────────────────────────

	// A primitive, so a refresh that reassigns the props does not reopen the stream.
	const roomKey = $derived(room);
	// Not while leaving: starting an entry tells the room, which tells this
	// list, and a refresh landing during the redirect to the new entry raced
	// it. Now and then the refresh won, the page stayed on the list with the
	// new entry in it, and "New note" sat disabled for good. A list being left
	// has nothing to refresh for.
	const refresh = () => {
		if (navigating.to === null) {
			void invalidate(dependency);
		}
	};
	$effect(() => {
		// One stream either way. An Everyone list's room is the viewer's own,
		// which hears every space they are in (docs/notebook.md, "The list in
		// every context"); `watchRoom` resyncs it when the page is looked at
		// again, as it does any other.
		return watchRoom({
			room: roomKey,
			topics: [NOTEBOOK_LIST_TOPIC],
			onFrame: refresh,
			onResync: refresh
		});
	});

	const journalMonths = $derived(groupByMonth(journal));

	function monthLabel(month: string): string {
		const [year, monthNumber] = month.split('-').map(Number);
		if (!(year && monthNumber)) {
			return 'Undated';
		}
		return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
			new Date(Date.UTC(year, monthNumber - 1, 1))
		);
	}

	function dayLabel(date: string | null): string {
		if (!date) {
			return '';
		}
		const [year, month, day] = date.split('-').map(Number);
		return new Intl.DateTimeFormat(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC'
		}).format(new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)));
	}

	/** "you", or the partner's name, for who last edited an entry. */
	function editorName(entry: NotebookEntryView): string | null {
		const userId = entry.lastEditedByUserId;
		if (userId === null) {
			return null;
		}
		return userId === viewerId ? 'you' : partnerIn(entry);
	}

	function editedLabel(entry: NotebookEntryView): string {
		const when = new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(entry.lastEditedAt));
		const who = editorName(entry);
		return who ? `Edited ${when} by ${who}` : `Edited ${when}`;
	}

	/** A badge for an entry the viewer can only read, or has restricted; null for none. */
	function accessNote(entry: NotebookEntryView): string | null {
		if (entry.partnerAccess === 'edit') {
			return null;
		}
		if (entry.access === 'read') {
			return 'Read only';
		}
		const name = partnerIn(entry) ?? 'your partner';
		return entry.partnerAccess === 'read' ? `${name} can only read` : `Hidden from ${name}`;
	}
</script>

{#snippet rows(entries: NotebookEntryView[])}
	<ul class="entries">
		{#each entries as entry (entry.id)}
			{const space = $derived(spaceById.get(entry.spaceId))}
			<NotebookEntryRow
				{entry}
				href={entryHref(entry.id)}
				dayLabel={dayLabel(entry.entryDate)}
				edited={editedLabel(entry)}
				note={accessNote(entry)}
				showHiddenAction="?/show"
				chip={several ? space : undefined}
			/>
		{/each}
	</ul>
{/snippet}


<section class="page">
	<PageHeader title="Notebook" {corner} />

	<div class="content">
		<TabGroup label="Notebook" bind:active={tab} ontabshow={rememberTab}>
			{#snippet nav()}
				<Tab panel="journal">Journal</Tab>
				<Tab panel="note">Notes</Tab>
				<Tab panel="scene">Scenes</Tab>
			{/snippet}

			<TabPanel name="journal">
				<div class="panel">
					{#if journal.length === 0}
						<EmptyState icon="feather" title="No journal entries yet">
							Dated entries about how things are going. Start one with the + button.
						</EmptyState>
					{:else}
						{#each journalMonths as group (group.month)}
							<h2>{monthLabel(group.month)}</h2>
							{@render rows(group.entries)}
						{/each}
					{/if}
				</div>
			</TabPanel>

			<TabPanel name="note">
				<div class="panel">
					<NewEntryForm
						bind:this={bareForms.note}
						kind="note"
						{today}
						{target}
						bare
						onbusy={(busy) => {
							creating = busy;
						}}
					/>
					{#if notes.length === 0}
						<EmptyState icon="note-sticky" title="No notes yet">
							Anything that doesn’t fit anywhere else. Start one with the + button.
						</EmptyState>
					{:else}
						{@render rows(notes)}
					{/if}
				</div>
			</TabPanel>

			<TabPanel name="scene">
				<div class="panel">
					<NewEntryForm
						bind:this={bareForms.scene}
						kind="scene"
						{today}
						{target}
						bare
						onbusy={(busy) => {
							creating = busy;
						}}
					/>
					{#if scenes.length === 0}
						<EmptyState icon="masks-theater" title="No scenes yet">
							Plan a scene: as loosely or as carefully as you like. Start one with the + button.
						</EmptyState>
					{:else}
						{@render rows(scenes)}
					{/if}
				</div>
			</TabPanel>
		</TabGroup>
	</div>

	<AddButton
		label={ADD_LABEL[tab]}
		targets={spaces.map((space) => space.id)}
		spaces={contextSpaces}
		{you}
		busy={creating}
		onadd={(spaceId) => void add(spaceId)}
	/>
</section>

{#if askingDate && addFor}
	<!-- A journal entry's date cannot be changed once it is started, so it is
	     asked here, today unless changed; a note or a scene asks for nothing
	     and starts at once. -->
	<ResponsiveDialog
		label={addFor.kind === 'shared' ? `New journal entry with ${shownSpace(addFor).name}` : 'New journal entry'}
		onclose={() => {
			askingDate = false;
		}}
	>
		<NewEntryForm
			kind="journal"
			{today}
			{target}
			onbusy={(busy) => {
				creating = busy;
			}}
		/>
	</ResponsiveDialog>
{/if}

<style>
	/* Fills <main>, so the add button, its last child, sticks to the bottom. */
	.page {
		flex: 1 1 auto;
		max-width: var(--page-width);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.content {
		padding: 0 var(--page-gutter) var(--wa-space-l);
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-m);
	}

	h2 {
		margin: var(--wa-space-s) 0 0;
		font-size: var(--wa-font-size-s);
		color: var(--wa-color-text-quiet);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-xs);
	}
</style>
