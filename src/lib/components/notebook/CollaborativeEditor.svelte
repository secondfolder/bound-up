<script lang="ts">
	import {
		$getRoot as getRoot,
		type LexicalEditor,
		$parseSerializedNode as parseSerializedNode,
		type SerializedLexicalNode
	} from 'lexical';
	import type { ToolbarAction } from '$lib/components/FloatingFormatToolbar.svelte';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import MenuArtPicker from '$lib/components/scenes/MenuArtPicker.svelte';
	import MenuItemExtras from '$lib/components/scenes/MenuItemExtras.svelte';
	import MenuLinkPopover from '$lib/components/scenes/MenuLinkPopover.svelte';
	import '$lib/scenes/scene-blocks.css';
	import '$lib/scenes/menu-designs.css';
	import { toEditorDocument } from '$lib/lexical/document-shape';
	import { sceneViewerOf, setSceneViewer, setTickable } from '$lib/lexical/nodes/scene/viewer';
	import {
		$canMakeMenu as canMakeMenu,
		registerOnlyMenu,
		$selectedMenuItems as selectedMenuItems,
		selectionToMenu,
		setSelectedSurprise,
		visibleText
	} from '$lib/lexical/plugins/scene-blocks';
	import {
		bindEditor,
		type CursorLabel,
		providerFor,
		registerCollaboration,
		relabelledCursors
	} from '$lib/notebook/collab';
	import type { NotebookSession } from '$lib/notebook/session.svelte';
	import type { RichTextDocument } from '$lib/richtext';
	import { DOCUMENT_FEATURES, SCENE_FEATURES } from '$lib/richtext-editor';

	/**
	 * A notebook entry's body: the app's rich-text editor, bound to the entry's
	 * shared document instead of a value.
	 *
	 * Everything an editor looks and behaves like (the surface, the formatting
	 * toolbar, embeds, the placeholder) is `RichTextEditor`'s; this only hands
	 * it `collaborate`, which binds the editor to the session's document, draws
	 * other writers' carets, and gives undo to the document. Once bound, it
	 * tells the session to apply what it fetched; see `bindEditor` for why that
	 * order matters.
	 */
	let {
		session,
		userId,
		cursorLabel,
		readOnly,
		placeholder = 'Start writing…',
		scene = false,
		partnerId = null,
		menuHref = null,
		onlyMenu = null,
		tickable = false,
		onMenuFound,
		onEditor
	}: {
		session: NotebookSession;
		userId: string;
		/** What another writer's caret says, decided on this device: see `relabelledCursors`. */
		cursorLabel: CursorLabel;
		readOnly: boolean;
		placeholder?: string;
		/**
		 * A scene's page, which gets the scene blocks as well (docs/scenes.md).
		 * A flag rather than a feature list, so the page that passes it need not
		 * import the editor module, and Lexical with it.
		 */
		scene?: boolean;
		/** A shared scene's partner, whom a menu item can be a surprise for. */
		partnerId?: string | null;
		/**
		 * Where a scene menu's own page is, for its link button
		 * (`MenuLinkPopover`); without it the button offers nothing.
		 */
		menuHref?: ((menuId: string) => string) | null;
		/**
		 * Shows the scene's menu with this id alone, on its own page, and keeps
		 * every edit inside it (`registerOnlyMenu`). Read once, as the editor
		 * is bound.
		 */
		onlyMenu?: string | null;
		/** To-dos can be ticked while `readOnly` (`setTickable`): a writer reading a menu's page. */
		tickable?: boolean;
		/** Whether the `onlyMenu` menu is in the scene, as that changes. */
		onMenuFound?: (found: boolean) => void;
		/**
		 * The bound editor once it is ready, and null once it has gone: for a
		 * scene's prompt column, which writes into the page and reads what it
		 * mentions.
		 */
		onEditor?: (editor: LexicalEditor | null) => void;
	} = $props();

	let editorRef: LexicalEditor | null = null;
	/** The same, for what the page draws beside the editor. */
	let boundEditor = $state.raw<LexicalEditor | null>(null);

	/**
	 * Whether the selected menu items are surprises already: decides which of
	 * the two surprise buttons the toolbar offers. Asked inside a read.
	 */
	function selectedItemsHidden(): 'none' | 'all' | 'some' | null {
		const items = editorRef && partnerId ? selectedMenuItems(sceneViewerOf(editorRef)) : [];
		if (items.length === 0) {
			return null;
		}
		const hidden = items.filter((item) => item.getHiddenFrom() !== null).length;
		if (hidden === 0) {
			return 'none';
		}
		return hidden === items.length ? 'all' : 'some';
	}

	/** What a scene's selection toolbar adds to formatting (docs/scenes.md, "Blocks"). */
	const sceneActions: ToolbarAction[] = [
		{
			label: 'Make a menu',
			icon: 'utensils',
			// Not over a menu: its lines are a menu already, and would be left as they are.
			offered: () => canMakeMenu(),
			run: () => {
				if (editorRef) {
					selectionToMenu(editorRef);
				}
			}
		},
		// A menu item has no options of its own, so a surprise is made from
		// its words, selected.
		{
			label: 'Make a surprise',
			icon: 'gift',
			offered: () => {
				const hidden = selectedItemsHidden();
				return hidden === 'none' || hidden === 'some';
			},
			run: () => {
				if (editorRef && partnerId) {
					setSelectedSurprise(editorRef, partnerId);
				}
			}
		},
		{
			label: 'Not a surprise',
			icon: 'eye',
			offered: () => selectedItemsHidden() === 'all',
			run: () => {
				if (editorRef) {
					setSelectedSurprise(editorRef, null);
				}
			}
		}
	];

	function collaborate(editor: LexicalEditor, cursorsContainer: HTMLElement): () => void {
		editorRef = editor;
		const provider = providerFor(session.awareness);
		const cursors = relabelledCursors(cursorLabel);
		const bound = bindEditor(editor, session.doc, provider, { cursors });
		const collaboration = registerCollaboration(editor, bound.binding, provider, {
			userId,
			cursors,
			cursorsContainer
		});
		if (scene) {
			setSceneViewer(editor, userId);
		}
		const only = onlyMenu
			? registerOnlyMenu(editor, onlyMenu, (found) => onMenuFound?.(found))
			: null;
		// A scene's excerpt leaves out anything hidden from anyone: both
		// partners' lists show the same header, so a surprise in it would not
		// be one.
		session.setExcerptSource(() =>
			scene
				? visibleText(editor, 'anyone')
				: editor.getEditorState().read(() => getRoot().getTextContent())
		);
		session.attach();
		boundEditor = editor;
		onEditor?.(editor);
		return () => {
			boundEditor = null;
			onEditor?.(null);
			only?.();
			collaboration.destroy();
			bound.destroy();
			editorRef = null;
		};
	}

	// Followed rather than read once: whether this viewer may write can
	// change while the page is open.
	$effect(() => {
		if (boundEditor) {
			setTickable(boundEditor, tickable);
		}
	});

	/**
	 * Replaces the body with an earlier version's, as one ordinary edit: it
	 * reaches everyone else live, and Ctrl+Z takes it back.
	 */
	export function replaceBody(body: RichTextDocument): void {
		const editor = editorRef;
		if (!editor) {
			return;
		}
		const shaped = toEditorDocument(body);
		editor.update(() => {
			const root = getRoot();
			root.clear();
			for (const child of shaped.root.children) {
				root.append(parseSerializedNode(child as unknown as SerializedLexicalNode));
			}
		});
	}
</script>

<RichTextEditor
	{collaborate}
	{readOnly}
	{placeholder}
	features={scene ? SCENE_FEATURES : DOCUMENT_FEATURES}
	toolbarActions={scene ? sceneActions : []}
	toolbar
	ariaLabel="Entry"
	editorClass="notebook-editor"
/>
{#if scene && boundEditor}
	<MenuItemExtras editor={boundEditor} />
	<MenuArtPicker editor={boundEditor} />
	{#if menuHref && !onlyMenu}
		<MenuLinkPopover editor={boundEditor} {menuHref} />
	{/if}
{/if}

