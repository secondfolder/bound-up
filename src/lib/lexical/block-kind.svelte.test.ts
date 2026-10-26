import {
	$createParagraphNode as createParagraphNode,
	$createTextNode as createTextNode,
	$getRoot as getRoot,
	$isElementNode as isElementNode,
	type LexicalEditor,
	type LexicalNode
} from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { toStoredDocument } from '$lib/lexical/document-shape';
import { exportEditorDocument } from '$lib/lexical/nodes';
import { $createMenuNode as createMenuNode } from '$lib/lexical/nodes/scene/menu';
import { $createMenuCourseNode as createMenuCourseNode } from '$lib/lexical/nodes/scene/menu-course';
import { $createMenuLineNode as createMenuLineNode } from '$lib/lexical/nodes/scene/menu-line';
import { parseRichTextDocument, type RichTextDocument } from '$lib/richtext';
import { createRichTextEditor, SCENE_FEATURES } from '$lib/richtext-editor';
import { defined } from '$lib/testing/defined';
import {
	$selectionBlockKind as selectionBlockKind,
	$setBlockKind as setBlockKind
} from './block-kind';

/**
 * Headings, subheadings and body text: one control for an ordinary line and
 * a line of a scene's menu. See docs/rich-text.md, "Headings".
 */

const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
});

function editorWith(make: () => LexicalNode[]): LexicalEditor {
	const root = document.createElement('div');
	root.contentEditable = 'true';
	document.body.append(root);
	const { editor, destroy } = createRichTextEditor({
		features: SCENE_FEATURES,
		namespace: 'block-kind-test',
		onError: (error) => {
			throw error;
		}
	});
	editor.setRootElement(root);
	editor.update(
		() => {
			getRoot()
				.clear()
				.append(...make());
		},
		{ discrete: true }
	);
	cleanups.push(() => {
		editor.setRootElement(null);
		destroy();
		root.remove();
	});
	return editor;
}

function stored(editor: LexicalEditor): RichTextDocument {
	return defined(
		parseRichTextDocument(JSON.stringify(toStoredDocument(exportEditorDocument(editor)))),
		'the stored document'
	);
}

function selectAll(editor: LexicalEditor, from = 0, to?: number) {
	editor.update(
		() => {
			getRoot().select(from, to ?? getRoot().getChildrenSize());
		},
		{ discrete: true }
	);
}

function setKind(editor: LexicalEditor, kind: 'heading' | 'subheading' | 'body') {
	editor.update(() => setBlockKind(kind), { discrete: true });
}

const line = (text: string) => createParagraphNode().append(createTextNode(text));

describe('ordinary lines', () => {
	it('become a heading, a subheading and body text again, keeping their words', () => {
		const editor = editorWith(() => [line('Saturday'), line('The plan')]);
		selectAll(editor, 0, 1);
		setKind(editor, 'heading');
		const [made] = stored(editor).root.children;
		expect(made).toMatchObject({ type: 'heading', tag: 'h2' });
		expect(editor.getEditorState().read(() => selectionBlockKind())).toBe('heading');

		setKind(editor, 'subheading');
		const [sub] = stored(editor).root.children;
		expect(sub).toMatchObject({ type: 'heading', tag: 'h3' });

		setKind(editor, 'body');
		const [first, second] = stored(editor).root.children;
		expect(first).toMatchObject({ type: 'paragraph', children: [{ text: 'Saturday' }] });
		expect(second).toMatchObject({ type: 'paragraph', children: [{ text: 'The plan' }] });
	});

	it('says nothing is common to a selection of different kinds', () => {
		const editor = editorWith(() => [line('Saturday'), line('The plan')]);
		selectAll(editor, 0, 1);
		setKind(editor, 'heading');
		selectAll(editor);
		expect(editor.getEditorState().read(() => selectionBlockKind())).toBeNull();
	});
});

describe('a menu’s lines', () => {
	/** In a menu, a heading is what starts a course. */
	it('change role, and a heading divides the menu into courses there', async () => {
		const editor = editorWith(() => [
			createMenuNode().append(
				createMenuCourseNode().append(
					createMenuLineNode('item').append(createTextNode('Massage')),
					createMenuLineNode('item').append(createTextNode('Mains')),
					createMenuLineNode('item').append(createTextNode('Rope'))
				)
			)
		]);
		editor.update(
			() => {
				const menu = getRoot().getFirstChild();
				const course = isElementNode(menu) ? menu.getFirstChild() : null;
				if (isElementNode(course)) {
					course.getChildAtIndex(1)?.selectStart();
				}
			},
			{ discrete: true }
		);
		setKind(editor, 'heading');
		await new Promise<void>((resolve) => {
			editor.update(() => undefined, { onUpdate: resolve });
		});
		const [menu] = stored(editor).root.children;
		const courses = menu?.type === 'scene-menu' ? menu.children : [];
		expect(courses.map((course) => course.children.map((each) => each.role))).toEqual([
			['item'],
			['heading', 'item']
		]);
	});
});

describe('typing', () => {
	it('makes `# ` a heading and `## ` a subheading, and no deeper', async () => {
		const editor = editorWith(() => [line('')]);
		const root = defined(editor.getRootElement(), 'the editor');
		await userEvent.click(root);
		await userEvent.keyboard('# Saturday');
		await new Promise<void>((resolve) => {
			editor.update(() => undefined, { onUpdate: resolve });
		});
		const [typed] = stored(editor).root.children;
		expect(typed).toMatchObject({
			type: 'heading',
			tag: 'h2',
			children: [{ text: 'Saturday' }]
		});

		await userEvent.keyboard('{Enter}## Before');
		await new Promise<void>((resolve) => {
			editor.update(() => undefined, { onUpdate: resolve });
		});
		const [, typedSub] = stored(editor).root.children;
		expect(typedSub).toMatchObject({ type: 'heading', tag: 'h3' });
	});
});
