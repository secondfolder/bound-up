<script lang="ts">
	import type { Snippet } from 'svelte';
	import { defaults } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import { invalidate } from '$app/navigation';
	import { navigating } from '$app/state';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import NestedPageHeader from '$lib/components/NestedPageHeader.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import { SOLO_NAME, shownSpace } from '$lib/context-client.svelte';
	import { groupByMonth, NOTEBOOK_LIST_TOPIC, type NotebookKind } from '$lib/notebook';
	import { type RoomKey, watchRoom } from '$lib/realtime/live';
	import type { SealScope } from '$lib/sealed-forms';
	import { superForm } from '$lib/superform';
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
		spaces,
		dependency,
		header,
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
		/** The spaces the list shows, in the switcher's order. */
		spaces: readonly ContextSpaceView[];
		/** The load's `depends` key, refreshed when the list changes elsewhere. */
		dependency: string;
		header: { backHref: string; backLabel: string; backText: string };
		entryHref: (entryId: string) => string;
		/** At the end of the header's top line: the context switcher. */
		corner?: Snippet;
	} = $props();

	const tabStorageKey = 'bound-up:notebook-tab';

	function initialTab(): NotebookKind {
		try {
			const saved = globalThis.localStorage?.getItem(tabStorageKey);
			if (saved === 'note' || saved === 'scene') {
				return saved;
			}
			return 'journal';
		} catch {
			return 'journal';
		}
	}

	let tab = $state<NotebookKind>(initialTab());

	function rememberTab(event: Event) {
		const name = (event as CustomEvent<{ name?: string }>).detail?.name;
		if (name === 'journal' || name === 'note' || name === 'scene') {
			tab = name;
			try {
				globalThis.localStorage?.setItem(tabStorageKey, name);
			} catch {
				// A remembered tab is a convenience; without storage it starts on the journal.
			}
		}
	}

	const spaceById = $derived(new Map(spaces.map((space) => [space.id, space])));
	/** Several spaces at once: each row says whose it is, and a new entry asks. */
	const several = $derived(spaces.length > 1);
	const only = $derived(spaces.length === 1 ? spaces[0] : undefined);

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

	const description = $derived.by(() => {
		if (several) {
			return 'Your own journal and notes, and the ones you share, together.';
		}
		if (only?.kind === 'shared') {
			const { name } = shownSpace(only);
			return `A journal and notes you and ${name} share, and can write in together.`;
		}
		return 'Your own journal and notes, for nobody but you.';
	});

	// ── who a new entry is for, when the list shows several spaces ─────────

	const targetStorageKey = 'bound-up:notebook-for-whom';
	const targetSchema = z.object({ spaceId: z.string().min(1, 'Choose who it’s for') });

	function rememberedTarget(): string {
		try {
			return globalThis.localStorage?.getItem(targetStorageKey) ?? '';
		} catch {
			return '';
		}
	}

	// svelte-ignore state_referenced_locally
	// Captured once, as every superform is: the stores are the live connection.
	// Never posted: it is the field behind "For whom?", which each new-entry
	// form reads when it starts an entry.
	const targetForm = superForm(
		defaults({ spaceId: rememberedTarget() }, zod4Client(targetSchema), {
			id: 'notebook-for-whom'
		}),
		{ SPA: true, resetForm: false, validators: zod4Client(targetSchema) }
	);
	const { form: targetValues } = targetForm;

	const targetOptions = $derived(
		spaces.map((space) => ({
			value: space.id,
			label: space.kind === 'solo' ? `${SOLO_NAME}, just for you` : shownSpace(space).name
		}))
	);

	// The last one used is remembered on this device, as the default next time.
	const chosenTarget = $derived($targetValues.spaceId);
	$effect(() => {
		if (!chosenTarget) {
			return;
		}
		try {
			globalThis.localStorage?.setItem(targetStorageKey, chosenTarget);
		} catch {
			// Only a default for next time.
		}
	});

	/**
	 * The space a new entry goes to: the one shown, or with several shown,
	 * the one chosen under "For whom?", which must be chosen first. Named in
	 * the form, never read from the context on the server (docs/contexts.md).
	 */
	async function target(): Promise<NewEntryTarget | null> {
		if (only) {
			return { spaceId: only.id, sealScope: sealScopeOf(only) };
		}
		const chosen = spaceById.get($targetValues.spaceId);
		if (!chosen) {
			$targetValues.spaceId = '';
			await targetForm.validateForm({ update: true });
			return null;
		}
		return { spaceId: chosen.id, sealScope: sealScopeOf(chosen) };
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
	<NestedPageHeader
		backHref={header.backHref}
		backLabel={header.backLabel}
		backText={header.backText}
		title="Notebook"
		{description}
		{corner}
	/>

	<div class="content">
		{#if several}
			<!-- Asked before an entry is started, because the list shows more
			     than one place it could go. Remembered on this device. -->
			<div class="for-whom">
				<SelectField
					superform={targetForm}
					field="spaceId"
					title="For whom?"
					options={targetOptions}
					placeholder="Choose who new entries are for"
				/>
			</div>
		{/if}
		<wa-tab-group active={tab} onwa-tab-show={rememberTab}>
			<wa-tab slot="nav" panel="journal">Journal</wa-tab>
			<wa-tab slot="nav" panel="note">Notes</wa-tab>
			<wa-tab slot="nav" panel="scene">Scenes</wa-tab>

			<wa-tab-panel name="journal">
				<div class="panel">
					<NewEntryForm kind="journal" {today} {target} />
					{#if journal.length === 0}
						<EmptyState icon="feather" title="No journal entries yet">
							Dated entries about how things are going. Start one for today above.
						</EmptyState>
					{:else}
						{#each journalMonths as group (group.month)}
							<h2>{monthLabel(group.month)}</h2>
							{@render rows(group.entries)}
						{/each}
					{/if}
				</div>
			</wa-tab-panel>

			<wa-tab-panel name="note">
				<div class="panel">
					<NewEntryForm kind="note" {today} {target} />
					{#if notes.length === 0}
						<EmptyState icon="note-sticky" title="No notes yet">
							Anything that doesn’t fit anywhere else. Start one above.
						</EmptyState>
					{:else}
						{@render rows(notes)}
					{/if}
				</div>
			</wa-tab-panel>

			<wa-tab-panel name="scene">
				<div class="panel">
					<NewEntryForm kind="scene" {today} {target} />
					{#if scenes.length === 0}
						<EmptyState icon="masks-theater" title="No scenes yet">
							Plan a scene: as loosely or as carefully as you like. Start one above.
						</EmptyState>
					{:else}
						{@render rows(scenes)}
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

	.for-whom {
		max-inline-size: 20rem;
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
