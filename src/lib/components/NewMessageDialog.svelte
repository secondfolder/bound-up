<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { unlockedIdentity } from '$lib/crypto/session.svelte';
	import { type DraftSession, openDraft } from '$lib/messaging/drafts';
	import type { TagView } from '$lib/types';
	import MessageComposer from './MessageComposer.svelte';
	import TagPicker from './TagPicker.svelte';

	let {
		partnerName,
		partnershipId,
		send,
		close,
		tags
	}: {
		partnerName: string;
		partnershipId: string;
		send: (message: { text: string; files: File[] }, tagIds: string[]) => Promise<string | null>;
		close: () => void;
		tags: TagView[];
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

	function onAfterHide(event: Event) {
		// `wa-after-hide` bubbles from nested Web Awesome controls such as the tag
		// dropdown. Only the dialog's own hide should unmount the composer.
		if (event.target !== event.currentTarget) {
			return;
		}
		close();
	}

	async function sendWithTags(message: { text: string; files: File[] }) {
		// Held on to until the send has landed: a failed send keeps its draft.
		const session = draft;
		const failure = await send(message, selectedTagIds);
		if (!failure) {
			session?.clear();
		}
		return failure;
	}
</script>

<!--
	No `light-dismiss`: the tag picker's dropdown opens in a popup layer that the
	dialog counts as an outside click, so selecting a tag flashed the chip and
	closed the whole dialog mid-compose. The dialog still listens for its own
	`wa-after-hide`, but only after filtering out bubbled hide events from nested
	Web Awesome controls. Caught by the Playwright test
	"picking a tag in the composer keeps the dialog open".
-->
<wa-dialog
	label={`Send to ${partnerName}`}
	class="composer-dialog"
	open
	onwa-after-hide={onAfterHide}
>
	<div class="composer">
		<div class="top-row">
			{#if draft}
				<TagPicker
					{partnershipId}
					{tags}
					bind:selectedIds={selectedTagIds}
					startEditing
					{onTagCreated}
				/>
			{/if}
			<wa-button appearance="plain" pill class="dialog-close" aria-label="Close" onclick={close}>
				<wa-icon name="xmark" variant="solid" label="Close"></wa-icon>
			</wa-button>
		</div>
		{#if draft}
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
	</div>
</wa-dialog>

<style>
	wa-dialog.composer-dialog {
		--width: min(44rem, calc(100vw - 2rem));
		--spacing: var(--wa-space-m);
		--backdrop-filter: brightness(0.45) blur(0.3rem);
	}

	wa-dialog.composer-dialog::part(dialog) {
		inline-size: min(44rem, calc(100vw - 2rem));
		margin: auto;
		padding: 0.5em;
		max-inline-size: none;
		max-block-size: min(80svh, 42rem);
		border-radius: 1.25rem;
		background: var(--wa-color-surface-raised, var(--wa-color-surface-default, white));
		border: 1px solid var(--wa-color-surface-border);
		box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 28%);
	}

	wa-dialog.composer-dialog::part(header) {
		display: none;
	}

	wa-dialog.composer-dialog::part(body) {
		padding: 0;
		background: var(--wa-color-surface-raised, var(--wa-color-surface-default, white));
	}

	wa-dialog.composer-dialog::part(close-button__base) {
		border-radius: 999px;
	}

	.composer {
		inline-size: 100%;
		block-size: 100%;
	}

	.restoring {
		display: grid;
		place-items: center;
		padding: var(--wa-space-l);
	}

	.top-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;

		:global(.tag-picker) {
			flex: 1 1 auto;
			min-inline-size: 0;
		}
	}

	wa-button.dialog-close {
		flex: none;
		margin-inline-start: auto;
		--wa-form-control-height: 2.75rem;
	}
</style>
