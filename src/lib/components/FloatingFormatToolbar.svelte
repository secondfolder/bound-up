<script module lang="ts">
	/**
	 * A button a caller adds to the toolbar: an action on the selection.
	 * `offered`, when given, is asked on every selection change, inside a
	 * read of the editor's state, whether the action makes sense for this
	 * selection; a button that would do nothing is not shown.
	 */
	export type ToolbarAction = {
		label: string;
		icon: string;
		run: () => void;
		offered?: () => boolean;
	};
</script>

<script lang="ts">
	import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
	import { $isLinkNode as isLinkNode, $toggleLink as toggleLink } from '@lexical/link';
	import {
		INSERT_CHECK_LIST_COMMAND,
		INSERT_ORDERED_LIST_COMMAND,
		INSERT_UNORDERED_LIST_COMMAND,
		$isListNode as isListNode,
		REMOVE_LIST_COMMAND
	} from '@lexical/list';
	import { $findMatchingParent as findMatchingParent } from '@lexical/utils';
	import {
		COMMAND_PRIORITY_LOW,
		FORMAT_TEXT_COMMAND,
		$getSelection as getSelection,
		$isRangeSelection as isRangeSelection,
		type LexicalEditor,
		SELECTION_CHANGE_COMMAND,
		type TextFormatType
	} from 'lexical';
	import { isSafeHttpUrl } from '$lib/embeds';
	import {
		type BlockKind,
		$selectionBlockKind as selectionBlockKind,
		$setBlockKind as setBlockKind
	} from '$lib/lexical/block-kind';
	import { sceneViewerOf } from '$lib/lexical/nodes/scene/viewer';
	import {
		$selectedMenuChecklist as selectedMenuChecklist,
		setSelectedChecklist
	} from '$lib/lexical/plugins/scene-blocks';
	import type { RichTextFeature } from '$lib/richtext-editor';

	/**
	 * The formatting bar that appears over a selection.
	 *
	 * Description fields get this; messages deliberately do not. Lexical ships no
	 * vanilla floating toolbar — the one in its playground is React — so the
	 * behaviour here follows that plugin, and the placement is Floating UI's
	 * rather than hand-rolled arithmetic.
	 *
	 * Three things this has to get right, each of which was a real bug:
	 *
	 * 1. **It must not sit under the pointer.** A toolbar drawn on top of the
	 *    text it describes catches the second click of a double-click — which is
	 *    how most people select a word — and the text silently gains whatever
	 *    format that button applies. Floating UI's `flip` and `shift` keep it
	 *    clear of the selection and inside the viewport.
	 * 2. **It must not be positioned against the editor.** The field is a
	 *    bordered box with `overflow-y: auto`, so a toolbar inside it is clipped
	 *    and adds its own height to what that box scrolls. It is moved to
	 *    `document.body` and positioned in the `fixed` strategy.
	 * 3. **Pressing a button must not dismiss it.** Focus has to stay in the
	 *    editor, or the selection collapses and the toolbar decides there is
	 *    nothing to show.
	 */
	let {
		editor,
		features,
		actions = []
	}: {
		editor: LexicalEditor;
		features: readonly RichTextFeature[];
		/**
		 * Buttons of the caller's own, after the formatting ones, for things a
		 * particular editor can do with a selection (a scene's "Make a menu").
		 * An action with no `active` is a plain button, not a toggle.
		 */
		actions?: readonly ToolbarAction[];
	} = $props();

	type Button = {
		feature: RichTextFeature;
		label: string;
		icon: string;
		active: () => boolean;
		run: () => void;
	};

	let visible = $state(false);
	/** The caller's actions that suit the current selection. */
	let offeredActions = $state.raw<readonly ToolbarAction[]>([]);
	let active = $state<Record<string, boolean>>({});
	let bar: HTMLDivElement | undefined = $state();

	/**
	 * True while a pointer is held down anywhere.
	 *
	 * The toolbar stays hidden for the whole gesture. Showing it while a
	 * selection is being dragged out puts a button under the moving cursor.
	 */
	let dragging = $state(false);

	function format(type: TextFormatType) {
		editor.dispatchCommand(FORMAT_TEXT_COMMAND, type);
	}

	/**
	 * The style of the selected lines: a heading, a subheading or body text,
	 * chosen from a small menu of its own. In a scene's menu this changes a
	 * line's role, which is what divides the menu into courses
	 * (`$setBlockKind`).
	 *
	 * Built here rather than as a `wa-dropdown`: opening that takes focus out
	 * of the editor, the selection collapses, and the toolbar closes under the
	 * menu. Native buttons that keep focus where it is, as the rest of the bar
	 * does, leave the selection alone.
	 */
	const KINDS: { kind: BlockKind; label: string }[] = [
		{ kind: 'heading', label: 'Heading' },
		{ kind: 'subheading', label: 'Subheading' },
		{ kind: 'body', label: 'Body' }
	];

	let kindsOpen = $state(false);

	const currentKind = $derived(KINDS.find(({ kind }) => active[kind])?.label ?? 'Mixed');

	function setKind(kind: BlockKind) {
		editor.update(() => setBlockKind(kind));
		kindsOpen = false;
	}

	// A closed toolbar takes its menu with it.
	$effect(() => {
		if (!visible) {
			kindsOpen = false;
		}
	});

	const BUTTONS: Button[] = [
		{
			feature: 'bold',
			label: 'Bold',
			icon: 'bold',
			active: () => active.bold,
			run: () => format('bold')
		},
		{
			feature: 'italic',
			label: 'Italic',
			icon: 'italic',
			active: () => active.italic,
			run: () => format('italic')
		},
		{
			feature: 'strikethrough',
			label: 'Strikethrough',
			icon: 'strikethrough',
			active: () => active.strikethrough,
			run: () => format('strikethrough')
		},
		{
			feature: 'code',
			label: 'Code',
			icon: 'code',
			active: () => active.code,
			run: () => format('code')
		},
		{
			feature: 'link',
			label: 'Link',
			icon: 'link',
			active: () => active.link,
			run: () => promptForLink()
		},
		{
			feature: 'list',
			label: 'Bulleted list',
			icon: 'list-ul',
			active: () => active.bullet,
			run: () =>
				editor.dispatchCommand(
					active.bullet ? REMOVE_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND,
					undefined
				)
		},
		{
			feature: 'list',
			label: 'Numbered list',
			icon: 'list-ol',
			active: () => active.number,
			run: () =>
				editor.dispatchCommand(
					active.number ? REMOVE_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND,
					undefined
				)
		},
		{
			// Handled by `registerCheckList`, which the `list` feature registers.
			// In a scene's menu it makes the selected items to-dos instead, since
			// a list command would wrap the menu's lines in a list.
			feature: 'list',
			label: 'To-do list',
			icon: 'list-check',
			active: () => active.check,
			run: () => {
				if (active.inMenu) {
					setSelectedChecklist(editor, !active.check);
					return;
				}
				editor.dispatchCommand(
					active.check ? REMOVE_LIST_COMMAND : INSERT_CHECK_LIST_COMMAND,
					undefined
				);
			}
		}
	];

	const shown = $derived(BUTTONS.filter((button) => features.includes(button.feature)));

	/**
	 * `window.prompt` rather than a bespoke popover.
	 *
	 * A link dialog that has to preserve the selection across a focus change is
	 * a genuinely fiddly component, and this is a description box in a settings
	 * form. Worth replacing if link-heavy descriptions turn out to matter.
	 */
	function promptForLink() {
		if (active.link) {
			editor.update(() => toggleLink(null));
			return;
		}
		// biome-ignore lint/suspicious/noAlert: deliberate for now — see the note above.
		const entered = globalThis.prompt('Link address');
		if (entered === null) {
			return;
		}
		const url = entered.trim();
		if (url === '') {
			return;
		}
		if (!isSafeHttpUrl(url)) {
			// biome-ignore lint/suspicious/noAlert: the other half of the prompt above.
			globalThis.alert('That needs to be an http or https address.');
			return;
		}
		editor.update(() => toggleLink(url));
	}

	/** The live selection rectangle, as a Floating UI virtual element. */
	function selectionReference() {
		const domSelection = globalThis.getSelection();
		if (!domSelection || domSelection.rangeCount === 0) {
			return null;
		}
		const range = domSelection.getRangeAt(0);
		if (range.collapsed) {
			return null;
		}
		const rect = range.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) {
			return null;
		}
		return { getBoundingClientRect: () => range.getBoundingClientRect() };
	}

	function readSelection() {
		if (dragging) {
			return;
		}

		let hasRange = false;
		editor.getEditorState().read(() => {
			const selection = getSelection();
			if (!isRangeSelection(selection) || selection.isCollapsed()) {
				return;
			}

			const anchor = selection.anchor.getNode();
			const list = findMatchingParent(anchor, isListNode);
			const kind = selectionBlockKind();
			const menu = selectedMenuChecklist(sceneViewerOf(editor));
			active = {
				heading: kind === 'heading',
				subheading: kind === 'subheading',
				body: kind === 'body',
				bold: selection.hasFormat('bold'),
				italic: selection.hasFormat('italic'),
				strikethrough: selection.hasFormat('strikethrough'),
				code: selection.hasFormat('code'),
				link: findMatchingParent(anchor, isLinkNode) !== null,
				bullet: isListNode(list) && list.getListType() === 'bullet',
				number: isListNode(list) && list.getListType() === 'number',
				check: menu.items > 0 ? menu.allTodo : isListNode(list) && list.getListType() === 'check',
				inMenu: menu.items > 0
			};
			offeredActions = actions.filter((action) => action.offered?.() ?? true);
			hasRange = true;
		});

		visible = hasRange && selectionReference() !== null;
	}

	/**
	 * Keeps the toolbar anchored to the selection.
	 *
	 * `autoUpdate` re-runs the placement on scroll and resize, which matters
	 * because the field itself scrolls independently of the page.
	 */
	$effect(() => {
		const element = bar;
		if (!(visible && element)) {
			return;
		}
		const reference = selectionReference();
		if (!reference) {
			return;
		}
		raise(element);

		const place = () => {
			void computePosition(reference, element, {
				placement: 'top',
				strategy: 'fixed',
				middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })]
			}).then(({ x, y }) => {
				element.style.left = `${x}px`;
				element.style.top = `${y}px`;
			});
		};
		return autoUpdate(reference, element, place);
	});

	/**
	 * Moves the toolbar out of the field: to `document.body`, or to the dialog
	 * the editor is in.
	 *
	 * Svelte has no portal, and this is the whole reason the toolbar used to
	 * distort the field it belongs to — see the note at the top.
	 *
	 * Into the dialog, not `<body>`, when there is one — the add and edit sheets
	 * are modal `wa-dialog`s. A modal dialog makes everything outside it inert,
	 * so on `<body>` the toolbar showed and its buttons did nothing: every click
	 * went to the dialog. Inside it, the toolbar is part of the dialog, and being
	 * a popover (`raise`) keeps the dialog's scrolling body from clipping it.
	 */
	$effect(() => {
		const element = bar;
		if (!element) {
			return;
		}
		const host = editor.getRootElement()?.closest('wa-dialog') ?? document.body;
		host.append(element);
		raise(element);
		return () => element.remove();
	});

	/**
	 * Puts the toolbar at the top of the top layer, as a manual popover, so that
	 * neither the dialog it may be in nor anything that dialog scrolls covers or
	 * clips it. The popover shown last is on top, so it is shown again each time
	 * it appears, above whatever has opened since.
	 */
	function raise(element: HTMLElement) {
		if (element.matches(':popover-open')) {
			element.hidePopover();
		}
		element.showPopover();
	}

	$effect(() => {
		const offSelection = editor.registerCommand(
			SELECTION_CHANGE_COMMAND,
			() => {
				readSelection();
				return false;
			},
			COMMAND_PRIORITY_LOW
		);
		const offUpdate = editor.registerUpdateListener(() => readSelection());

		// A selection can also be dropped by clicking outside the editor, which
		// produces no Lexical command at all.
		const onSelectionChange = () => queueMicrotask(readSelection);
		const onPointerDown = (event: PointerEvent) => {
			// A press on the toolbar is not a drag, and must not hide it.
			if (bar?.contains(event.target as Node)) {
				return;
			}
			dragging = true;
			visible = false;
		};
		const onPointerUp = () => {
			dragging = false;
			queueMicrotask(readSelection);
		};

		document.addEventListener('selectionchange', onSelectionChange);
		document.addEventListener('pointerdown', onPointerDown, true);
		document.addEventListener('pointerup', onPointerUp, true);
		return () => {
			offSelection();
			offUpdate();
			document.removeEventListener('selectionchange', onSelectionChange);
			document.removeEventListener('pointerdown', onPointerDown, true);
			document.removeEventListener('pointerup', onPointerUp, true);
		};
	});
</script>

{#if shown.length > 0 || actions.length > 0 || features.includes('heading')}
	<div
		bind:this={bar}
		popover="manual"
		class="toolbar"
		class:hidden={!visible || dragging}
		role="toolbar"
		aria-label="Text formatting"
	>
		{#if features.includes('heading')}
			<div class="kinds">
				<!-- A menu trigger, so a native button: wa-button forwards no aria-expanded. -->
				<button
					type="button"
					class="kinds-trigger"
					aria-haspopup="menu"
					aria-expanded={kindsOpen}
					aria-label="Text style: {currentKind}"
					onpointerdown={(event) => event.preventDefault()}
					onclick={() => {
						kindsOpen = !kindsOpen;
					}}
					onkeydown={(event) => {
						if (event.key === 'Escape') {
							kindsOpen = false;
						}
					}}
				>
					{currentKind}
					<wa-icon name="chevron-down" variant="solid"></wa-icon>
				</button>
				{#if kindsOpen}
					<div class="kinds-menu" role="menu" aria-label="Text style">
						{#each KINDS as { kind, label } (kind)}
							<button
								type="button"
								role="menuitemradio"
								aria-checked={active[kind] === true}
								class="kind {kind}"
								onpointerdown={(event) => event.preventDefault()}
								onclick={() => setKind(kind)}
							>
								{label}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
		{#each shown as button (button.label)}
			<!-- Native on purpose: these are toggles, and `aria-pressed` is what tells
			     a screen reader whether bold is on. `wa-button` does not forward ARIA
			     state to the `<button>` inside its shadow root, so it would be lost. -->
			<button
				type="button"
				class:active={button.active()}
				aria-label={button.label}
				aria-pressed={button.active()}
				onpointerdown={(event) => {
					// Keeps the selection alive: without this the editor loses focus
					// on press, the selection collapses, and the toolbar dismisses
					// itself before the click it was pressed for ever lands.
					event.preventDefault();
				}}
				onclick={button.run}
			>
				<wa-icon name={button.icon} variant="solid"></wa-icon>
			</button>
		{/each}
		{#each offeredActions as action (action.label)}
			<!-- A plain button: an action, not a toggle, so it carries no
			     aria-pressed. Native for the same focus handling as the rest. -->
			<button
				type="button"
				class="action"
				aria-label={action.label}
				title={action.label}
				onpointerdown={(event) => event.preventDefault()}
				onclick={() => {
					action.run();
					visible = false;
				}}
			>
				<wa-icon name={action.icon} variant="solid"></wa-icon>
			</button>
		{/each}
	</div>
{/if}

<style>
	.toolbar {
		/* Positioned by Floating UI in the `fixed` strategy, from `document.body`.
		   A popover's own `inset: 0` and `margin: auto` would centre it instead. */
		position: fixed;
		inset: auto;
		margin: 0;
		overflow: visible;
		color: inherit;
		inset-block-start: 0;
		inset-inline-start: 0;
		z-index: 40;
		display: flex;
		gap: 0.125rem;
		padding: 0.25rem;
		border-radius: 0.5rem;
		border: 1px solid var(--wa-color-surface-border);
		background: var(--wa-color-surface-raised, white);
		box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 18%);
	}

	/* Hidden rather than unmounted, so Floating UI keeps its measurements and
	   the element stays available to the pointer handlers. */
	.toolbar.hidden {
		opacity: 0;
		pointer-events: none;
	}

	button {
		display: grid;
		place-items: center;
		inline-size: 2rem;
		block-size: 2rem;
		border: none;
		border-radius: 0.375rem;
		background: none;
		color: inherit;
		cursor: pointer;
		font-size: 0.875rem;

		&:hover {
			background: var(--wa-color-neutral-fill-quiet, rgb(0 0 0 / 8%));
		}

		&.active {
			background: var(--wa-color-brand-fill-quiet, rgb(37 99 235 / 18%));
		}
	}

	/* The text style menu: a trigger as wide as its words, a divider after it,
	   and its choices in a list below, each set in the style it applies. */
	.kinds {
		position: relative;
		padding-inline-end: 0.25rem;
		margin-inline-end: 0.125rem;
		border-inline-end: 1px solid var(--wa-color-surface-border);
	}

	.kinds-trigger {
		display: flex;
		gap: 0.375rem;
		inline-size: auto;
		min-inline-size: 6.5rem;
		justify-content: space-between;
		padding-inline: 0.5rem;

		wa-icon {
			font-size: 0.625rem;
		}
	}

	.kinds-menu {
		position: absolute;
		inset-block-start: calc(100% + 0.375rem);
		inset-inline-start: 0;
		display: flex;
		flex-direction: column;
		min-inline-size: 9rem;
		padding: 0.25rem;
		border-radius: 0.5rem;
		border: 1px solid var(--wa-color-surface-border);
		background: var(--wa-color-surface-raised, white);
		box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 18%);
	}

	.kind {
		display: block;
		inline-size: 100%;
		block-size: auto;
		padding: 0.375rem 0.5rem;
		text-align: start;

		&[aria-checked='true'] {
			background: var(--wa-color-brand-fill-quiet, rgb(37 99 235 / 18%));
		}

		&.heading {
			font-size: 1.05rem;
			font-weight: var(--wa-font-weight-bold);
		}

		&.subheading {
			font-weight: var(--wa-font-weight-semibold);
		}
	}
</style>
