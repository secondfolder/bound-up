<script lang="ts">
	import { mount, unmount, untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		$createParagraphNode as createParagraphNode,
		$getRoot as getRoot,
		$getNodeByKey as getNodeByKey,
		$getSelection as getSelection,
		$isRangeSelection as isRangeSelection,
		BLUR_COMMAND,
		COMMAND_PRIORITY_LOW,
		KEY_ENTER_COMMAND,
		type LexicalEditor
	} from 'lexical';
	import { $isAutoLinkNode as isAutoLinkNode, $isLinkNode as isLinkNode } from '@lexical/link';
	import { $findMatchingParent as findMatchingParent } from '@lexical/utils';
	import ComposerEmbed from './ComposerEmbed.svelte';
	import FloatingFormatToolbar from './FloatingFormatToolbar.svelte';
	import {
		$autoLinksAwaitingEmbeds as autoLinksAwaitingEmbeds,
		$embeddedUrls as embeddedUrls,
		$insertEmbedForLink as insertEmbedForLink,
		$insertEmbedForUrl as insertEmbedForUrl,
		$isEmbedNode as isEmbedNode,
		MESSAGE_FEATURES,
		createRichTextEditor,
		settleLinksAfterEmbeds,
		trackEmbedDismissals,
		type RichTextEditorHandle,
		type RichTextFeature
	} from '$lib/richtext-editor';
	import { parseStoredRichText, richTextDocumentSchema } from '$lib/richtext';
	import { embedSpecFor } from '$lib/embeds';

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
	 */
	let {
		/** Initial content only — see the note above. Use `setValue()` after mount. */
		value = '',
		onChange,
		onSubmit = undefined,
		placeholder = '',
		features = MESSAGE_FEATURES,
		toolbar = false,
		ariaLabel = undefined,
		editorClass = ''
	}: {
		value?: string;
		onChange: (stored: string) => void;
		/** Set for the composer: Enter sends, Shift+Enter breaks the line. */
		onSubmit?: (() => void) | undefined;
		placeholder?: string;
		features?: readonly RichTextFeature[];
		toolbar?: boolean;
		ariaLabel?: string | undefined;
		editorClass?: string;
	} = $props();

	let root: HTMLDivElement | undefined = $state();
	let shell: HTMLDivElement | undefined = $state();
	let handle: RichTextEditorHandle | null = $state(null);
	let isEmpty = $state(true);

	/**
	 * URLs whose embed the writer removed.
	 *
	 * Plain state, not persisted anywhere: the decision belongs to this draft,
	 * and a sent message carries the result rather than the reasoning. Kept in
	 * the component rather than in the editor so it dies with the composer —
	 * clearing the box after a send starts everyone fresh.
	 */
	const dismissedEmbeds = new SvelteSet<string>();

	/** The link the pointer is over, when it could have an embed and has none. */
	let hoveredLink: { url: string; x: number; y: number } | null = $state(null);
	let embedButton: HTMLButtonElement | undefined = $state();

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
		const full = editor.getEditorState().toJSON();
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
		const doc = settleLinksAfterEmbeds(parseStoredRichText(stored));
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
		if (!element) return;

		const created = createRichTextEditor({ features, namespace: 'bound-up-richtext' });
		const { editor } = created;
		handle = created;
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
		 * Lexical's decorators, mounted as real Svelte components.
		 *
		 * Lexical renders nothing itself for a `DecoratorNode`: it collects what
		 * each one's `decorate()` returns into a record keyed by node and hands
		 * that to this listener after every commit, leaving the host framework to
		 * put something in the element it reconciled. React has portals for this;
		 * Svelte has `mount`, so each embed is its own tiny component root.
		 *
		 * Registered **before** the content is loaded, because the listener only
		 * fires on commits — a listener added afterwards would never hear about
		 * the embeds that arrived with the initial document.
		 *
		 * The record is complete every time, so a key that is gone has been
		 * deleted and its component has to be unmounted: Svelte roots are not
		 * cleaned up by their DOM disappearing, and each one holds an
		 * `IntersectionObserver` and a scroll listener through `UrlEmbed`.
		 */
		const embeds = new SvelteMap<string, { url: string; component: Record<string, unknown> }>();

		const removeEmbed = (key: string) =>
			editor.update(() => {
				const node = getNodeByKey(key);
				if (isEmbedNode(node)) node.remove();
			});

		const offDecorators = editor.registerDecoratorListener<string>((decorators) => {
			for (const [key, mounted] of embeds) {
				if (decorators[key] === mounted.url) continue;
				void unmount(mounted.component);
				embeds.delete(key);
			}
			for (const [key, url] of Object.entries(decorators)) {
				if (embeds.has(key)) continue;
				const target = editor.getElementByKey(key);
				if (!target) continue;
				const component = mount(ComposerEmbed, {
					target,
					props: { url, onRemove: () => removeEmbed(key) }
				}) as Record<string, unknown>;
				embeds.set(key, { url, component });
			}
		});

		const initial = untrack(() => value);
		load(editor, initial);
		// Recorded so the sync effect below treats the mount as already settled
		// rather than loading the same content again a moment later.
		agreedValue = initial;
		// Legacy content arrives with its embeds already worked out; anything
		// pasted in later gets them from the selection watcher below.
		isEmpty = editor.getEditorState().read(isEditorEmpty);

		/**
		 * Embeds appear above the paragraph of any finished auto-link.
		 *
		 * "Finished" means the caret is not inside it: typing a URL shows no
		 * embed until you move off, so nothing pops up mid-word. Every *other*
		 * embeddable link gets one straight away, which is what makes a pasted
		 * block of text — or several URLs entered at once — come out with all of
		 * its embeds rather than just the last.
		 *
		 * `registerAutoLink` works through node transforms that run after the
		 * update callback returns, so the links only exist to be noticed on a
		 * later tick. That is why this hangs off the update listener rather than
		 * off the keystroke that produced them.
		 *
		 * A URL whose embed has been removed is skipped for good — see
		 * `dismissedEmbeds`. Without that, the same caret move that inserts an
		 * embed in the first place would put it straight back, and the remove
		 * button would look broken every time the writer went back to fix a typo.
		 */
		let settling = false;

		const caretLinkKey = (): string | null => {
			const selection = getSelection();
			if (!isRangeSelection(selection)) return null;
			return findMatchingParent(selection.anchor.getNode(), isAutoLinkNode)?.getKey() ?? null;
		};

		const sweepEmbeds = (ignoreCaret = false) => {
			if (settling) return;
			let work = false;
			editor.getEditorState().read(() => {
				work =
					autoLinksAwaitingEmbeds(ignoreCaret ? null : caretLinkKey(), dismissedEmbeds).length > 0;
			});
			if (!work) return;
			// Guarded because this runs *from* an update listener, and an
			// unguarded update from there is an infinite loop.
			settling = true;
			editor.update(
				() => {
					for (const link of autoLinksAwaitingEmbeds(
						ignoreCaret ? null : caretLinkKey(),
						dismissedEmbeds
					)) {
						insertEmbedForLink(link);
					}
				},
				{ onUpdate: () => (settling = false) }
			);
		};

		const offUpdate = editor.registerUpdateListener(({ editorState, prevEditorState }) => {
			// Before the sweep, always: this is what tells the sweep that the
			// embed it is about to re-insert was just deleted on purpose.
			trackEmbedDismissals(prevEditorState, editorState, dismissedEmbeds);
			sweepEmbeds();
			// The chip that was under the pointer may have just gone.
			if (hoveredLink) hoveredLink = null;

			const next = serialise(editor);
			editorState.read(() => {
				isEmpty = isEditorEmpty();
			});
			if (next === agreedValue) return;
			agreedValue = next;
			onChange(next);
		});

		// Leaving the field entirely counts as moving off the link too — the case
		// where someone types a URL and immediately clicks Send.
		const offBlur = editor.registerCommand(
			BLUR_COMMAND,
			() => {
				sweepEmbeds(true);
				return false;
			},
			COMMAND_PRIORITY_LOW
		);

		const offEnter = onSubmit
			? editor.registerCommand(
					KEY_ENTER_COMMAND,
					(event) => {
						if (!event || event.shiftKey) return false;
						event.preventDefault();
						// Anything typed right up to Enter still deserves its embed.
						sweepEmbeds(true);
						onSubmit();
						return true;
					},
					COMMAND_PRIORITY_LOW
				)
			: () => {};

		return () => {
			offUpdate();
			offBlur();
			offEnter();
			offDecorators();
			for (const mounted of embeds.values()) void unmount(mounted.component);
			embeds.clear();
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
		if (!editor || next === agreedValue) return;
		// Marked before loading so the emission this triggers is recognised as
		// ours and does not bounce back through the parent.
		agreedValue = next;
		untrack(() => load(editor, next));
	});

	/**
	 * The way back from a removed embed.
	 *
	 * Deletion is sticky on purpose, so there has to be a gesture that means
	 * "actually, do embed this one". Hovering the link is it: the button sits
	 * centred **on** the link rather than beside it, which keeps the pointer
	 * inside the anchor's own box all the way from hovering to clicking. A
	 * button placed next to the link would vanish as the pointer crossed the
	 * plain text in between.
	 *
	 * Pointer-only, and that is a real gap for keyboard users — but the caret
	 * cannot be used as the trigger here, because moving it onto and off the
	 * link is exactly the gesture that must *not* re-embed.
	 *
	 * Not offered for the link the caret is still inside. A URL being typed has
	 * no embed yet for the same reason the sweep leaves it alone — it is not
	 * finished — and a button offering to add one it is about to get anyway
	 * reads as though something has gone wrong.
	 */
	function embeddableWithoutEmbed(url: string): boolean {
		const editor = handle?.editor;
		if (!editor || !embedSpecFor(url)) return false;
		return editor.getEditorState().read(() => {
			if (embeddedUrls().has(url)) return false;
			return caretLinkUrl() !== url;
		});
	}

	/** The URL of the link the caret is inside, if it is inside one. */
	function caretLinkUrl(): string | null {
		const selection = getSelection();
		if (!isRangeSelection(selection)) return null;
		const link = findMatchingParent(selection.anchor.getNode(), isLinkNode);
		return isLinkNode(link) ? link.getURL() : null;
	}

	function onSurfaceHover(event: PointerEvent) {
		const target = event.target as HTMLElement | null;
		// The button sits over the link, so it is the target for most of the
		// gesture. Treating that as "not on a link" would hide it mid-click.
		if (embedButton && target && embedButton.contains(target)) return;

		const anchor = target?.closest?.('a');
		const host = shell;
		if (!anchor || !host || !root?.contains(anchor)) {
			hoveredLink = null;
			return;
		}
		const url = anchor.getAttribute('href') ?? '';
		if (!embeddableWithoutEmbed(url)) {
			hoveredLink = null;
			return;
		}
		const rect = anchor.getBoundingClientRect();
		const bounds = host.getBoundingClientRect();
		hoveredLink = {
			url,
			x: rect.left - bounds.left + rect.width / 2,
			y: rect.top - bounds.top + rect.height / 2
		};
	}

	function insertHoveredEmbed() {
		const url = hoveredLink?.url;
		const editor = handle?.editor;
		hoveredLink = null;
		if (!url || !editor) return;
		dismissedEmbeds.delete(url);
		editor.update(() => {
			insertEmbedForUrl(url);
		});
	}

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
		if (!editor) return;
		load(editor, next);
		agreedValue = next;
	}

	export function focus() {
		handle?.editor.focus();
	}
</script>

<!--
	Pointer events rather than `mouseover`/`mouseout`: they carry touch as well,
	and they are not the pair svelte's a11y rule asks to see paired with a
	`focus` handler — which would be the wrong trigger here anyway, since moving
	the caret into a link is precisely the gesture that must not re-embed it.
-->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={shell}
	class="richtext-editor {editorClass}"
	onpointerover={onSurfaceHover}
	onpointermove={onSurfaceHover}
	onpointerleave={() => (hoveredLink = null)}
>
	<!--
		`contenteditable` is switched on only once Lexical has attached.

		The markup is server-rendered, so a statically editable div is typeable
		during the window between hydration and the effect that builds the
		editor. Anything typed in that window goes straight into the DOM, and
		Lexical wipes it on attach — which presented as the first few characters
		vanishing when you clicked and typed immediately after a page load.
	-->
	<div
		bind:this={root}
		class="surface"
		contenteditable={handle !== null}
		role="textbox"
		aria-multiline="true"
		aria-label={ariaLabel ?? placeholder}
		spellcheck="true"
	></div>
	{#if isEmpty && placeholder}
		<div class="placeholder" aria-hidden="true">{placeholder}</div>
	{/if}
	{#if hoveredLink}
		<button
			bind:this={embedButton}
			type="button"
			class="embed-again"
			aria-label="Add embed"
			title="Add embed"
			style:inset-block-start="{hoveredLink.y}px"
			style:inset-inline-start="{hoveredLink.x}px"
			onpointerdown={(event) => {
				// Keeps the caret where it was: a press inside the editor moves it,
				// and the sweep treats "the caret is in this link" as "still typing".
				event.preventDefault();
			}}
			onclick={insertHoveredEmbed}
		>
			<!-- A plus beside the embed icon: the icon alone says "embed", which
			     reads as a state ("this has one") rather than as the action the
			     button performs. -->
			<wa-icon name="plus" variant="solid"></wa-icon>
			<wa-icon name="image" variant="solid"></wa-icon>
		</button>
	{/if}
	{#if toolbar && handle}
		<FloatingFormatToolbar editor={handle.editor} {features} />
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

	.placeholder {
		grid-area: 1 / 1;
		pointer-events: none;
		color: var(--wa-color-text-quiet);
	}

	/* Centred on the link it belongs to, not next to it — see the note on
	   `onSurfaceHover`. Translated by half its own size rather than positioned
	   from a measured corner, so a link that wraps across two lines still gets
	   the button in the middle of the box it occupies. */
	.embed-again {
		position: absolute;
		z-index: 2;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		gap: 0.2rem;
		block-size: 1.75rem;
		padding-inline: 0.5rem;
		border: 1px solid var(--wa-color-surface-border);
		border-radius: 999px;
		background: var(--wa-color-surface-raised, white);
		color: var(--wa-color-text-normal);
		box-shadow: 0 0.25rem 0.75rem rgb(0 0 0 / 22%);
		cursor: pointer;
		font-size: 0.75rem;

		wa-icon {
			margin-inline-start: 0;
			margin-inline-end: 0;
		}
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

	.surface :global(a) {
		color: inherit;
		text-decoration: underline;
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

	/* Lexical's decorator element, holding one mounted widget component. A
	   block, because what is inside it is one — an inline box wrapping a block
	   child has no sensible geometry to outline. This and the two rules below
	   are keyed on the shared widget class rather than on the embed's own, so a
	   second kind of widget draws and behaves the same without touching this. */
	.surface :global(.richtext-widget) {
		display: block;
	}

	/* While a widget is the selection there is no text position to draw. The
	   browser draws one anyway — Lexical clears the DOM selection and Chromium
	   answers by parking a caret at the start of the field — and that reads as
	   the caret having jumped to the top of the message. */
	.surface:global(.widget-selected) {
		caret-color: transparent;
	}

	/* Arrowing onto a widget selects it as a whole: the caret leaves the text
	   and the next Backspace deletes the node. Both are correct and neither is
	   visible, so the selection says so out loud — without it the caret looks
	   lost and the delete looks like the editor eating something at random.
	   Drawn around the widget's content rather than its element, which is a
	   full-width block whatever is inside it. */
	.surface :global(.richtext-widget.is-selected > *) {
		outline: 2px solid var(--wa-color-brand-fill-loud, #2563eb);
		outline-offset: 2px;
		border-radius: 0.5rem;
	}
</style>
