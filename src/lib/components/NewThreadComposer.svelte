<script lang="ts">
	import { unlockedIdentity } from '$lib/crypto/session.svelte';
	import type { ComposedMessage } from '$lib/messaging/client';
	import { type DraftSession, openDraft } from '$lib/messaging/drafts';
	import { invalidate } from '$lib/navigation';
	import type { TagView } from '$lib/types';
	import MessageComposer from './MessageComposer.svelte';
	import TagPicker from './TagPicker.svelte';

	/**
	 * What goes inside the "Write something" dialog for one partnership: its
	 * draft, its tags and the composer.
	 *
	 * Its own component so the dialog can ask "for whom?" first on an
	 * Everyone board and render this keyed on the answer: each partnership
	 * has its own draft (`new-thread:<partnershipId>`), read once at mount, so
	 * choosing someone else has to start again from theirs rather than carry
	 * one partner's words over to another.
	 */
	let {
		partnerName,
		partnershipId,
		send,
		tags,
		permanentMedia = false,
		highQualityMedia = false
	}: {
		partnerName: string;
		partnershipId: string;
		send: (message: ComposedMessage, tagIds: string[]) => Promise<string | null>;
		tags: TagView[];
		permanentMedia?: boolean;
		highQualityMedia?: boolean;
	} = $props();

	let selectedTagIds = $state<string[]>([]);

	/**
	 * The draft for this partnership's "Write something" dialog.
	 *
	 * Tags are part of it, because until the thread exists they have nowhere
	 * else to live — but only while there is text. `save()` drops a draft with
	 * no visible text, tags and all, so a dialog emptied and closed comes back
	 * with neither. See `src/lib/messaging/drafts.ts`.
	 *
	 * Read once, at mount: the picker and the composer both take their initial
	 * state from it, and neither is rendered until it is in.
	 */
	let draft: DraftSession | null = $state(null);
	/** Plain, not `$state`: only ever read inside `save`, never rendered. */
	let text = '';

	// svelte-ignore state_referenced_locally
	void openDraft({ kind: 'new-thread', partnershipId }, unlockedIdentity()).then((opened) => {
		// A tag deleted since the draft was saved would make the send fail as
		// `no-such-tag`, so the restore keeps only the ones that still exist.
		const known = new Set(tags.map((tag) => tag.id));
		selectedTagIds = (opened.initial?.tagIds ?? []).filter((id) => known.has(id));
		text = opened.initial?.text ?? '';
		draft = opened;
	});

	function saveDraft() {
		draft?.save({ text, tagIds: $state.snapshot(selectedTagIds) });
	}

	function onTextChange(next: string) {
		text = next;
		saveDraft();
	}

	// A tag change is a draft change too. With no text, `save()` removes the
	// draft instead, which is what keeps tags from being stored on their own.
	$effect(() => {
		const tagIds = $state.snapshot(selectedTagIds);
		draft?.save({ text, tagIds });
	});

	/**
	 * A tag made here must be in `tags` the next time the dialog opens, or the
	 * restore above filters it out of the draft. The board's `tags` only change
	 * when the board reloads, so reload it.
	 */
	function onTagCreated() {
		void invalidate(`messages:board:${partnershipId}`);
	}

	async function sendWithTags(message: ComposedMessage) {
		// Held on to until the send has landed: a failed send keeps its draft.
		const session = draft;
		const failure = await send(message, selectedTagIds);
		if (!failure) {
			session?.clear();
		}
		return failure;
	}
</script>

{#if draft}
	<TagPicker {partnershipId} {tags} bind:selectedIds={selectedTagIds} startEditing {onTagCreated} />
	<!--
		No autofocus. `<wa-textarea autofocus>` reaches for its inner textarea
		before the shadow root exists and throws "Cannot read properties of null
		(reading 'focus')" — an uncaught error during hydration, which stops
		Svelte wiring up the rest of the component and leaves the whole composer
		dead. Focusing the host by hand after `updateComplete` had the same
		effect. The composer appears on a tap, so the user is already looking at
		it.
	-->
	<MessageComposer
		send={sendWithTags}
		{permanentMedia}
		{highQualityMedia}
		placeholder={`Message to ${partnerName}`}
		initialText={draft.initial?.text ?? ''}
		{onTextChange}
	/>
{:else}
	<!-- Only while the draft is read, a moment. The composer is not shown
	     empty first: whatever was typed before the draft arrived would be
	     overwritten by it. -->
	<div class="restoring" aria-busy="true"><wa-spinner></wa-spinner></div>
{/if}

<style>
	.restoring {
		display: grid;
		place-items: center;
		padding: var(--wa-space-l);
	}
</style>
