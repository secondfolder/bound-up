/**
 * Binding a Lexical editor to a Yjs document, the Svelte way.
 *
 * BROWSER ONLY (it is only ever loaded by the notebook's pages, which open
 * entries in the browser). `@lexical/yjs` ships the binding and the sync
 * functions; React's `CollaborationPlugin` is the only wiring it ships, so
 * this is that wiring written as plain functions with teardowns, the shape the
 * rest of this app's editor code has (see the "Svelte idioms" note in
 * AGENTS.md's spirit, and `richtext-editor.ts`). It follows
 * `useYjsCollaboration` in `@lexical/react` 0.51 closely; where it differs,
 * the comment says why.
 *
 * The transport is not here: a Yjs update leaves through `doc.on('update')`
 * and arrives through `applyUpdate`, both in `session.svelte.ts`, which
 * seals and opens them. This file only keeps the editor and the document in
 * step.
 */

import {
	type Binding,
	createUndoManager,
	createYjsBinding,
	type Provider,
	type SyncCursorPositionsFn,
	syncCursorPositions,
	syncLexicalUpdateToYjs,
	syncYjsChangesToLexical,
	type UserState
} from '@lexical/yjs';
import {
	BLUR_COMMAND,
	COMMAND_PRIORITY_EDITOR,
	$createParagraphNode as createParagraphNode,
	FOCUS_COMMAND,
	$getRoot as getRoot,
	type LexicalEditor,
	mergeRegister,
	REDO_COMMAND,
	SKIP_COLLAB_TAG,
	UNDO_COMMAND
} from 'lexical';
import { Awareness } from 'y-protocols/awareness';
import {
	type AbstractType,
	applyUpdate,
	Doc,
	encodeStateAsUpdate,
	type Transaction,
	UndoManager,
	type XmlText,
	type YEvent
} from 'yjs';
import { toStoredDocument } from '$lib/lexical/document-shape';
import { exportEditorDocument } from '$lib/lexical/nodes';
import { parseRichTextDocument, type RichTextDocument } from '$lib/richtext';
import { createRichTextEditor, DOCUMENT_FEATURES } from '$lib/richtext-editor';

/** The shared type the editor's body lives in. `@lexical/yjs`'s default. */
export const BODY_FIELD = 'root';
/** The shared type the title lives in: plain text, merged like the body. */
export const TITLE_FIELD = 'title';

/**
 * The origin every edit that arrived from elsewhere is applied with.
 *
 * What tells the session not to send an edit back out: anything the doc
 * reports with this origin came from the server, and anything else was made
 * here (by the editor's binding, the title field, or the undo manager).
 */
export const REMOTE_ORIGIN = 'notebook-remote';

/**
 * What `@lexical/yjs` calls a provider: an awareness, and hooks for a
 * connection it would otherwise manage. The session manages the connection,
 * so the hooks are no-ops; only the awareness is real.
 */
export function providerFor(awareness: Awareness): Provider {
	const nothing = () => undefined;
	return {
		awareness: awareness as unknown as Provider['awareness'],
		connect: nothing,
		disconnect: nothing,
		on: nothing,
		off: nothing
	};
}

/** What a remote writer's caret is labelled with, decided on this device. */
export type CursorLabel = (userId: string | null) => { name: string; color: string };

/**
 * `syncCursorPositions`, with every remote cursor's name and colour replaced
 * by what this device decides.
 *
 * The awareness state other devices send carries no name at all, only a user
 * id inside `awarenessData`. A partnership's names are sealed and which one
 * is "theirs" flips with who is looking (AGENTS.md invariant 12), so the
 * label has to be worked out here, by `partnerName()`, never sent.
 */
export function relabelledCursors(label: CursorLabel): SyncCursorPositionsFn {
	return (binding, provider, options) =>
		syncCursorPositions(binding, provider, {
			...options,
			getAwarenessStates: () =>
				relabelStates(provider.awareness.getStates() as Map<number, UserState>, label)
		});
}

/** Every state with its name and colour replaced by `label`'s, from its user id alone. */
export function relabelStates(
	states: Map<number, UserState>,
	label: CursorLabel
): Map<number, UserState> {
	return new Map(
		[...states].map(([clientId, state]) => {
			const data = state.awarenessData as { userId?: unknown } | undefined;
			const userId = typeof data?.userId === 'string' ? data.userId : null;
			return [clientId, { ...state, ...label(userId) }];
		})
	);
}

/**
 * Keeps `editor` and `doc` in step, both ways, and returns the teardown.
 *
 * **Bind before the document has content.** `@lexical/yjs`'s first binding
 * format learns a document only from the changes it observes, so a document
 * filled before this is called would stay invisible in the editor, and the
 * first keystroke would then write an empty editor's idea of the document
 * over it. The session therefore holds what it fetched until `attach`.
 */
export function bindEditor(
	editor: LexicalEditor,
	doc: Doc,
	provider: Provider,
	options: { cursors?: SyncCursorPositionsFn } = {}
): { binding: Binding; destroy: () => void } {
	const binding = createYjsBinding({
		editor,
		id: BODY_FIELD,
		doc,
		docMap: new Map([[BODY_FIELD, doc]])
	});
	const cursors = options.cursors ?? syncCursorPositions;
	const shared = binding.root.getSharedType();

	const onYjsChanges = (events: YEvent<XmlText>[], transaction: Transaction) => {
		if (transaction.origin !== binding) {
			syncYjsChangesToLexical(
				binding,
				provider,
				events,
				transaction.origin instanceof UndoManager,
				cursors
			);
		}
	};
	shared.observeDeep(
		onYjsChanges as (events: YEvent<AbstractType<unknown>>[], t: Transaction) => void
	);

	const offUpdate = editor.registerUpdateListener(
		({ prevEditorState, editorState, dirtyLeaves, dirtyElements, normalizedNodes, tags }) => {
			if (!tags.has(SKIP_COLLAB_TAG)) {
				syncLexicalUpdateToYjs(
					binding,
					provider,
					prevEditorState,
					editorState,
					dirtyElements,
					dirtyLeaves,
					normalizedNodes,
					tags
				);
			}
		}
	);

	return {
		binding,
		destroy: () => {
			shared.unobserveDeep(
				onYjsChanges as (events: YEvent<AbstractType<unknown>>[], t: Transaction) => void
			);
			offUpdate();
		}
	};
}

/**
 * Remote cursors, focus and undo for an editor already bound.
 *
 * Undo is Yjs's own (`createUndoManager`), which undoes only this writer's
 * edits; `createRichTextEditor` is built with `history: false` so Lexical's
 * does not fight it. Focus tells the others whether to draw this writer's
 * caret at all.
 */
export function registerCollaboration(
	editor: LexicalEditor,
	binding: Binding,
	provider: Provider,
	options: {
		userId: string;
		cursors: SyncCursorPositionsFn;
		/** The element remote carets are drawn into; positioned over the editor. */
		cursorsContainer: HTMLElement;
	}
): { undoManager: UndoManager; destroy: () => void } {
	binding.cursorsContainer = options.cursorsContainer;
	const { awareness } = provider;
	const root = editor.getRootElement();
	// No name and no colour: the other side labels this caret itself; see
	// `relabelledCursors`.
	const state = (focusing: boolean): UserState => ({
		anchorPos: null,
		focusPos: null,
		name: '',
		color: '',
		focusing,
		awarenessData: { userId: options.userId }
	});
	awareness.setLocalState(state(root !== null && document.activeElement === root));

	const onAwareness = () => options.cursors(binding, provider);
	awareness.on('update', onAwareness);

	const setFocus = (focusing: boolean) => {
		const current = awareness.getLocalState();
		awareness.setLocalState({ ...(current ?? state(focusing)), focusing });
	};

	const undoManager = createUndoManager(binding, binding.root.getSharedType());

	const offCommands = mergeRegister(
		editor.registerCommand(
			FOCUS_COMMAND,
			() => {
				setFocus(true);
				return false;
			},
			COMMAND_PRIORITY_EDITOR
		),
		editor.registerCommand(
			BLUR_COMMAND,
			() => {
				setFocus(false);
				return false;
			},
			COMMAND_PRIORITY_EDITOR
		),
		editor.registerCommand(
			UNDO_COMMAND,
			() => {
				undoManager.undo();
				return true;
			},
			COMMAND_PRIORITY_EDITOR
		),
		editor.registerCommand(
			REDO_COMMAND,
			() => {
				undoManager.redo();
				return true;
			},
			COMMAND_PRIORITY_EDITOR
		)
	);

	return {
		undoManager,
		destroy: () => {
			offCommands();
			awareness.off('update', onAwareness);
			undoManager.destroy();
			binding.cursorsContainer = null;
		}
	};
}

/** Resolves once every update queued on `editor` so far has committed. */
function committed(editor: LexicalEditor): Promise<void> {
	return new Promise((resolve) => {
		editor.update(
			() => {
				// Nothing: this update only exists to be committed after the rest.
			},
			{ onUpdate: resolve }
		);
	});
}

/** A throwaway editor and document, bound, with no page in sight. */
async function headless<T>(use: (editor: LexicalEditor, doc: Doc) => Promise<T> | T): Promise<T> {
	const { editor, destroy } = createRichTextEditor({
		features: DOCUMENT_FEATURES,
		namespace: 'bound-up-notebook-headless',
		history: false
	});
	const doc = new Doc();
	const awareness = new Awareness(doc);
	const bound = bindEditor(editor, doc, providerFor(awareness));
	try {
		return await use(editor, doc);
	} finally {
		bound.destroy();
		awareness.destroy();
		destroy();
		doc.destroy();
	}
}

/**
 * The first edit of a new entry: one empty paragraph.
 *
 * An editor bound to an empty document has to give it a root paragraph, and
 * if two devices opened a new entry at once, each would add its own. So the
 * device that creates an entry writes this first edit, alongside the entry
 * itself, and nobody ever opens a document without one. See
 * docs/notebook.md, "Bootstrapping".
 */
export function firstEdit(): Promise<Uint8Array> {
	return headless(async (editor, doc) => {
		editor.update(() => {
			getRoot().clear().append(createParagraphNode());
		});
		await committed(editor);
		// Created so every device agrees on it, though it starts empty.
		doc.getText(TITLE_FIELD);
		return encodeStateAsUpdate(doc);
	});
}

/**
 * What a document state says: its title, and its body as the stored rich
 * text document `RichText.svelte` renders. For previewing a version without
 * touching the live editor, and for the list's excerpt.
 */
export function readDocument(
	state: Uint8Array
): Promise<{ title: string; body: RichTextDocument | null }> {
	return headless(async (editor, doc) => {
		applyUpdate(doc, state, REMOTE_ORIGIN);
		await committed(editor);
		const stored = toStoredDocument(exportEditorDocument(editor));
		return {
			title: doc.getText(TITLE_FIELD).toString(),
			body: parseRichTextDocument(JSON.stringify(stored))
		};
	});
}
