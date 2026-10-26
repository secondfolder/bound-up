<script lang="ts">
	import RichText from '$lib/components/RichText.svelte';
	import { readDocument } from '$lib/notebook/collab';
	import type { NotebookSession } from '$lib/notebook/session.svelte';
	import { reportRequestFailure, tryFetch } from '$lib/request-failure.svelte';
	import type { RichTextDocument } from '$lib/richtext';
	import type { NotebookVersionView } from '$lib/types';

	/**
	 * An entry's automatic versions, in a drawer: when each was made, who had
	 * written in it, and a preview of what it said, with a way to go back to it.
	 *
	 * A preview opens the version's sealed snapshot in a throwaway editor
	 * (`readDocument`) and shows it read-only; the live entry is untouched
	 * until "Restore" is chosen, and a restore is itself an ordinary edit, so
	 * it can be undone and is a version of its own.
	 *
	 * Mounted only while open, as the app's other drawers are, so it loads the
	 * history afresh each time; `onclose` runs once it has finished closing.
	 */
	let {
		session,
		entryId,
		canRestore,
		describeUser,
		onRestore,
		onclose,
		viewerId = null
	}: {
		session: NotebookSession;
		/** Who is looking, so a scene's surprise for them stays one in a preview. */
		viewerId?: string | null;
		entryId: string;
		canRestore: boolean;
		onclose: () => void;
		/** "You", the partner's name, or null for nobody this viewer knows. */
		describeUser: (userId: string | null) => string | null;
		onRestore: (version: {
			id: string;
			title: string;
			body: RichTextDocument | null;
		}) => Promise<void>;
	} = $props();

	let drawer: (HTMLElement & { open: boolean }) | undefined = $state();
	let versions = $state<NotebookVersionView[] | null>(null);
	let loadFailed = $state(false);
	let selected = $state<string | null>(null);
	let preview = $state<
		{ id: string; title: string; body: RichTextDocument | null } | 'loading' | 'failed' | null
	>(null);
	let restoring = $state(false);

	async function load() {
		const response = await tryFetch(`/api/notebook/entries/${entryId}/versions`);
		if (!response?.ok) {
			loadFailed = true;
			reportRequestFailure(response);
			return;
		}
		loadFailed = false;
		({ versions } = (await response.json()) as { versions: NotebookVersionView[] });
	}

	// Refetched whenever a version is cut, here or elsewhere, while it is open.
	const changed = $derived(session.versionsChanged);
	$effect(() => {
		void changed;
		void load();
	});

	async function show(versionId: string) {
		selected = versionId;
		preview = 'loading';
		const state = await session.openVersion(versionId);
		if (selected !== versionId) {
			return;
		}
		if (!state) {
			preview = 'failed';
			return;
		}
		preview = { id: versionId, ...(await readDocument(state)) };
	}

	async function restore() {
		if (!(preview && typeof preview === 'object')) {
			return;
		}
		restoring = true;
		try {
			await onRestore(preview);
			if (drawer) {
				drawer.open = false;
			}
		} finally {
			restoring = false;
		}
	}

	function when(iso: string): string {
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(iso)
		);
	}

	function contributors(version: NotebookVersionView): string {
		const names = version.contributorUserIds.flatMap((id) => describeUser(id) ?? []);
		return names.length > 0 ? names.join(' and ') : 'No changes recorded';
	}
</script>

<wa-drawer
	bind:this={drawer}
	label="Version history"
	class="history"
	open
	onwa-after-hide={(event: Event) => event.target === drawer && onclose()}
>
	{#if versions === null}
		{#if loadFailed}
			<p class="quiet">The history couldn’t be loaded.</p>
			<wa-button size="s" appearance="outlined" onclick={load}>Try again</wa-button>
		{:else}
			<wa-spinner></wa-spinner>
		{/if}
	{:else if versions.length === 0}
		<p class="quiet">
			No versions yet. One is saved automatically a couple of minutes after the writing stops.
		</p>
	{:else}
		<ol class="versions">
			{#each versions as version (version.id)}
				<li>
					<!-- A native button: it is an option in a list, with a selected state
					     `wa-button` would not forward. -->
					<button
						type="button"
						class="version"
						aria-pressed={selected === version.id}
						onclick={() => show(version.id)}
					>
						<span class="when">{when(version.createdAt)}</span>
						<span class="who">
							{version.restoredFromVersionId ? 'Restored an earlier version' : contributors(version)}
						</span>
					</button>
				</li>
			{/each}
		</ol>
	{/if}

	{#if preview === 'loading'}
		<wa-spinner></wa-spinner>
	{:else if preview === 'failed'}
		<p class="quiet">This version can’t be opened on this device.</p>
	{:else if preview}
		<article class="preview" aria-label="Preview of this version">
			<h3>{preview.title || 'Untitled'}</h3>
			{#if preview.body}
				<RichText text={JSON.stringify(preview.body)} {viewerId} />
			{/if}
		</article>
	{/if}

	{#if canRestore && preview && typeof preview === 'object'}
		<wa-button slot="footer" variant="brand" appearance="accent" disabled={restoring} onclick={restore}>
			Restore this version
		</wa-button>
	{/if}
</wa-drawer>

<style>
	.versions {
		list-style: none;
		margin: 0 0 var(--wa-space-m);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--wa-space-2xs);
	}

	.version {
		inline-size: 100%;
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--wa-space-3xs);
		padding: var(--wa-space-xs) var(--wa-space-s);
		border: 1px solid transparent;
		border-radius: var(--wa-border-radius-m);
		background: var(--wa-color-surface-raised);
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;
	}

	.version[aria-pressed='true'] {
		border-color: var(--wa-color-brand-border-loud);
	}

	.when {
		font-weight: var(--wa-font-weight-semibold);
	}

	.who,
	.quiet {
		color: var(--wa-color-text-quiet);
		font-size: var(--wa-font-size-s);
	}

	.preview {
		padding: var(--wa-space-m);
		border-radius: var(--wa-border-radius-m);
		background: var(--wa-color-surface-lowered);
	}

	.preview h3 {
		margin: 0 0 var(--wa-space-s);
	}
</style>
