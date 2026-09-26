<script lang="ts">
	import type { WaSelectEvent } from '@awesome.me/webawesome/dist/events/select.js';
	import {
		MAX_ATTACHMENTS_PER_MESSAGE,
		MEDIA_TTL_DEFAULT_MS,
		MEDIA_TTL_NEVER,
		MEDIA_TTL_PRESETS,
		type MediaTtl
	} from '$lib/messaging';
	import { type ComposedMessage, checkComposed } from '$lib/messaging/client';
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
		permanentMedia = false
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
	} = $props();

	// svelte-ignore state_referenced_locally
	let text = $state(initialText);
	let files: File[] = $state([]);
	/**
	 * An account that may send permanent media starts on "Never"; everyone
	 * else on two weeks. Derived rather than copied into state, so a grant
	 * that arrives with a refresh moves an untouched menu along with it.
	 */
	const defaultTtl = $derived<MediaTtl>(permanentMedia ? MEDIA_TTL_NEVER : MEDIA_TTL_DEFAULT_MS);
	/**
	 * What the sender picked, per send. Null means "the default", and it goes
	 * back to null after each send so a short choice never sticks unnoticed.
	 */
	let chosenTtl = $state<MediaTtl | null>(null);
	const mediaTtl = $derived(chosenTtl ?? defaultTtl);
	const mediaTtlLabel = $derived(
		mediaTtl === MEDIA_TTL_NEVER
			? 'Never'
			: (MEDIA_TTL_PRESETS.find((preset) => preset.ms === mediaTtl)?.label ?? '2 weeks')
	);
	let sending = $state(false);
	let problem: string | null = $state(null);
	let fileInput: HTMLInputElement | undefined = $state();
	let editor: ReturnType<typeof RichTextEditor> | undefined = $state();

	const nothingToSend = $derived(
		files.length === 0 && checkComposed({ text, files })?.kind === 'empty'
	);

	function onChange(next: string) {
		text = next;
		onTextChange?.(next);
		if (problem) {
			problem = checkComposed({ text, files })?.message ?? null;
		}
	}

	function onPick(event: Event) {
		const picked = [...((event.target as HTMLInputElement).files ?? [])];
		// Appended rather than replaced, so picking twice adds rather than
		// discards — the file input reports only its own last selection.
		files = [...files, ...picked].slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
		problem = checkComposed({ text, files })?.message ?? null;
		// Cleared so re-picking the same file fires `change` again.
		if (fileInput) {
			fileInput.value = '';
		}
	}

	// `wa-select` rather than a click per item, so keyboard selection works too
	// (see EdgeTask.svelte). The item's `value` is read as a property: Svelte
	// sets it as one on an upgraded element, and Lit does not reflect it back.
	function onTtlSelect(event: WaSelectEvent) {
		const { value } = event.detail.item as Element & { value: string };
		chosenTtl = value === MEDIA_TTL_NEVER ? MEDIA_TTL_NEVER : Number(value);
	}

	function remove(index: number) {
		files = files.filter((_, at) => at !== index);
		problem = checkComposed({ text, files })?.message ?? null;
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

		const local = checkComposed({ text, files });
		if (local) {
			problem = local.message;
			return;
		}

		sending = true;
		problem = null;
		try {
			const failure = await send({ text, files, mediaTtl });
			if (failure) {
				problem = failure;
				return;
			}
			text = '';
			files = [];
			chosenTtl = null;
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

	function sizeOf(bytes: number): string {
		return bytes < 1024 * 1024
			? `${Math.max(1, Math.round(bytes / 1024))} KB`
			: `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<div class="composer">
	{#if problem}
		<wa-callout variant="danger" size="small">{problem}</wa-callout>
	{/if}

	{#if files.length > 0}
		<ul class="files">
			{#each files as file, index (`${file.name}-${index}`)}
				<li>
					<span class="name">{file.name}</span>
					<span class="size">{sizeOf(file.size)}</span>
					<wa-button type="button" size="s" appearance="plain" pill onclick={() => remove(index)}>
						<wa-icon name="xmark" variant="solid" label={`Remove ${file.name}`}></wa-icon>
					</wa-button>
				</li>
			{/each}
		</ul>

		<!-- Only while there are files: text never self-destructs, so the choice
		     means nothing without them. -->
		<div class="ttl">
			<wa-icon name="bomb" variant="solid"></wa-icon>
			<span aria-hidden="true">Self-destructs after</span>
			<wa-dropdown placement="top-start" onwa-select={onTtlSelect}>
				<wa-button slot="trigger" size="s" appearance="outlined" with-caret>
					<span class="wa-visually-hidden">Self-destructs after </span>{mediaTtlLabel}
				</wa-button>
				{#each MEDIA_TTL_PRESETS as preset (preset.ms)}
					<wa-dropdown-item value={String(preset.ms)}>{preset.label}</wa-dropdown-item>
				{/each}
				{#if permanentMedia}
					<wa-divider></wa-divider>
					<wa-dropdown-item value={MEDIA_TTL_NEVER}>Never</wa-dropdown-item>
				{/if}
			</wa-dropdown>
		</div>
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

	.ttl {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--wa-color-text-quiet);

		wa-button {
			--wa-form-control-height: 1.75rem;
		}
	}

	.files {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;

		li {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			font-size: 0.8125rem;

			.name {
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.size {
				color: var(--wa-color-text-quiet);
				margin-inline-start: auto;
			}

			/* Row-sized rather than form-control-sized, so a file list stays compact. */
			wa-button {
				--wa-form-control-height: 1.75rem;
				color: var(--wa-color-text-quiet);
			}
		}
	}
</style>
