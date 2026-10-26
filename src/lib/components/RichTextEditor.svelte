<script lang="ts">
	import {
		COMMAND_PRIORITY_LOW,
		$createParagraphNode as createParagraphNode,
		$getRoot as getRoot,
		KEY_ENTER_COMMAND,
		type LexicalEditor
	} from 'lexical';
	import { untrack } from 'svelte';
	import '$lib/richtext-headings.css';
	import { toEditorDocument, toStoredDocument } from '$lib/lexical/document-shape';
	import { exportEditorDocument } from '$lib/lexical/nodes';
	import { parseStoredRichText, richTextDocumentSchema } from '$lib/richtext';
	import {
		createRichTextEditor,
		$embeddedUrls as embeddedUrls,
		MESSAGE_FEATURES,
		type RichTextEditorHandle,
		type RichTextFeature
	} from '$lib/richtext-editor';
	import { registerEditorEmbeds } from './editor-embeds.svelte';
	import FloatingFormatToolbar, { type ToolbarAction } from './FloatingFormatToolbar.svelte';

	/**
	 * The one editor, in both of its moods.
	 *
	 * Messages get no toolbar at all — formatting is typed (`*bold*`, `_italic_`)
	 * or keyed (Ctrl+B), the way Messenger does it. Descriptions get a floating
	 * toolbar on a selection, because a form field is a place people expect
	 * controls.
	 *
	 * `value` is the **stored string** and `onChange` hands back a stored string,
	 * so callers never see a Lexical type. Legacy plain text is accepted and
	 * silently becomes a document the moment it is saved.
	 *
	 * **`value` is the initial value only.** The editor owns its content from
	 * then on, like an uncontrolled input; to replace it from outside, call
	 * `setValue()`. That is deliberate, and it is what makes typing work:
	 * `TaskForm` feeds `onChange` straight back into `value` through superforms,
	 * and superforms propagates a store write asynchronously. A component that
	 * reloaded whenever `value` changed would therefore keep seeing a *stale*
	 * value arrive mid-keystroke and load it over what had just been typed —
	 * which is exactly the bug this shape exists to prevent. Reloading on every
	 * change also destroys the caret and any selection.
	 *
	 * **`collaborate` replaces all of that.** A notebook entry's content is a
	 * shared document, not a value: `collaborate` is handed the editor once it
	 * is built (and the element remote carets are drawn in), binds it to the
	 * document, and returns its teardown. `value`, `onChange` and `setValue`
	 * are then unused, and undo is the document's rather than Lexical's. See
	 * `notebook/CollaborativeEditor.svelte`.
	 */
	let {
		/** Initial content only — see the note above. Use `setValue()` after mount. */
		value = '',
		onChange,
		onSubmit,
		placeholder = '',
		features = MESSAGE_FEATURES,
		toolbar = false,
		toolbarActions = [],
		ariaLabel,
		editorClass = '',
		collaborate,
		readOnly = false
	}: {
		value?: string;
		onChange?: (stored: string) => void;
		/** Set for the composer: Enter sends, Shift+Enter breaks the line. */
		onSubmit?: (() => void) | undefined;
		placeholder?: string;
		features?: readonly RichTextFeature[];
		toolbar?: boolean;
		/** Buttons of the caller's own on the selection toolbar (`ToolbarAction`). */
		toolbarActions?: readonly ToolbarAction[];
		ariaLabel?: string | undefined;
		editorClass?: string;
		collaborate?: (editor: LexicalEditor, cursorsContainer: HTMLElement) => () => void;
		/** Shows the content without letting it be changed. Display only: the server decides. */
		readOnly?: boolean;
	} = $props();

	let root: HTMLDivElement | undefined = $state();
	let cursorsContainer: HTMLDivElement | undefined = $state();
	let handle: RichTextEditorHandle | null = $state(null);
	let isEmpty = $state(true);

	/**
	 * The value the editor and its parent already agree on.
	 *
	 * Set when content is loaded in, and again whenever the editor emits. The
	 * sync effect below reloads only when `value` differs from this, which is
	 * what stops a parent echoing a change back from wiping the caret — and
	 * what stops the initial load running a second time and eating whatever was
	 * typed in the moment before effects settled.
	 */
	let agreedValue: string | null = null;

	function serialise(editor: LexicalEditor): string {
		// The editor keeps embeds at the root; the stored document keeps them
		// inline, where the reader expects them — see `embed-blocks.ts`.
		const full = toStoredDocument(exportEditorDocument(editor));
		/**
		 * The stored form is the *validated* form — the same schema the server
		 * applies to descriptions. It drops Lexical's default-valued noise
		 * (`detail`, `mode`, `style`, `version`, …), which is roughly half the
		 * bytes, and it drops node state, which is the sanitisation step.
		 *
		 * If it ever fails to validate the editor has produced something outside
		 * the closed node set — a bug, but never one worth losing a message
		 * over, so the full form is stored instead. It reads back fine; it is
		 * just bigger.
		 */
		const checked = richTextDocumentSchema.safeParse(full);
		if (!checked.success) {
			console.error('[richtext] editor produced an unexpected document', checked.error);
			return JSON.stringify(full);
		}
		return JSON.stringify(checked.data);
	}

	function load(editor: LexicalEditor, stored: string) {
		const doc = toEditorDocument(parseStoredRichText(stored));
		if (doc.root.children.length === 0) {
			// Lexical refuses a state whose root has no children ("the editor state
			// is empty"), and an empty field is the commonest case there is — a
			// fresh add form. One empty paragraph is what an empty editor means.
			editor.update(
				() => {
					getRoot().clear().append(createParagraphNode());
				},
				{ discrete: true }
			);
			return;
		}
		editor.setEditorState(editor.parseEditorState(JSON.stringify(doc)));
	}

	$effect(() => {
		const element = root;
		if (!element) {
			return;
		}

		// Read once: whether this editor is collaborative is fixed for its life.
		const collaboration = untrack(() => collaborate);
		const created = createRichTextEditor({
			features,
			namespace: 'bound-up-richtext',
			history: !collaboration
		});
		const { editor } = created;
		handle = created;
		editor.setEditable(!untrack(() => readOnly));
		editor.setRootElement(element);

		/**
		 * `value` is read untracked, and that is load-bearing.
		 *
		 * This effect *builds* the editor. If it depended on `value` it would
		 * tear the editor down and build a new one every time the prop changed —
		 * and `TaskForm` feeds `onChange` straight back into `value` through
		 * superforms, so that is once per keystroke. The caret went back to the
		 * start each time, so characters landed in reverse order and a selection
		 * was dropped the instant it was made.
		 *
		 * A later value from outside is handled by the separate effect below,
		 * which reloads the *content* without rebuilding the editor. This is the
		 * same class of bug AGENTS.md records for effects that read the `data`
		 * prop, and the same fix: do not let a setup effect depend on something
		 * that changes constantly.
		 */
		/**
		 * Embeds: each one mounted as a Svelte component, and one put above every
		 * finished auto-link. Registered **before** the content is loaded, because
		 * the decorator listener only fires on commits, and one added afterwards
		 * would never hear about the embeds that arrived with the initial
		 * document. See `editor-embeds.svelte.ts`.
		 */
		const embeds = registerEditorEmbeds(editor);

		const offCollaboration =
			collaboration && cursorsContainer ? collaboration(editor, cursorsContainer) : null;
		if (!collaboration) {
			const initial = untrack(() => value);
			load(editor, initial);
			// Recorded so the sync effect below treats the mount as already settled
			// rather than loading the same content again a moment later.
			agreedValue = initial;
		}
		// Legacy content arrives with its embeds already worked out; anything
		// pasted in later gets them from the selection watcher below.
		isEmpty = editor.getEditorState().read(isEditorEmpty);

		// Registered after the embeds' own listener, so an embed inserted for this
		// update is in the value this one emits.
		const offUpdate = editor.registerUpdateListener(({ editorState }) => {
			editorState.read(() => {
				isEmpty = isEditorEmpty();
			});
			if (collaboration) {
				return;
			}
			const next = serialise(editor);
			if (next === agreedValue) {
				return;
			}
			agreedValue = next;
			onChange?.(next);
		});

		const offEnter = onSubmit
			? editor.registerCommand(
					KEY_ENTER_COMMAND,
					(event) => {
						if (!event || event.shiftKey) {
							return false;
						}
						event.preventDefault();
						// Anything typed right up to Enter still deserves its embed.
						embeds.sweep(true);
						onSubmit();
						return true;
					},
					COMMAND_PRIORITY_LOW
				)
			: () => {
					// No Enter handler was registered, so there is nothing to remove.
				};

		return () => {
			offUpdate();
			offEnter();
			offCollaboration?.();
			embeds.destroy();
			editor.setRootElement(null);
			created.destroy();
			handle = null;
		};
	});

	/**
	 * Accepts a value that genuinely came from outside — a form reset, a
	 * different task loaded into the same form.
	 *
	 * Skips the value the editor itself just produced, which is what the parent
	 * echoes back on every change. Reloading on an echo would throw away the
	 * caret for no gain, because the content is already exactly that.
	 */
	$effect(() => {
		const next = value;
		const editor = handle?.editor;
		if (!editor || next === agreedValue || collaborate) {
			return;
		}
		// Marked before loading so the emission this triggers is recognised as
		// ours and does not bounce back through the parent.
		agreedValue = next;
		untrack(() => load(editor, next));
	});

	/** Follows `readOnly` without rebuilding the editor. */
	$effect(() => {
		handle?.editor.setEditable(!readOnly);
	});

	/**
	 * Whether there is nothing here for the placeholder to sit behind.
	 *
	 * Not just "no text": an embed carries no text content of its own — its URL
	 * is in the link that produced it — so a message that is one embed and
	 * nothing else would otherwise be told it is empty, and "Reply…" would sit
	 * on top of a picture. What counts as sendable follows the same rule, in
	 * `isRichTextDocumentEmpty`.
	 *
	 * Must be called inside a `read` or an `update`.
	 */
	function isEditorEmpty(): boolean {
		return getRoot().getTextContent().trim().length === 0 && embeddedUrls().size === 0;
	}

	/** Replace the contents from outside — used to clear the composer on send. */
	export function setValue(next: string) {
		const editor = handle?.editor;
		if (!editor) {
			return;
		}
		load(editor, next);
		agreedValue = next;
	}

	export function focus() {
		handle?.editor.focus();
	}
</script>

<div class="richtext-editor {editorClass}">
	<!--
		`contenteditable` is switched on only once Lexical has attached.

		The markup is server-rendered, so a statically editable div is typeable
		during the window between hydration and the effect that builds the
		editor. Anything typed in that window goes straight into the DOM, and
		Lexical wipes it on attach — which presented as the first few characters
		vanishing when you clicked and typed immediately after a page load.
	-->
	<!-- biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: rich text needs a contenteditable surface, which no native textbox is, and it is focusable exactly when it is editable. -->
	<div
		bind:this={root}
		class="surface"
		contenteditable={handle !== null && !readOnly}
		role="textbox"
		aria-multiline="true"
		aria-label={ariaLabel ?? placeholder}
		spellcheck="true"
	></div>
	{#if collaborate}
		<!-- Where other writers' carets are drawn, over the surface: `@lexical/yjs` positions them against it. -->
		<div bind:this={cursorsContainer} class="cursors" aria-hidden="true"></div>
	{/if}
	{#if isEmpty && placeholder}
		<div class="placeholder" aria-hidden="true">{placeholder}</div>
	{/if}
	{#if toolbar && handle && !readOnly}
		<FloatingFormatToolbar editor={handle.editor} {features} actions={toolbarActions} />
	{/if}
</div>

<style>
	.richtext-editor {
		position: relative;
		display: grid;
	}

	.surface {
		grid-area: 1 / 1;
		min-inline-size: 0;
		outline: none;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.cursors {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	/* Another writer's caret and name tag (`collaboration` in the editor theme).
	   Drawn by `@lexical/yjs` inside `.cursors`, so global here. Its colour
	   arrives as `--lexical-cursor-color`, chosen on this device. */
	.cursors :global(.rt-remote-cursor) {
		inline-size: 2px;
		background: var(--lexical-cursor-color);
		z-index: 3;
	}

	.cursors :global(.rt-remote-cursor-name) {
		position: absolute;
		inset-block-end: 100%;
		inset-inline-start: -1px;
		padding: 0.1em 0.35em;
		border-radius: var(--wa-border-radius-s) var(--wa-border-radius-s) var(--wa-border-radius-s) 0;
		background: var(--lexical-cursor-color);
		color: var(--wa-color-surface-default);
		font-family: var(--wa-font-family-body);
		font-size: var(--wa-font-size-2xs);
		font-weight: var(--wa-font-weight-semibold);
		line-height: 1.2;
		white-space: nowrap;
	}

	.placeholder {
		grid-area: 1 / 1;
		pointer-events: none;
		color: var(--wa-color-text-quiet);
	}

	/* Lexical owns the markup inside `.surface`, so these have to be global —
	   scoped CSS only reaches elements this component's template declares. */
	.surface :global(p),
	.surface :global(ul),
	.surface :global(ol) {
		margin: 0;
	}

	.surface :global(p + p) {
		margin-block-start: 0.5em;
	}

	.surface :global(ul),
	.surface :global(ol) {
		padding-inline-start: 1.5em;
	}

	/* A to-do list (`list` in the editor's theme). Lexical draws its items as
	   plain `<li>`s and leaves the box to the theme, so it is the item's
	   `::before`, drawn with the tokens `wa-checkbox` uses: the reader shows a
	   real `wa-checkbox` (`RichTextList.svelte`), and the two have to match.
	   It must stay the `::before` and sit at the item's start, because that is
	   where `registerCheckList` takes a click to mean a tick — it measures the
	   pseudo-element's width from the item's edge. */
	/* Inset by exactly the focus ring's reach, so a focused box's ring is not
	   cut off by whatever clips the editor (the notebook's did). The inset is
	   on the list, not the box: the box has to stay at the item's start for
	   `registerCheckList` to find it. `RichTextList` insets by the same. */
	.surface :global(.rt-checklist) {
		padding-inline-start: calc(var(--wa-focus-ring-width) + var(--wa-focus-ring-offset));
		list-style: none;
	}

	.surface :global(.rt-checked),
	.surface :global(.rt-unchecked) {
		position: relative;
		padding-inline-start: calc(var(--wa-form-control-toggle-size) + 0.5em);
		outline: none;
	}

	.surface :global(.rt-checked::before),
	.surface :global(.rt-unchecked::before) {
		content: '';
		position: absolute;
		inset-block-start: calc((1lh - var(--wa-form-control-toggle-size)) / 2);
		inset-inline-start: 0;
		box-sizing: border-box;
		inline-size: var(--wa-form-control-toggle-size);
		block-size: var(--wa-form-control-toggle-size);
		border: var(--wa-form-control-border-width) var(--wa-border-style)
			var(--wa-form-control-border-color);
		border-radius: var(--wa-border-radius-s);
		background: var(--wa-form-control-background-color);
		cursor: pointer;
	}

	.surface :global(.rt-checked::before) {
		border-color: var(--wa-form-control-activated-color);
		background: var(--wa-form-control-activated-color);
	}

	/* The tick: two borders of a box turned on its side. */
	.surface :global(.rt-checked::after) {
		content: '';
		position: absolute;
		inset-block-start: calc((1lh - var(--wa-form-control-toggle-size)) / 2 + 0.2em);
		inset-inline-start: calc(var(--wa-form-control-toggle-size) * 0.36);
		inline-size: calc(var(--wa-form-control-toggle-size) * 0.28);
		block-size: calc(var(--wa-form-control-toggle-size) * 0.5);
		border: solid var(--wa-color-brand-on-loud);
		border-width: 0 0.15em 0.15em 0;
		transform: rotate(45deg);
		pointer-events: none;
	}

	/* The item holds the focus when the keyboard is on its box (the left arrow
	   at its start), so that is where the ring goes. */
	.surface :global(.rt-checked:focus-visible::before),
	.surface :global(.rt-unchecked:focus-visible::before) {
		outline: var(--wa-focus-ring);
		outline-offset: var(--wa-focus-ring-offset);
	}

	.surface :global(.rt-checked) {
		color: var(--wa-color-text-quiet);
		text-decoration: line-through;
	}

	.surface :global(a) {
		color: inherit;
		text-decoration: underline;
	}

	/* A link's own "Show embed" button, built in `richtext-editor.ts` — see
	   `ADD_EMBED_COMMAND` there. Hidden until the link is both hovered and
	   marked as having an embed to offer, so what decides whether it shows is
	   the link's class and the pointer, with no script watching either.

	   Centred on the link rather than beside it: the button is inside the
	   hovered wrapper, so the pointer can travel onto it without the link
	   ever stopping being hovered. Translated by half its own size, so a link
	   that wraps across two lines still gets it in the middle of its box. */
	.surface :global(.link-with-embed-offer) {
		position: relative;
	}

	.surface :global(.embed-again) {
		display: none;
		position: absolute;
		inset-block-start: 50%;
		inset-inline-start: 50%;
		z-index: 2;
		transform: translate(-50%, -50%);
		--wa-form-control-height: 1.75rem;
		--wa-form-control-padding-inline: 0.5rem;
		font-size: 0.75rem;
		user-select: none;
		white-space: nowrap;
	}

	.surface :global(.embed-again::part(base)) {
		background: var(--wa-color-surface-raised, white);
		box-shadow: 0 0.25rem 0.75rem rgb(0 0 0 / 22%);
	}

	.surface :global(.link-with-embed-offer.embed-available:hover > .embed-again) {
		display: inline-block;
	}

	/* The formats Lexical cannot express through its one tag per text node —
	   see the theme in `richtext-editor.ts`. These have to say out loud what
	   `<strong>` and `<em>` say for free, because a node that is bold *and*
	   italic gets `<strong>` only, and a struck one gets a bare `<span>`.

	   Kept in step with `MarkedText.svelte`, which wraps the same bits in real
	   elements for the read-only view: what you see while writing is what the
	   reader gets. */
	.surface :global(.rt-bold) {
		font-weight: bold;
	}

	.surface :global(.rt-italic) {
		font-style: italic;
	}

	.surface :global(.rt-strikethrough) {
		text-decoration: line-through;
	}

	/* Lexical's decorator element, holding one mounted component. Keyed on the
	   shared decorator-block class rather than on the embed's own, so a second
	   kind of block draws and behaves the same without touching this. */
	.surface :global(.decorator-block) {
		display: block;
	}

	/* Lexical's own caret for the position beside a block, which has no line box
	   to draw an ordinary one in. It parks an element there and hides the text
	   caret; this is what makes it visible. A thin bar the height of a line, so
	   it reads as a caret rather than as a selected gap. */
	.surface :global(.rt-block-cursor) {
		position: relative;
		display: block;
		pointer-events: none;
	}

	.surface :global(.rt-block-cursor::after) {
		content: '';
		position: absolute;
		inset-block-start: -0.1em;
		inline-size: 1px;
		block-size: 1.2em;
		background: currentcolor;
		animation: rt-caret-blink 1.1s steps(2, start) infinite;
	}

	@keyframes rt-caret-blink {
		to {
			visibility: hidden;
		}
	}

	/* While a block is the selection there is no text position to draw. The
	   browser draws one anyway — Lexical clears the DOM selection and Chromium
	   answers by parking a caret at the start of the field — and that reads as
	   the caret having jumped to the top of the message. */
	.surface:global(.block-selected) {
		caret-color: transparent;
	}

	/* Arrowing onto a block selects it as a whole: the caret leaves the text
	   and the next Backspace deletes the node. Both are correct and neither is
	   visible, so the selection says so out loud — without it the caret looks
	   lost and the delete looks like the editor eating something at random.
	   Drawn around the block's content rather than its element, which is a
	   full-width block whatever is inside it. */
	.surface :global(.decorator-block.is-selected > *) {
		outline: 2px solid var(--wa-color-brand-fill-loud, #2563eb);
		outline-offset: 2px;
		border-radius: 0.5rem;
	}
</style>
