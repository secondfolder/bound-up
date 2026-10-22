<script lang="ts">
	import {
		$getRoot as getRoot,
		type LexicalEditor,
		$parseSerializedNode as parseSerializedNode,
		type SerializedLexicalNode
	} from 'lexical';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import { toEditorDocument } from '$lib/lexical/document-shape';
	import {
		bindEditor,
		type CursorLabel,
		providerFor,
		registerCollaboration,
		relabelledCursors
	} from '$lib/notebook/collab';
	import type { NotebookSession } from '$lib/notebook/session.svelte';
	import type { RichTextDocument } from '$lib/richtext';
	import { DOCUMENT_FEATURES } from '$lib/richtext-editor';

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
		placeholder = 'Start writing…'
	}: {
		session: NotebookSession;
		userId: string;
		/** What another writer's caret says, decided on this device: see `relabelledCursors`. */
		cursorLabel: CursorLabel;
		readOnly: boolean;
		placeholder?: string;
	} = $props();

	let editorRef: LexicalEditor | null = null;

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
		session.setExcerptSource(() => editor.getEditorState().read(() => getRoot().getTextContent()));
		session.attach();
		return () => {
			collaboration.destroy();
			bound.destroy();
			editorRef = null;
		};
	}

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
	features={DOCUMENT_FEATURES}
	toolbar
	ariaLabel="Entry"
	editorClass="notebook-editor"
/>
