<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { unlockedIdentity } from '$lib/crypto/session.svelte';
	import type { ComposedMessage } from '$lib/messaging/client';
	import { type DraftSession, openDraft } from '$lib/messaging/drafts';
	import type { TagView } from '$lib/types';
	import MessageComposer from './MessageComposer.svelte';
	import TagPicker from './TagPicker.svelte';

	let {
		partnerName,
		partnershipId,
		send,
		close,
		tags,
		/**
		 * Where on screen the dialog grows from: the button that opened it. Null
		 * for a dialog that opens with the page, which simply appears.
		 */
		origin = null,
		/** Display only: offers "Never" in the composer. The server enforces it. */
		permanentMedia = false,
		/** Display only: offers a choice of quality. The server enforces a byte budget. */
		highQualityMedia = false
	}: {
		partnerName: string;
		partnershipId: string;
		send: (message: ComposedMessage, tagIds: string[]) => Promise<string | null>;
		close: () => void;
		tags: TagView[];
		origin?: { x: number; y: number } | null;
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

	function onAfterHide(event: Event) {
		// `wa-after-hide` bubbles from nested Web Awesome controls such as the tag
		// dropdown. Only the dialog's own hide should unmount the composer.
		if (event.target !== event.currentTarget) {
			return;
		}
		close();
	}

	/**
	 * Grows the panel out of the button that opened it, so the composer reads
	 * as that button opening up rather than a box arriving from nowhere.
	 *
	 * Web Awesome's own show animation never runs here: the dialog is rendered
	 * already `open`, which it shows without one. A CSS animation on
	 * `::part(dialog)` would take its place, but an outside `::part` rule beats
	 * the component's own, so it would also replace the hide animation. Web
	 * Animations stack on top of CSS ones instead of replacing them.
	 */
	function growFromOrigin(host: Element) {
		const from = untrack(() => origin);
		if (!from || matchMedia('(prefers-reduced-motion: reduce)').matches) {
			return;
		}
		let cancelled = false;
		void customElements.whenDefined('wa-dialog').then(async () => {
			// After the first update the component has called `showModal()`, so
			// the panel is laid out where it will stay.
			await (host as HTMLElement & { updateComplete?: Promise<unknown> }).updateComplete;
			const panel = host.shadowRoot?.querySelector<HTMLElement>('[part~="dialog"]');
			if (cancelled || !panel) {
				return;
			}
			const rect = panel.getBoundingClientRect();
			const transformOrigin = `${from.x - rect.left}px ${from.y - rect.top}px`;
			panel.animate(
				[
					{ opacity: 0, transform: 'scale(0.15)', transformOrigin },
					{ opacity: 1, transform: 'scale(1)', transformOrigin }
				],
				{ duration: 280, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.05)' }
			);
		});
		return () => {
			cancelled = true;
		};
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
	{@attach growFromOrigin}
>
	<div class="composer">
		<!-- Who it goes to, said where it can be seen. The dialog's label says
		     it to a screen reader, but its header is hidden to keep the panel
		     small, and the placeholder alone went as soon as you typed. -->
		<div class="top-row">
			<p class="to">To <strong>{partnerName}</strong></p>
			<wa-button appearance="plain" pill class="dialog-close" onclick={close}>
				<wa-icon name="xmark" variant="solid" label="Close"></wa-icon>
			</wa-button>
		</div>
		{#if draft}
			<TagPicker
				{partnershipId}
				{tags}
				bind:selectedIds={selectedTagIds}
				startEditing
				{onTagCreated}
			/>
		{/if}
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
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.restoring {
		display: grid;
		place-items: center;
		padding: var(--wa-space-l);
	}

	.top-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-inline-start: 0.5rem;
	}

	.to {
		margin: 0;
		flex: 1 1 auto;
		min-inline-size: 0;
		color: var(--wa-color-text-quiet);
		font-size: 0.875rem;

		strong {
			color: var(--wa-color-text-normal);
		}
	}

	wa-button.dialog-close {
		flex: none;
		--wa-form-control-height: 2.75rem;
	}

	/*
	 * A sheet from the bottom on a phone, where the thumb is and where the
	 * keyboard comes up, rather than a box in the middle of the screen.
	 *
	 * Placed in the visual viewport the app shell already tracks
	 * (`--viewport-top`, `--viewport-height`, set on the shell this dialog sits
	 * inside, so they inherit): iOS does not shrink the page for the keyboard,
	 * and a sheet pinned to the bottom of the layout viewport would sit behind
	 * it. See `$lib/visual-viewport.ts`.
	 */
	@media (width < 40rem) {
		wa-dialog.composer-dialog::part(dialog) {
			inline-size: 100%;
			margin: 0;
			inset-block: auto;
			inset-block-start: calc(var(--viewport-top, 0px) + var(--viewport-height, 100dvh));
			translate: 0 -100%;
			max-block-size: calc(var(--viewport-height, 100dvh) - 2rem);
			border-end-start-radius: 0;
			border-end-end-radius: 0;
			border-block-end: none;
		}
	}
</style>
