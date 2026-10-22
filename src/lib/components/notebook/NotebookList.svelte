<script lang="ts">
	import { invalidate } from '$app/navigation';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import { groupByMonth, NOTEBOOK_LIST_TOPIC, type NotebookKind } from '$lib/notebook';
	import { type RoomKey, watchRoom } from '$lib/realtime/live';
	import type { SealScope } from '$lib/sealed-forms';
	import type { NotebookEntryView } from '$lib/types';
	import NewEntryForm from './NewEntryForm.svelte';
	import NotebookEntryRow from './NotebookEntryRow.svelte';

	/**
	 * A notebook's two lists, journal and notes, for either scope: the solo
	 * notebook and a partnership's are the same page with different data. The
	 * route resolves every link it needs and hands it in, so this never builds
	 * a path itself.
	 *
	 * Live: another device (or the partner) creating, deleting or restricting
	 * an entry refreshes the lists through the notebook topic, which says only
	 * that something changed.
	 */
	let {
		journal,
		notes,
		room,
		today,
		sealScope,
		dependency,
		header,
		entryHref,
		describeEditor,
		accessNote,
		showHiddenAction = null
	}: {
		journal: NotebookEntryView[];
		notes: NotebookEntryView[];
		room: RoomKey;
		today: string;
		sealScope: SealScope;
		/** The load's `depends` key, refreshed when the list changes elsewhere. */
		dependency: string;
		header: { backHref: string; backLabel: string; backText: string; description: string };
		entryHref: (entryId: string) => string;
		/** "You" or the partner's name, for who last edited an entry. */
		describeEditor: (userId: string | null) => string | null;
		/** A badge for an entry the viewer can only read, or has restricted; null for none. */
		accessNote: (entry: NotebookEntryView) => string | null;
		/** The form action that shows a hidden entry again, where there can be one. */
		showHiddenAction?: string | null;
	} = $props();

	const tabStorageKey = 'bound-up:notebook-tab';

	function initialTab(): NotebookKind {
		try {
			return globalThis.localStorage?.getItem(tabStorageKey) === 'note' ? 'note' : 'journal';
		} catch {
			return 'journal';
		}
	}

	let tab = $state<NotebookKind>(initialTab());

	function rememberTab(event: Event) {
		const name = (event as CustomEvent<{ name?: string }>).detail?.name;
		if (name === 'journal' || name === 'note') {
			tab = name;
			try {
				globalThis.localStorage?.setItem(tabStorageKey, name);
			} catch {
				// A remembered tab is a convenience; without storage it starts on the journal.
			}
		}
	}

	// A primitive, so a refresh that reassigns the props does not reopen the stream.
	const roomKey = $derived(room);
	$effect(() => {
		const key = roomKey;
		const refresh = () => void invalidate(dependency);
		return watchRoom({
			room: key,
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

	function editedLabel(entry: NotebookEntryView): string {
		const when = new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(entry.lastEditedAt));
		const who = describeEditor(entry.lastEditedByUserId);
		return who ? `Edited ${when} by ${who}` : `Edited ${when}`;
	}
</script>


<section class="page">
	<NestedPageHeader
		backHref={header.backHref}
		backLabel={header.backLabel}
		backText={header.backText}
		title="Notebook"
		description={header.description}
	/>

	<div class="content">
		<wa-tab-group active={tab} onwa-tab-show={rememberTab}>
			<wa-tab slot="nav" panel="journal">Journal</wa-tab>
			<wa-tab slot="nav" panel="note">Notes</wa-tab>

			<wa-tab-panel name="journal">
				<div class="panel">
					<NewEntryForm kind="journal" {today} {sealScope} />
					{#if journal.length === 0}
						<EmptyState icon="feather" title="No journal entries yet">
							Dated entries about how things are going. Start one for today above.
						</EmptyState>
					{:else}
						{#each journalMonths as group (group.month)}
							<h2>{monthLabel(group.month)}</h2>
							<ul class="entries">
								{#each group.entries as entry (entry.id)}
									<NotebookEntryRow
										{entry}
										href={entryHref(entry.id)}
										dayLabel={dayLabel(entry.entryDate)}
										edited={editedLabel(entry)}
										note={accessNote(entry)}
										{showHiddenAction}
									/>
								{/each}
							</ul>
						{/each}
					{/if}
				</div>
			</wa-tab-panel>

			<wa-tab-panel name="note">
				<div class="panel">
					<NewEntryForm kind="note" {today} {sealScope} />
					{#if notes.length === 0}
						<EmptyState icon="note-sticky" title="No notes yet">
							Anything that doesn’t fit anywhere else. Start one above.
						</EmptyState>
					{:else}
						<ul class="entries">
							{#each notes as entry (entry.id)}
								<NotebookEntryRow
										{entry}
										href={entryHref(entry.id)}
										dayLabel={dayLabel(entry.entryDate)}
										edited={editedLabel(entry)}
										note={accessNote(entry)}
										{showHiddenAction}
									/>
							{/each}
						</ul>
					{/if}
				</div>
			</wa-tab-panel>
		</wa-tab-group>
	</div>
</section>

<style>
	.page {
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
		padding-block-start: var(--wa-space-m);
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
