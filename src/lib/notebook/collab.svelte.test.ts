import { $createLinkNode as createLinkNode } from '@lexical/link';
import {
	$createParagraphNode as createParagraphNode,
	$createTextNode as createTextNode,
	$getRoot as getRoot,
	type LexicalEditor,
	UNDO_COMMAND
} from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import { applyUpdate, Doc, encodeStateAsUpdate } from 'yjs';
import { toStoredDocument } from '$lib/lexical/document-shape';
import { exportEditorDocument } from '$lib/lexical/nodes';
import { documentToPlainText, FORMAT_BOLD, parseRichTextDocument } from '$lib/richtext';
import { createRichTextEditor, DOCUMENT_FEATURES } from '$lib/richtext-editor';
import { defined } from '$lib/testing/defined';
import {
	bindEditor,
	firstEdit,
	providerFor,
	REMOTE_ORIGIN,
	readDocument,
	registerCollaboration,
	relabelledCursors,
	relabelStates,
	TITLE_FIELD
} from './collab';

/**
 * Two editors on two documents, wired to each other the way the room wires
 * two pages: every local update applied to the other doc as a remote one.
 * What is under test is that the binding keeps each editor and its document
 * in step, so what one writer types the other sees, and concurrent edits
 * converge. The transport and the sealing are the session's, tested on
 * their own and end to end.
 */

type Side = {
	editor: LexicalEditor;
	doc: Doc;
	awareness: Awareness;
	root: HTMLElement;
	undo: () => void;
	destroy: () => void;
};

const sides: Side[] = [];

afterEach(() => {
	for (const each of sides.splice(0)) {
		each.destroy();
	}
});

/** Resolves once every update queued on `editor` has committed. */
function settled(editor: LexicalEditor): Promise<void> {
	return new Promise((resolve) => {
		editor.update(
			() => {
				// Only here to be committed after the rest.
			},
			{ onUpdate: resolve }
		);
	});
}

function side(userId: string): Side {
	const root = document.createElement('div');
	root.contentEditable = 'true';
	document.body.append(root);
	const cursorsContainer = document.createElement('div');
	document.body.append(cursorsContainer);
	const { editor, destroy } = createRichTextEditor({
		features: DOCUMENT_FEATURES,
		namespace: `test-${userId}`,
		history: false
	});
	editor.setRootElement(root);
	const doc = new Doc();
	const awareness = new Awareness(doc);
	const provider = providerFor(awareness);
	const cursors = relabelledCursors(() => ({ name: 'them', color: 'red' }));
	const bound = bindEditor(editor, doc, provider, { cursors });
	const collaboration = registerCollaboration(editor, bound.binding, provider, {
		userId,
		cursors,
		cursorsContainer
	});
	const created: Side = {
		editor,
		doc,
		awareness,
		root,
		undo: () => editor.dispatchCommand(UNDO_COMMAND, undefined),
		destroy: () => {
			collaboration.destroy();
			bound.destroy();
			awareness.destroy();
			editor.setRootElement(null);
			destroy();
			root.remove();
			cursorsContainer.remove();
		}
	};
	sides.push(created);
	return created;
}

/** Relays every local update from each side to the other, as the room would. */
function connect(a: Side, b: Side) {
	for (const [from, to] of [
		[a, b],
		[b, a]
	] as const) {
		from.doc.on('update', (update: Uint8Array, origin: unknown) => {
			if (origin !== REMOTE_ORIGIN) {
				applyUpdate(to.doc, update, REMOTE_ORIGIN);
			}
		});
	}
}

function text(editor: LexicalEditor): string {
	return editor.getEditorState().read(() => getRoot().getTextContent());
}

function stored(editor: LexicalEditor) {
	return defined(
		parseRichTextDocument(JSON.stringify(toStoredDocument(exportEditorDocument(editor)))),
		'the stored document'
	);
}

async function startFrom(...targets: Side[]) {
	const first = await firstEdit();
	for (const target of targets) {
		applyUpdate(target.doc, first, REMOTE_ORIGIN);
		await settled(target.editor);
	}
}

function append(editor: LexicalEditor, words: string) {
	editor.update(
		() => {
			const paragraph = getRoot().getLastChild();
			if (paragraph && 'append' in paragraph) {
				(paragraph as unknown as { append: (node: unknown) => void }).append(createTextNode(words));
			}
		},
		{ discrete: true }
	);
}

describe('firstEdit', () => {
	it('gives a new document exactly one empty paragraph', async () => {
		const ada = side('ada');
		await startFrom(ada);
		expect(ada.editor.getEditorState().read(() => getRoot().getChildrenSize())).toBe(1);
		expect(text(ada.editor)).toBe('');
	});
});

describe('two writers', () => {
	it('see each other’s typing', async () => {
		const ada = side('ada');
		const bo = side('bo');
		connect(ada, bo);
		await startFrom(ada, bo);

		append(ada.editor, 'Dinner was lovely.');
		await settled(bo.editor);

		expect(text(bo.editor)).toBe('Dinner was lovely.');
	});

	it('converge when both type at once', async () => {
		const ada = side('ada');
		const bo = side('bo');
		await startFrom(ada, bo);

		// Typed before either hears of the other's, as two people do.
		append(ada.editor, 'Ada here. ');
		append(bo.editor, 'Bo here.');
		applyUpdate(bo.doc, encodeStateAsUpdate(ada.doc), REMOTE_ORIGIN);
		applyUpdate(ada.doc, encodeStateAsUpdate(bo.doc), REMOTE_ORIGIN);
		await settled(ada.editor);
		await settled(bo.editor);

		expect(text(ada.editor)).toBe(text(bo.editor));
		expect(text(ada.editor)).toContain('Ada here.');
		expect(text(ada.editor)).toContain('Bo here.');
	});

	it('carry formatting and links across', async () => {
		const ada = side('ada');
		const bo = side('bo');
		connect(ada, bo);
		await startFrom(ada, bo);

		ada.editor.update(
			() => {
				const paragraph = createParagraphNode();
				paragraph.append(createTextNode('bold').toggleFormat('bold'));
				const link = createLinkNode('https://example.com');
				link.append(createTextNode('a link'));
				paragraph.append(link);
				getRoot().clear().append(paragraph);
			},
			{ discrete: true }
		);
		await settled(bo.editor);

		const [paragraph] = stored(bo.editor).root.children;
		expect(paragraph).toMatchObject({
			type: 'paragraph',
			children: [
				{ type: 'text', text: 'bold', format: FORMAT_BOLD },
				{ type: 'link', url: 'https://example.com' }
			]
		});
	});

	/** Undo is the document's: it takes back your own typing, never your partner's. */
	it('undo only what they wrote themselves', async () => {
		const ada = side('ada');
		const bo = side('bo');
		connect(ada, bo);
		await startFrom(ada, bo);

		append(bo.editor, 'Bo’s line. ');
		await settled(ada.editor);
		append(ada.editor, 'Ada’s line.');
		await settled(bo.editor);

		ada.undo();
		await settled(ada.editor);
		await settled(bo.editor);

		expect(text(ada.editor)).toBe('Bo’s line. ');
		expect(text(bo.editor)).toBe('Bo’s line. ');
	});
});

describe('readDocument', () => {
	it('reads a document’s title and body without a page', async () => {
		const ada = side('ada');
		await startFrom(ada);
		append(ada.editor, 'What we agreed.');
		await settled(ada.editor);
		ada.doc.getText(TITLE_FIELD).insert(0, 'Our rules');

		const read = await readDocument(encodeStateAsUpdate(ada.doc));

		expect(read.title).toBe('Our rules');
		expect(documentToPlainText(defined(read.body, 'the body'))).toBe('What we agreed.');
	});
});

describe('relabelStates', () => {
	/** The label is decided here, never sent: whatever name arrives is ignored. */
	it('names a remote writer from this device, not from what they sent', () => {
		const forged = {
			anchorPos: null,
			focusPos: null,
			focusing: true,
			name: 'Somebody else entirely',
			color: 'hotpink',
			awarenessData: { userId: 'bo' }
		};
		const nameless = { ...forged, awarenessData: {} };
		const relabelled = relabelStates(
			new Map([
				[1, forged],
				[2, nameless]
			]),
			(userId) => ({ name: `local:${userId}`, color: 'blue' })
		);
		expect(relabelled.get(1)).toMatchObject({ name: 'local:bo', color: 'blue', focusing: true });
		expect(relabelled.get(2)).toMatchObject({ name: 'local:null' });
	});
});
