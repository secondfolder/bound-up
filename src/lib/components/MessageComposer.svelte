<script lang="ts">
	import type { WaSelectEvent } from '@awesome.me/webawesome/dist/events/select.js';
	import { onDestroy } from 'svelte';
	import { defaultQuality, MEDIA_QUALITY_LABELS, nextQuality } from '$lib/media-quality';
	import {
		MAX_ATTACHMENTS_PER_MESSAGE,
		MEDIA_TTL_DEFAULT_MS,
		MEDIA_TTL_NEVER,
		MEDIA_TTL_PRESETS,
		type MediaTtl
	} from '$lib/messaging';
	import { type ComposedMessage, checkSizes, checkText } from '$lib/messaging/client';
	import { PendingAttachment } from '$lib/messaging/pending-attachment.svelte';
	import { MESSAGE_FEATURES } from '$lib/richtext-editor';
	import RichTextEditor from './RichTextEditor.svelte';

	/**
	 * Where a message is written. Presentational: it collects a document and
	 * files and hands them up. No crypto, no fetch.
	 *
	 * `send` returns an error string to render, or null on success.
	 *
	 * Formatting has no on-screen controls, deliberately — this is a chat box,
	 * and Messenger does not put a toolbar in one. `*bold*`, `_italic_`,
	 * `~struck~` and Ctrl+B are the whole interface. Descriptions, which live in
	 * forms, get the floating toolbar instead.
	 *
	 * Historical note worth keeping: this component used to attach its `input`
	 * and `keydown` listeners by hand, because `<wa-textarea>` kept its editable
	 * node in a shadow root and Svelte's event delegation does not reliably
	 * cross that boundary — `oninput=` never fired and the send button sat
	 * permanently disabled. The editor mounts on an ordinary `contenteditable`
	 * div, so both workarounds are gone. Do not reintroduce a `wa-textarea`
	 * here without reading that history.
	 */
	let {
		send,
		placeholder = 'Say something…',
		submitLabel = 'Send',
		initialText = '',
		onTextChange,
		permanentMedia = false,
		highQualityMedia = false
	}: {
		send: (message: ComposedMessage) => Promise<string | null>;
		placeholder?: string;
		submitLabel?: string;
		/** A restored draft. Initial only, like the editor's own `value`. */
		initialText?: string;
		/**
		 * Every change to the text, including the reset to '' after a send.
		 *
		 * This is how a draft is kept (`src/lib/messaging/drafts.ts`): the
		 * composer stays presentational and the caller decides where it goes.
		 */
		onTextChange?: ((text: string) => void) | undefined;
		/**
		 * Whether to offer "Never" among the self-destruct choices — the
		 * `permanentMedia` feature. It only decides what is shown: the server
		 * refuses a `never` from an account without the feature regardless.
		 */
		permanentMedia?: boolean;
		/**
		 * Whether each file gets an SD / HD / Original button — the
		 * `highQualityMedia` feature. Without it every file is SD and there is
		 * nothing to choose. It only decides what is shown: the server holds an
		 * account without the feature to the SD byte budget regardless.
		 */
		highQualityMedia?: boolean;
	} = $props();

	// svelte-ignore state_referenced_locally
	let text = $state(initialText);
	/**
	 * The picked files, each already compressing at its own quality — see
	 * `PendingAttachment`. Quality and lifetime are per file, and a new file
	 * starts on the defaults, so a choice made for one never sticks to the next.
	 */
	let attachments: PendingAttachment[] = $state([]);
	let sending = $state(false);
	/** A refusal from the last attempt to send, or from the text check it ran. */
	let refusal: string | null = $state(null);
	let fileInput: HTMLInputElement | undefined = $state();
	let editor: ReturnType<typeof RichTextEditor> | undefined = $state();

	/**
	 * Measured live as each file finishes compressing: only a file whose final
	 * form is known can be measured, so a 40 MB clip is not refused on its way
	 * to becoming 6 MB. A file sent as picked is known at once.
	 */
	const sizeProblem = $derived(
		checkSizes(
			attachments.flatMap((attachment) => (attachment.prepared ? [attachment.prepared] : [])),
			highQualityMedia
		)?.message ?? null
	);
	const problem = $derived(refusal ?? sizeProblem);

	const nothingToSend = $derived(checkText(text, attachments.length)?.kind === 'empty');

	/** The files still compressing, and how far they have got between them. */
	const pending = $derived(attachments.filter((attachment) => attachment.prepared === null));
	const pendingLabel = $derived.by(() => {
		if (pending.length === 0) {
			return 'Sending…';
		}
		const fraction =
			pending.reduce((sum, attachment) => sum + (attachment.progress ?? 0), 0) / pending.length;
		const files = pending.length === 1 ? '1 file' : `${pending.length} files`;
		return `Compressing ${files}… (${Math.round(fraction * 100)}%)`;
	});

	const anyOriginal = $derived(attachments.some((attachment) => attachment.quality === 'original'));

	onDestroy(() => {
		for (const attachment of attachments) {
			attachment.dispose();
		}
	});

	function onChange(next: string) {
		text = next;
		onTextChange?.(next);
		if (refusal) {
			refusal = checkText(text, attachments.length)?.message ?? null;
		}
	}

	function onPick(event: Event) {
		const picked = [...((event.target as HTMLInputElement).files ?? [])];
		const room = MAX_ATTACHMENTS_PER_MESSAGE - attachments.length;
		// Appended rather than replaced, so picking twice adds rather than
		// discards — the file input reports only its own last selection. Each
		// starts compressing here, the moment it is picked.
		attachments = [
			...attachments,
			...picked.slice(0, Math.max(0, room)).map(
				(file) =>
					new PendingAttachment(file, {
						quality: defaultQuality(highQualityMedia),
						// "Never" for an account that may send permanent media, two
						// weeks for everyone else.
						mediaTtl: permanentMedia ? MEDIA_TTL_NEVER : MEDIA_TTL_DEFAULT_MS
					})
			)
		];
		refusal = null;
		// Cleared so re-picking the same file fires `change` again.
		if (fileInput) {
			fileInput.value = '';
		}
	}

	function ttlLabel(mediaTtl: MediaTtl): string {
		return mediaTtl === MEDIA_TTL_NEVER
			? 'Never'
			: (MEDIA_TTL_PRESETS.find((preset) => preset.ms === mediaTtl)?.label ?? '2 weeks');
	}

	// `wa-select` rather than a click per item, so keyboard selection works too
	// (see EdgeTask.svelte). The item's `value` is read as a property: Svelte
	// sets it as one on an upgraded element, and Lit does not reflect it back.
	function onTtlSelect(attachment: PendingAttachment, event: WaSelectEvent) {
		const { value } = event.detail.item as Element & { value: string };
		attachment.mediaTtl = value === MEDIA_TTL_NEVER ? MEDIA_TTL_NEVER : Number(value);
	}

	function remove(attachment: PendingAttachment) {
		attachment.dispose();
		attachments = attachments.filter((other) => other !== attachment);
		refusal = null;
	}

	/**
	 * Sends on a click rather than on a form submit.
	 *
	 * There is no `<form>` here on purpose. Enter is handled by the editor
	 * itself (`onSubmit` below), so a form would contribute nothing but a
	 * second, less reliable path to the same function.
	 */
	async function submit() {
		if (sending || nothingToSend) {
			return;
		}

		const local = checkText(text, attachments.length);
		if (local) {
			refusal = local.message;
			return;
		}
		if (sizeProblem) {
			return;
		}

		sending = true;
		refusal = null;
		try {
			// Usually already done: compressing started when each file was picked.
			// Anything still going is waited for here, with its progress showing.
			const sent = [...attachments];
			let files: File[];
			try {
				files = await Promise.all(sent.map((attachment) => attachment.ready()));
			} catch {
				// Only an abort rejects, and only `dispose` aborts the job a file is
				// waiting on: the composer went away mid-send. Nothing is left to
				// send it from.
				return;
			}
			const failure = await send({
				text,
				attachments: sent.map((attachment, index) => ({
					file: files[index] ?? attachment.original,
					mediaTtl: attachment.mediaTtl
				})),
				highQualityMedia
			});
			if (failure) {
				refusal = failure;
				return;
			}
			text = '';
			for (const attachment of sent) {
				attachment.dispose();
			}
			attachments = attachments.filter((attachment) => !sent.includes(attachment));
			// The editor owns its document, so resetting the state is not enough.
			editor?.setValue('');
			// Said explicitly rather than left to the editor's change event: the
			// draft must go once the message is sent, whether or not the reset
			// emits one.
			onTextChange?.('');
		} finally {
			sending = false;
		}
	}
</script>

<div class="composer">
	{#if problem}
		<wa-callout variant="danger" size="small">{problem}</wa-callout>
	{/if}

	{#if attachments.length > 0}
		<ul class="attachments">
			{#each attachments as attachment (attachment.id)}
				<li>
					<wa-button
						type="button"
						size="s"
						appearance="plain"
						pill
						disabled={sending}
						onclick={() => remove(attachment)}
					>
						<wa-icon name="trash-can" variant="solid" label={`Remove ${attachment.name}`}
						></wa-icon>
					</wa-button>

					<span class="thumb">
						{#if attachment.kind === 'video'}
							<!-- `#t=0.1` so Safari draws a first frame instead of nothing. -->
							<video
								src={`${attachment.previewUrl}#t=0.1`}
								muted
								playsinline
								preload="metadata"
								aria-label={attachment.name}
							></video>
						{:else}
							<img src={attachment.previewUrl} alt={attachment.name} />
						{/if}
						{#if attachment.progress !== null}
							<!-- Over the thumbnail, so it is plain the work has already started. -->
							<span class="busy" aria-hidden="true">
								{Math.round(attachment.progress * 100)}%
							</span>
						{/if}
					</span>

					<wa-dropdown
						placement="top-start"
						onwa-select={(event: WaSelectEvent) => onTtlSelect(attachment, event)}
					>
						<wa-button slot="trigger" size="s" appearance="outlined" with-caret disabled={sending}>
							<wa-icon slot="start" name="bomb" variant="solid"></wa-icon>
							<span class="wa-visually-hidden">{attachment.name} self-destructs after </span
							>{ttlLabel(attachment.mediaTtl)}
						</wa-button>
						{#each MEDIA_TTL_PRESETS as preset (preset.ms)}
							<wa-dropdown-item value={String(preset.ms)}>{preset.label}</wa-dropdown-item>
						{/each}
						{#if permanentMedia}
							<wa-divider></wa-divider>
							<wa-dropdown-item value={MEDIA_TTL_NEVER}>Never</wa-dropdown-item>
						{/if}
					</wa-dropdown>

					{#if highQualityMedia}
						<!-- A plain button that cycles, not a toggle: it has three states, and
						     `aria-pressed` has two. Its name says which file and which tier. -->
						<wa-button
							type="button"
							size="s"
							appearance="outlined"
							class="quality"
							disabled={sending}
							onclick={() => attachment.setQuality(nextQuality(attachment.quality))}
						>
							<span class="wa-visually-hidden">Quality of {attachment.name}: </span>{MEDIA_QUALITY_LABELS[
								attachment.quality
							]}
						</wa-button>
					{/if}
				</li>
			{/each}
		</ul>

		{#if anyOriginal}
			<!-- Said because it is the one thing Original does that nobody would
			     guess: compressing is also what strips a photo's EXIF. -->
			<p class="hint">Originals are sent exactly as picked, including any location data.</p>
		{/if}
	{/if}

	{#if sending && attachments.length > 0}
		<p class="progress" aria-live="polite">{pendingLabel}</p>
	{/if}

	<div class="row">
		<!--
			The attach control and the editor share a positioned `.field` box so the
			button can sit INSIDE the input, at its inline-end and block-end: visually
			centred on a one-line box and pinned to the bottom as the editor grows.
			Text never runs under the button because the editing surface reserves the
			button's width as inline-end padding (below).

			No autofocus, deliberately: the composer appears on a tap, so the user is
			already looking at it.
		-->
		<div class="field">
			<RichTextEditor
				bind:this={editor}
				value={initialText}
				{onChange}
				onSubmit={submit}
				{placeholder}
				features={MESSAGE_FEATURES}
				ariaLabel={placeholder}
				editorClass="composer-input"
			/>

			<label class="attach" aria-label="Attach a photo or video">
				<wa-icon name="image" variant="solid"></wa-icon>
				<input
					bind:this={fileInput}
					type="file"
					accept="image/*, video/*"
					multiple
					onchange={onPick}
				/>
			</label>
		</div>

		<!-- disabled={...}, never `... || undefined` — invariant 11. -->
		<wa-button variant="brand" disabled={sending || nothingToSend} onclick={submit}>
			{#if sending}<wa-spinner></wa-spinner>{:else}{submitLabel}{/if}
		</wa-button>
	</div>
</div>

<style>
	.composer {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.row {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;

		wa-button {
			/* Stops iOS turning a double tap on the send button into a zoom. */
			touch-action: manipulation;
		}
	}

	.field {
		position: relative;
		flex: 1 1 auto;
		min-inline-size: 0;
		display: flex;

		/* The editor is a plain contenteditable box, so it gets the border and
		   padding `<wa-textarea>` used to draw for us. */
		:global(.composer-input) {
			flex: 1 1 auto;
			min-inline-size: 0;
			max-block-size: 40svh;
			overflow-y: auto;
			padding: 0.5rem 2.375rem 0.5rem 0.75rem;
			border: 1px solid var(--wa-color-surface-border);
			border-radius: 1rem;
			background: var(--wa-color-surface-lowered, transparent);
		}

		:global(.composer-input:focus-within) {
			outline: 2px solid var(--wa-color-brand-fill-loud, currentColor);
			outline-offset: -1px;
		}
	}

	.attach {
		/* Inside `.field`'s box, over the textarea: bottom-anchored, so it is
		   vertically centred on a one-line box and stays at the bottom as the
		   textarea grows. 2rem + 2×0.25rem fits inside a one-line control. */
		position: absolute;
		inset-block-end: 0.3rem;
		inset-inline-end: 0.3rem;
		display: grid;
		place-items: center;
		inline-size: 2rem;
		block-size: 2rem;
		border-radius: 50%;
		cursor: pointer;
		color: var(--wa-color-text-quiet);

		&:focus-within {
			outline: 2px solid var(--wa-color-brand-fill-loud, currentColor);
			outline-offset: 2px;
		}

		input {
			position: absolute;
			clip-path: inset(50%);
			inline-size: 1px;
			block-size: 1px;
		}
	}

	.hint,
	.progress {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);
	}

	.attachments {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;

		li {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			font-size: 0.8125rem;
		}

		/* Row-sized rather than form-control-sized, so a file list stays compact. */
		wa-button {
			--wa-form-control-height: 1.75rem;
		}

		wa-button[pill] {
			color: var(--wa-color-text-quiet);
		}
	}

	.thumb {
		position: relative;
		flex: none;
		inline-size: 2.75rem;
		block-size: 2.75rem;
		overflow: hidden;
		border-radius: var(--wa-border-radius-s, 0.25rem);
		background: var(--wa-color-surface-lowered);

		img,
		video {
			display: block;
			inline-size: 100%;
			block-size: 100%;
			object-fit: cover;
		}

		.busy {
			position: absolute;
			inset: 0;
			display: grid;
			place-items: center;
			background: var(--media-badge-fill);
			color: var(--wa-color-text-normal);
			font-size: 0.6875rem;
			font-variant-numeric: tabular-nums;
		}
	}
</style>
