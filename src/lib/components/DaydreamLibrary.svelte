<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		type DaydreamCharacterCopy,
		type DaydreamSceneCopy,
		DEFAULT_STORY_DIALS,
		EMPTY_CASTING
	} from '$lib/daydream';
	import { deleteLibraryItem } from '$lib/daydream/client';
	import {
		openedDaydreamCharacter,
		openedDaydreamScene,
		PENDING_TEXT,
		UNREADABLE_TEXT
	} from '$lib/sealed-views.svelte';
	import type { DaydreamLibraryItemView } from '$lib/types';
	import DaydreamCharacterDialog from './DaydreamCharacterDialog.svelte';
	import DaydreamSceneDialog from './DaydreamSceneDialog.svelte';
	import NestedPageHeader from './NestedPageHeader.svelte';

	/**
	 * The user's characters or scenes, to pick for any daydream. Edited in the
	 * same dialogs the setup form opens; deleting one never touches a
	 * daydream, which keeps its own copy.
	 */
	let {
		kind,
		items,
		suggestionsOn
	}: {
		kind: 'characters' | 'scenes';
		items: DaydreamLibraryItemView[];
		suggestionsOn: boolean;
	} = $props();

	const noun = $derived(kind === 'characters' ? 'character' : 'scene');
	let problem: string | null = $state(null);
	/** What the dialog edits: an item and its opened content, or a new one. */
	let editing: {
		item: DaydreamLibraryItemView | null;
		character?: DaydreamCharacterCopy;
		scene?: DaydreamSceneCopy;
	} | null = $state(null);

	type Opened = {
		name: string;
		detail: string;
		character?: DaydreamCharacterCopy;
		scene?: DaydreamSceneCopy;
	};

	function opened(item: DaydreamLibraryItemView): Opened | null | undefined {
		const source = { sourceId: item.id, sourceRevision: item.revision };
		if (kind === 'characters') {
			const character = openedDaydreamCharacter(item.sealed);
			return character
				? {
						name: character.name,
						detail: character.archetype,
						// From the library there is no story to be cast in.
						character: { ...character, ...source, casting: EMPTY_CASTING }
					}
				: character;
		}
		const scene = openedDaydreamScene(item.sealed);
		return scene
			? { name: scene.title, detail: scene.premise.slice(0, 120), scene: { ...scene, ...source } }
			: scene;
	}

	async function remove(item: DaydreamLibraryItemView, name: string) {
		// biome-ignore lint/suspicious/noAlert: the native confirm is the confirmation step, as for deleting a daydream.
		if (!confirm(`Delete ${name}? Daydreams that use it keep their own copy.`)) {
			return;
		}
		const removed = await deleteLibraryItem(kind, item.id);
		problem = removed.ok ? null : removed.error;
		if (removed.ok) {
			await invalidateAll();
		}
	}

	const context = { characters: [], limits: '', story: DEFAULT_STORY_DIALS };
</script>

<section class="page">
	<NestedPageHeader
		backHref={resolve('/(auth-required)/(app)/daydreams')}
		backLabel="Back to daydreams"
		backText="Daydreams"
		title={kind === 'characters' ? 'Your characters' : 'Your scenes'}
		description={'Ready to pick for any daydream. A daydream keeps its own copy, and offers to update it when you change one here.'}
	/>

	<div class="content">
		<wa-button class="new" appearance="outlined" onclick={() => {
			editing = { item: null };
		}}>
			<wa-icon slot="start" name="plus" variant="solid"></wa-icon>
			New {noun}
		</wa-button>
		{#if problem}<p class="invalid" role="alert">{problem}</p>{/if}

		{#if items.length === 0}
			<p class="empty">None yet. They are saved here when you make them for a daydream, too.</p>
		{:else}
			<ul class="items">
				{#each items as item (item.id)}
					{const shown = $derived(opened(item))}
					<li>
						<div class="text">
							<strong>{shown?.name ?? (shown === undefined ? PENDING_TEXT : UNREADABLE_TEXT)}</strong>
							{#if shown?.detail}<span class="detail">{shown.detail}</span>{/if}
						</div>
						{#if shown}
							<wa-button
								size="s"
								appearance="outlined"
								onclick={() => {
			editing = { item, character: shown.character, scene: shown.scene };
		}}
							>
								Edit {shown.name}
							</wa-button>
							<wa-button size="s" appearance="plain" onclick={() => remove(item, shown.name)}>
								<wa-icon name="trash" variant="regular" label={`Delete ${shown.name}`}></wa-icon>
							</wa-button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>

{#if editing && kind === 'characters'}
	<DaydreamCharacterDialog
		character={editing.character ?? null}
		libraryRevision={editing.item?.revision ?? null}
		{context}
		{suggestionsOn}
		onsaved={() => void invalidateAll()}
		onclose={() => {
			editing = null;
		}}
	/>
{:else if editing}
	<DaydreamSceneDialog
		scene={editing.scene ?? null}
		libraryRevision={editing.item?.revision ?? null}
		{context}
		{suggestionsOn}
		onsaved={() => void invalidateAll()}
		onclose={() => {
			editing = null;
		}}
	/>
{/if}

<style>
	.page {
		max-width: 48rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.content {
		padding: 0 var(--wa-space-l) var(--wa-space-l);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.new {
		align-self: flex-start;
	}

	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;

		li {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			padding: 0.625rem 0.75rem;
			border: 1px solid var(--wa-color-surface-border);
			border-radius: 0.6rem;
		}

		.text {
			flex: 1 1 auto;
			display: flex;
			flex-direction: column;
			min-inline-size: 0;
		}

		.detail {
			font-size: 0.875rem;
			color: var(--wa-color-text-quiet);
			overflow-wrap: anywhere;
		}
	}

	.empty {
		color: var(--wa-color-text-quiet);
	}

	.invalid {
		color: var(--wa-color-text-danger);
	}
</style>
