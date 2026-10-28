import { $createHeadingNode as createHeadingNode } from '@lexical/rich-text';
import {
	$createParagraphNode as createParagraphNode,
	$createTextNode as createTextNode,
	$getRoot as getRoot,
	$getSelection as getSelection,
	INSERT_PARAGRAPH_COMMAND,
	$isElementNode as isElementNode,
	$isRangeSelection as isRangeSelection,
	KEY_BACKSPACE_COMMAND,
	type LexicalEditor,
	type LexicalNode
} from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Awareness } from 'y-protocols/awareness';
import { applyUpdate, Doc, encodeStateAsUpdate } from 'yjs';
import { toStoredDocument } from '$lib/lexical/document-shape';
import { exportEditorDocument } from '$lib/lexical/nodes';
import {
	$createMenuNode as createMenuNode,
	$isMenuNode as isMenuNode,
	MENU_LINK_EVENT,
	type MenuLinkRequest
} from '$lib/lexical/nodes/scene/menu';
import {
	$createMenuCourseNode as createMenuCourseNode,
	MENU_ART_EVENT,
	type MenuArtRequest
} from '$lib/lexical/nodes/scene/menu-course';
import {
	$createMenuLineNode as createMenuLineNode,
	$isMenuLineNode as isMenuLineNode,
	MENU_EXTRA_EVENT,
	type MenuExtraRequest
} from '$lib/lexical/nodes/scene/menu-line';
import { $createSceneSectionNode as createSceneSectionNode } from '$lib/lexical/nodes/scene/section';
import { setSceneViewer, setTickable } from '$lib/lexical/nodes/scene/viewer';
import {
	bindEditor,
	firstEdit,
	providerFor,
	REMOTE_ORIGIN,
	registerCollaboration,
	relabelledCursors
} from '$lib/notebook/collab';
import {
	documentToPlainText,
	parseRichTextDocument,
	type RichTextDocument,
	type RichTextMenuLineNode
} from '$lib/richtext';
import { createRichTextEditor, SCENE_FEATURES } from '$lib/richtext-editor';
import { DEFAULT_COURSES } from '$lib/scenes/blocks';
import type { MenuDesignId } from '$lib/scenes/menu-designs';
import { defined } from '$lib/testing/defined';
import {
	addMenuItem,
	addStoryStarter,
	addToSection,
	blockAtCaret,
	blockToText,
	$canMakeMenu as canMakeMenu,
	insertMenu,
	insertMenuFrom,
	registerOnlyMenu,
	selectionToMenu,
	setCourseArt,
	setDesign,
	setHidden,
	setItemProps,
	setLineRole,
	setMenuExtras,
	setMenuHeading,
	setMenuMascot,
	setMenuPicture,
	setSelectedChecklist,
	setSelectedSurprise,
	setStoryLine,
	storyValues,
	visibleText
} from './scene-blocks';

/**
 * The scene blocks in a real editor: what each edit makes, the keys inside
 * a block, a surprise nobody can delete, and two people typing in one menu.
 * See docs/scenes.md, "Blocks".
 */

const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
});

function sceneEditor(viewerId: string | null = 'ada'): LexicalEditor {
	const root = document.createElement('div');
	root.contentEditable = 'true';
	document.body.append(root);
	const { editor, destroy } = createRichTextEditor({
		features: SCENE_FEATURES,
		namespace: 'scene-test',
		onError: (error) => {
			throw error;
		}
	});
	editor.setRootElement(root);
	setSceneViewer(editor, viewerId);
	editor.update(
		() => {
			getRoot().clear().append(createParagraphNode());
			getRoot().selectEnd();
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

function stored(editor: LexicalEditor): RichTextDocument {
	return defined(
		parseRichTextDocument(JSON.stringify(toStoredDocument(exportEditorDocument(editor)))),
		'the stored document'
	);
}

function build(editor: LexicalEditor, make: () => LexicalNode[]) {
	editor.update(
		() => {
			getRoot()
				.clear()
				.append(...make());
		},
		{ discrete: true }
	);
}

/** A course's lines as [role, words], to compare. */
function linesOf(lines: RichTextMenuLineNode[]): [string, string][] {
	return lines.map((line) => [
		line.role,
		line.children.map((child) => (child.type === 'text' ? child.text : '')).join('')
	]);
}

/** Every line of a stored menu, across its courses. */
function allLines(block: RichTextDocument['root']['children'][number] | undefined) {
	return block?.type === 'scene-menu' ? block.children.flatMap((course) => course.children) : [];
}

/** A text node as Lexical serialises it, for a document loaded straight into the editor. */
function serialisedText(value: string) {
	return { type: 'text', text: value, format: 0, detail: 0, mode: 'normal', style: '', version: 1 };
}

function lineOf(text: string) {
	return createParagraphNode().append(createTextNode(text));
}

describe('a menu', () => {
	it('starts with the courses, each with an item, and the caret in the first', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const [menu] = stored(editor).root.children;
		expect(menu).toMatchObject({ type: 'scene-menu', title: '', subtitle: '', hiddenFrom: null });
		const courses = menu?.type === 'scene-menu' ? menu.children : [];
		expect(courses.map((course) => linesOf(course.children))).toEqual([
			[
				['heading', 'Starters'],
				['item', '']
			],
			[
				['heading', 'Mains'],
				['item', '']
			],
			[
				['heading', 'Dessert'],
				['item', '']
			],
			[
				['heading', 'Aftercare'],
				['item', '']
			]
		]);
		expect(blockAtCaret(editor)).toMatchObject({ kind: 'menu', line: { role: 'item' } });
	});

	it('takes an item into the line the caret is on, details and all', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		addMenuItem(editor, 'Spanking', { kinkId: 'spanking', rating: 2 });
		await settled(editor);
		const at = blockAtCaret(editor);
		expect(at).toMatchObject({
			kind: 'menu',
			line: { role: 'item', props: { kinkId: 'spanking', rating: 2 } }
		});
		expect(documentToPlainText(stored(editor))).toContain('Spanking');
	});

	it('is made from selected lines and turned back into text without losing anything', async () => {
		const editor = sceneEditor();
		build(editor, () => [lineOf('Massage'), lineOf('Blindfold')]);
		editor.update(
			() => {
				getRoot().select(0, getRoot().getChildrenSize());
			},
			{ discrete: true }
		);
		selectionToMenu(editor);
		await settled(editor);
		const menuKey = editor.getEditorState().read(() => {
			const menu = getRoot().getFirstChild();
			return isMenuNode(menu) ? menu.getKey() : '';
		});
		const [made] = stored(editor).root.children;
		expect(made?.type).toBe('scene-menu');

		const itemKey = editor.getEditorState().read(() => {
			const menu = getRoot().getFirstChild();
			const course = isElementNode(menu) ? menu.getLastChild() : null;
			return isElementNode(course) ? (course.getLastChild()?.getKey() ?? '') : '';
		});
		setMenuExtras(editor, menuKey, { scale: 'Intensity', value: 'Price' });
		setItemProps(editor, itemKey, { rating: 3, value: 12 });
		await settled(editor);
		blockToText(editor, menuKey);
		await settled(editor);

		const text = documentToPlainText(stored(editor));
		expect(text).toContain('Massage');
		expect(text).toContain('Blindfold (Intensity 3/5, Price 12)');
		expect(stored(editor).root.children.some((block) => block.type === 'scene-menu')).toBe(false);
	});

	/** A menu's courses are where its headings are: each runs to the next heading. */
	it('divides selected lines into courses at their headings, and gives the headings back', async () => {
		const editor = sceneEditor();
		build(editor, () => [
			lineOf('Kissing'),
			createHeadingNode('h2').append(createTextNode('Mains')),
			lineOf('Rope'),
			createHeadingNode('h3').append(createTextNode('If there’s time')),
			lineOf('Wax'),
			createHeadingNode('h2').append(createTextNode('Afterwards')),
			lineOf('Tea')
		]);
		editor.update(
			() => {
				getRoot().select(0, getRoot().getChildrenSize());
			},
			{ discrete: true }
		);
		selectionToMenu(editor);
		await settled(editor);
		const [menu] = stored(editor).root.children;
		const courses = menu?.type === 'scene-menu' ? menu.children : [];
		expect(courses.map((course) => linesOf(course.children))).toEqual([
			[['item', 'Kissing']],
			[
				['heading', 'Mains'],
				['item', 'Rope'],
				['subheading', 'If there’s time'],
				['item', 'Wax']
			],
			[
				['heading', 'Afterwards'],
				['item', 'Tea']
			]
		]);

		const menuKey = editor.getEditorState().read(() => getRoot().getFirstChild()?.getKey() ?? '');
		blockToText(editor, menuKey);
		await settled(editor);
		expect(
			stored(editor).root.children.map((block) =>
				block.type === 'heading' ? `${block.tag}` : block.type
			)
		).toEqual(['list', 'h2', 'list', 'h3', 'list', 'h2', 'list']);
	});

	/** "Make a menu" leaves lines already in a menu as they are, so it is not offered over one. */
	it('is offered over plain lines, and not over a selection that reaches into a menu', () => {
		const editor = sceneEditor();
		build(editor, () => [
			lineOf('Massage'),
			createMenuNode().append(
				createMenuCourseNode().append(createMenuLineNode('item').append(createTextNode('Rope')))
			)
		]);
		const offeredOver = (count: number) => {
			editor.update(
				() => {
					getRoot().select(0, count);
				},
				{ discrete: true }
			);
			return editor.getEditorState().read(() => canMakeMenu());
		};
		expect(offeredOver(1)).toBe(true);
		expect(offeredOver(2)).toBe(false);
	});

	it('keeps courses of lines in it, whatever is pasted in', async () => {
		const editor = sceneEditor();
		build(editor, () => [
			createMenuNode().append(
				createMenuLineNode('item').append(createTextNode('Loose')),
				lineOf('Pasted'),
				createMenuLineNode('heading').append(createTextNode('Mains')),
				createMenuLineNode('item').append(createTextNode('Rope'))
			)
		]);
		await settled(editor);
		const [menu] = stored(editor).root.children;
		const courses = menu?.type === 'scene-menu' ? menu.children : [];
		expect(courses.map((course) => linesOf(course.children))).toEqual([
			[
				['item', 'Loose'],
				['item', 'Pasted']
			],
			[
				['heading', 'Mains'],
				['item', 'Rope']
			]
		]);
	});

	/** A line made a heading in the middle of a course starts a new course there. */
	it('starts a new course at a heading made mid-course', async () => {
		const editor = sceneEditor();
		build(editor, () => [
			createMenuNode().append(
				createMenuCourseNode().append(
					createMenuLineNode('heading').append(createTextNode('Mains')),
					createMenuLineNode('item').append(createTextNode('Rope')),
					createMenuLineNode('item').append(createTextNode('Dessert')),
					createMenuLineNode('item').append(createTextNode('Ice cream'))
				)
			)
		]);
		const key = editor.getEditorState().read(() => {
			const menu = getRoot().getFirstChild();
			const course = isElementNode(menu) ? menu.getFirstChild() : null;
			return isElementNode(course) ? (course.getChildAtIndex(2)?.getKey() ?? '') : '';
		});
		setLineRole(editor, key, 'heading');
		await settled(editor);
		const [menu] = stored(editor).root.children;
		const courses = menu?.type === 'scene-menu' ? menu.children : [];
		expect(courses.map((course) => linesOf(course.children))).toEqual([
			[
				['heading', 'Mains'],
				['item', 'Rope']
			],
			[
				['heading', 'Dessert'],
				['item', 'Ice cream']
			]
		]);
	});

	it('keeps its design, and writes a number the design’s way when turned back into text', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const menuKey = editor.getEditorState().read(() => getRoot().getFirstChild()?.getKey() ?? '');
		setDesign(editor, menuKey, 'facts');
		setMenuExtras(editor, menuKey, { value: 'Of tonight’s limit' });
		addMenuItem(editor, 'Kisses', { value: 20 });
		await settled(editor);
		const [menu] = stored(editor).root.children;
		expect(menu).toMatchObject({ type: 'scene-menu', design: 'facts' });
		const element = editor.getRootElement()?.querySelector('.scene-menu');
		expect(element?.classList.contains('design-facts')).toBe(true);
		blockToText(editor, menuKey);
		await settled(editor);
		expect(documentToPlainText(stored(editor))).toContain('Kisses (Of tonight’s limit 20%)');
	});
});

describe('a menu’s ratings and numbers', () => {
	/** The menu's key, and the first item's element. */
	function firstMenu(editor: LexicalEditor) {
		const menuKey = editor.getEditorState().read(() => getRoot().getFirstChild()?.getKey() ?? '');
		const item = (): HTMLElement =>
			defined(
				editor.getRootElement()?.querySelector<HTMLElement>('.scene-menu-line.item'),
				'an item'
			);
		return { menuKey, item };
	}

	it('shows none until the menu has them, then the whole scale on every item', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const { menuKey, item } = firstMenu(editor);
		// The extras' buttons only: a hidden to-do box is a button too.
		expect(item().querySelectorAll('.menu-line-extras button')).toHaveLength(0);

		setMenuExtras(editor, menuKey, { scale: 'Intensity', value: 'Price' });
		await settled(editor);
		expect(item().querySelectorAll('button.menu-rates > .menu-rate')).toHaveLength(5);
		expect(item().querySelector('button.menu-value')?.textContent).toBe('–');
		expect(editor.getRootElement()?.querySelector('.menu-key')?.textContent).toContain('Intensity');

		setMenuExtras(editor, menuKey, { scale: null, value: null });
		await settled(editor);
		expect(item().querySelectorAll('.menu-line-extras button')).toHaveLength(0);
	});

	it('asks the page for a rating when one is tapped, from a button that outlives the change', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const { menuKey, item } = firstMenu(editor);
		setMenuExtras(editor, menuKey, { scale: 'Heat' });
		await settled(editor);

		const asked: MenuExtraRequest[] = [];
		editor.getRootElement()?.addEventListener(MENU_EXTRA_EVENT, (event) => {
			asked.push((event as CustomEvent<MenuExtraRequest>).detail);
		});
		const button = defined(item().querySelector<HTMLElement>('button.menu-rates'), 'the rating');
		button.click();
		expect(asked).toMatchObject([{ extra: 'rating', rating: null, label: 'Heat' }]);

		setItemProps(editor, defined(asked[0], 'a request').key, { rating: 3 });
		await settled(editor);
		expect(item().dataset.rating).toBe('3');
		expect(item().querySelectorAll('.menu-rate.on')).toHaveLength(3);
		const [menu] = stored(editor).root.children;
		expect(allLines(menu)[1]).toMatchObject({ rating: 3 });
		// The question stays pointing at it as the rating changes under it.
		expect(item().querySelector('button.menu-rates')).toBe(button);
	});

	it('asks the page for a number when one is tapped, and writes it the design’s way', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const { menuKey, item } = firstMenu(editor);
		setDesign(editor, menuKey, 'facts');
		setMenuExtras(editor, menuKey, { value: 'Of tonight’s limit' });
		await settled(editor);

		const asked: MenuExtraRequest[] = [];
		editor.getRootElement()?.addEventListener(MENU_EXTRA_EVENT, (event) => {
			asked.push((event as CustomEvent<MenuExtraRequest>).detail);
		});
		item().querySelector<HTMLElement>('button.menu-value')?.click();
		expect(asked).toMatchObject([{ extra: 'value', value: null, label: 'Of tonight’s limit' }]);

		setItemProps(editor, defined(asked[0], 'a request').key, { value: 40 });
		await settled(editor);
		expect(item().querySelector('.menu-value')?.textContent).toBe('40%');
	});

	it('makes only the selected items a surprise from the toolbar', async () => {
		const editor = sceneEditor();
		insertMenuFrom(editor, [{ name: 'Starters', items: ['Massage', 'Blindfold'] }]);
		await settled(editor);
		editor.update(
			() => {
				const blindfold = getRoot()
					.getAllTextNodes()
					.find((text) => text.getTextContent() === 'Blindfold');
				// From the very end of the line before, as a triple-click selects.
				const massage = getRoot()
					.getAllTextNodes()
					.find((text) => text.getTextContent() === 'Massage');
				defined(massage, 'massage').select(7, 7);
				const selection = getSelection();
				if (isRangeSelection(selection) && blindfold) {
					selection.focus.set(blindfold.getKey(), 9, 'text');
				}
			},
			{ discrete: true }
		);
		setSelectedSurprise(editor, 'bo');
		await settled(editor);
		const [menu] = stored(editor).root.children;
		const items = allLines(menu).filter((line) => line.role === 'item');
		expect(items.map((line) => line.hiddenFrom)).toEqual([null, 'bo']);
	});
});

describe('a menu’s to-do items', () => {
	/** Puts the caret at `offset` in the line whose words are `words`. */
	function caretIn(editor: LexicalEditor, words: string, offset: number) {
		editor.update(
			() => {
				const text = getRoot()
					.getAllTextNodes()
					.find((node) => node.getTextContent() === words);
				defined(text, words).select(offset, offset);
			},
			{ discrete: true }
		);
	}

	/** Every item of the page's first menu as [words, checked]. */
	function items(editor: LexicalEditor): [string, boolean | null][] {
		const [menu] = stored(editor).root.children;
		return allLines(menu)
			.filter((line) => line.role === 'item')
			.map((line) => [linesOf([line])[0]?.[1] ?? '', line.checked]);
	}

	function boxOf(editor: LexicalEditor, words: string): HTMLElement {
		const line = [...(editor.getRootElement()?.querySelectorAll('.scene-menu-line') ?? [])].find(
			(each) => each.querySelector('.menu-line-words')?.textContent === words
		);
		return defined(line?.querySelector<HTMLElement>('.menu-line-check'), `the box of ${words}`);
	}

	it('makes an item a to-do from `[ ] ` or `[x] ` typed at its start, and the next one too', async () => {
		const editor = sceneEditor();
		insertMenuFrom(editor, [{ name: 'Starters', items: ['Massage'] }]);
		await settled(editor);
		caretIn(editor, 'Massage', 7);
		editor.focus();
		// `[` opens a key name in `keyboard`'s syntax, and `[[` is a bracket.
		await userEvent.keyboard('{Enter}[[x] Blindfold{Enter}Ice');
		await settled(editor);
		expect(items(editor)).toEqual([
			['Massage', null],
			['Blindfold', true],
			['Ice', false]
		]);
		expect(boxOf(editor, 'Blindfold').getAttribute('aria-checked')).toBe('true');
		expect(boxOf(editor, 'Massage').hidden).toBe(true);
	});

	it('leaves a line that merely starts with brackets alone', async () => {
		const editor = sceneEditor();
		insertMenuFrom(editor, [{ name: 'Starters', items: ['[ ] pasted'] }]);
		await settled(editor);
		expect(items(editor)).toEqual([['[ ] pasted', null]]);
	});

	it('makes the selected items to-dos from the toolbar, and back', async () => {
		const editor = sceneEditor();
		insertMenuFrom(editor, [{ name: 'Starters', items: ['Massage', 'Blindfold'] }]);
		await settled(editor);
		caretIn(editor, 'Blindfold', 2);
		setSelectedChecklist(editor, true);
		await settled(editor);
		expect(items(editor)).toEqual([
			['Massage', null],
			['Blindfold', false]
		]);
		setSelectedChecklist(editor, false);
		await settled(editor);
		expect(items(editor)).toEqual([
			['Massage', null],
			['Blindfold', null]
		]);
	});

	it('ticks from its box, and not in a scene that cannot be edited', async () => {
		const editor = sceneEditor();
		insertMenuFrom(editor, [{ name: 'Starters', items: ['Massage'] }]);
		await settled(editor);
		caretIn(editor, 'Massage', 0);
		setSelectedChecklist(editor, true);
		await settled(editor);

		boxOf(editor, 'Massage').click();
		await settled(editor);
		expect(items(editor)).toEqual([['Massage', true]]);
		boxOf(editor, 'Massage').click();
		await settled(editor);
		expect(items(editor)).toEqual([['Massage', false]]);

		editor.setEditable(false);
		boxOf(editor, 'Massage').click();
		await settled(editor);
		expect(items(editor)).toEqual([['Massage', false]]);
	});

	it('ticks in a scene that cannot be edited where it is tickable, as a menu’s page is', async () => {
		const editor = sceneEditor();
		insertMenuFrom(editor, [{ name: 'Starters', items: ['Massage'] }]);
		await settled(editor);
		caretIn(editor, 'Massage', 0);
		setSelectedChecklist(editor, true);
		await settled(editor);
		editor.setEditable(false);
		setTickable(editor, true);

		boxOf(editor, 'Massage').click();
		await settled(editor);
		expect(items(editor)).toEqual([['Massage', true]]);

		setTickable(editor, false);
		boxOf(editor, 'Massage').click();
		await settled(editor);
		expect(items(editor)).toEqual([['Massage', true]]);
	});

	it('is a plain item again after Backspace at its start, still in the menu', async () => {
		const editor = sceneEditor();
		insertMenuFrom(editor, [{ name: 'Starters', items: ['Massage', 'Blindfold'] }]);
		await settled(editor);
		caretIn(editor, 'Blindfold', 0);
		setSelectedChecklist(editor, true);
		caretIn(editor, 'Blindfold', 0);
		editor.dispatchCommand(KEY_BACKSPACE_COMMAND, new KeyboardEvent('keydown'));
		await settled(editor);
		expect(items(editor)).toEqual([
			['Massage', null],
			['Blindfold', null]
		]);
	});

	it('comes from a to-do list made a menu, and goes back to one as text, ticks and all', async () => {
		const editor = sceneEditor();
		const value = JSON.stringify({
			root: {
				type: 'root',
				children: [
					{
						type: 'list',
						listType: 'check',
						start: 1,
						children: [
							{ type: 'listitem', value: 1, checked: true, children: [serialisedText('Massage')] },
							{
								type: 'listitem',
								value: 2,
								checked: false,
								children: [serialisedText('Blindfold')]
							}
						]
					}
				]
			}
		});
		editor.setEditorState(editor.parseEditorState(value));
		editor.update(
			() => {
				getRoot().select(0, getRoot().getChildrenSize());
			},
			{ discrete: true }
		);
		selectionToMenu(editor);
		await settled(editor);
		expect(items(editor)).toEqual([
			['Massage', true],
			['Blindfold', false]
		]);

		const menuKey = editor.getEditorState().read(() => getRoot().getFirstChild()?.getKey() ?? '');
		blockToText(editor, menuKey);
		await settled(editor);
		const [list] = stored(editor).root.children;
		expect(list).toMatchObject({
			type: 'list',
			listType: 'check',
			children: [{ checked: true }, { checked: false }]
		});
	});
});

/** The page's first menu's element. */
function menuElement(editor: LexicalEditor): HTMLElement {
	return defined(editor.getRootElement()?.querySelector<HTMLElement>('.scene-menu'), 'the menu');
}

describe('a menu’s frame in the editor', () => {
	function press(target: Element) {
		target.dispatchEvent(
			new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })
		);
	}

	it('shows the menu’s own title in place of the design’s, and its subtitle', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const menuKey = editor.getEditorState().read(() => getRoot().getFirstChild()?.getKey() ?? '');
		const title = () => menuElement(editor).querySelector('.menu-title')?.textContent;
		expect(title()).toBe('Menu');

		setMenuHeading(editor, menuKey, { title: 'Our night', subtitle: 'For two' });
		await settled(editor);
		expect(title()).toBe('Our night');
		expect(menuElement(editor).querySelector('.menu-subtitle')?.textContent).toBe('For two');
		const [menu] = stored(editor).root.children;
		expect(menu).toMatchObject({
			title: 'Our night',
			subtitle: 'For two'
		});
		expect(documentToPlainText(stored(editor))).toContain('Our night\nFor two');

		setMenuHeading(editor, menuKey, { title: '' });
		setDesign(editor, menuKey, 'dungeon');
		await settled(editor);
		expect(title()).toBe('The Cellar');
	});

	it('knows when the caret is in it, and adds a section from its button', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		expect(menuElement(editor).classList.contains('caret-in')).toBe(true);

		press(defined(menuElement(editor).querySelector('.menu-add-course button'), 'Add a section'));
		await settled(editor);
		const [menu] = stored(editor).root.children;
		const courses = menu?.type === 'scene-menu' ? menu.children : [];
		expect(courses).toHaveLength(DEFAULT_COURSES.length + 1);
		expect(linesOf(courses.at(-1)?.children ?? [])).toEqual([['heading', 'New section']]);
		// Its words are selected, to be typed over.
		const selected = editor.getEditorState().read(() => getSelection()?.getTextContent());
		expect(selected).toBe('New section');

		editor.update(() => getRoot().append(lineOf('After')).selectEnd(), { discrete: true });
		await settled(editor);
		expect(menuElement(editor).classList.contains('caret-in')).toBe(false);
	});

	it('is not marked as being written in where it cannot be, the caret in it or not', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		editor.setEditable(false);
		await settled(editor);
		expect(menuElement(editor).classList.contains('caret-in')).toBe(false);

		editor.update(() => getRoot().selectStart(), { discrete: true });
		await settled(editor);
		expect(menuElement(editor).classList.contains('caret-in')).toBe(false);

		editor.setEditable(true);
		await settled(editor);
		expect(menuElement(editor).classList.contains('caret-in')).toBe(true);
	});

	it('takes the caret when its heading is tapped, from wherever it was', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		editor.update(() => getRoot().append(lineOf('After')).selectEnd(), { discrete: true });
		await settled(editor);
		expect(blockAtCaret(editor)).toBeNull();

		// The heading's own space: its title is words to type in (below).
		press(defined(menuElement(editor).querySelector('.menu-head'), 'the heading'));
		await settled(editor);
		const at = blockAtCaret(editor);
		expect(at?.kind === 'menu' && at.line?.role).toBe('heading');

		editor.update(() => getRoot().getLastChild()?.selectEnd(), { discrete: true });
		press(defined(menuElement(editor).querySelector('.menu-key'), 'the key'));
		await settled(editor);
		expect(blockAtCaret(editor)?.kind).toBe('menu');
	});

	it('starts a line after a menu that ends the page when the page is pressed below it', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const root = defined(editor.getRootElement(), 'the page');
		const below = menuElement(editor).getBoundingClientRect().bottom + 5;
		root.dispatchEvent(
			new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY: below })
		);
		await settled(editor);
		expect(stored(editor).root.children.map((block) => block.type)).toEqual([
			'scene-menu',
			'paragraph'
		]);
		expect(blockAtCaret(editor)).toBeNull();

		// With a line after it already, the browser places the caret as usual.
		root.dispatchEvent(
			new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY: below })
		);
		await settled(editor);
		expect(stored(editor).root.children).toHaveLength(2);
	});

	it('leaves the focus in a field outside the page that changes it', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const menuKey = editor.getEditorState().read(() => getRoot().getFirstChild()?.getKey() ?? '');
		editor.focus();
		await settled(editor);
		const field = document.createElement('input');
		document.body.append(field);
		cleanups.push(() => field.remove());
		field.focus();

		for (const name of ['H', 'He', 'Hea', 'Heat']) {
			setMenuExtras(editor, menuKey, { scale: name });
			setMenuHeading(editor, menuKey, { title: name });
			await settled(editor);
		}
		expect(document.activeElement).toBe(field);
	});
});

/** The page's first block, as stored. */
function firstBlock(editor: LexicalEditor) {
	const [block] = stored(editor).root.children;
	return block;
}

describe('a menu’s words written on the menu itself', () => {
	function frame(editor: LexicalEditor, selector: string): HTMLElement {
		return defined(
			editor.getRootElement()?.querySelector<HTMLElement>(`.scene-menu ${selector}`),
			selector
		);
	}

	/** Types into one of the frame's texts as a person would: focused, then changed. */
	function retype(element: HTMLElement, text: string) {
		element.focus();
		element.textContent = text;
		element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
	}

	async function menuWith(design: MenuDesignId) {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const menuKey = editor.getEditorState().read(() => getRoot().getFirstChild()?.getKey() ?? '');
		setDesign(editor, menuKey, design);
		await settled(editor);
		return { editor, menuKey };
	}

	it('makes the title the menu’s own, and an emptied one the design’s again once left', async () => {
		const { editor } = await menuWith('office');
		const title = frame(editor, '.menu-title');
		expect(title.isContentEditable).toBe(true);
		retype(title, 'Overtime');
		await settled(editor);
		expect(firstBlock(editor)).toMatchObject({ title: 'Overtime' });

		retype(frame(editor, '.menu-title'), '');
		await settled(editor);
		expect(firstBlock(editor)).toMatchObject({ title: '' });
		frame(editor, '.menu-title').blur();
		await settled(editor);
		expect(frame(editor, '.menu-title').textContent).toBe('MEMO');
	});

	it('keeps rewritten copy with its design, and puts it back with Reset', async () => {
		const { editor, menuKey } = await menuWith('letter');
		retype(frame(editor, '[data-copy="signoff"]'), 'Yours, always');
		await settled(editor);
		expect(firstBlock(editor)).toMatchObject({
			copy: { letter: { signoff: 'Yours, always' } }
		});
		const reset = frame(editor, '.menu-copy-reset');
		expect(reset.matches(':popover-open')).toBe(true);

		setDesign(editor, menuKey, 'facts');
		await settled(editor);
		expect(editor.getRootElement()?.querySelector('[data-copy="signoff"]')).toBeNull();
		setDesign(editor, menuKey, 'letter');
		await settled(editor);
		expect(frame(editor, '[data-copy="signoff"]').textContent).toBe('Yours, always');

		frame(editor, '[data-copy="signoff"]').focus();
		const again = frame(editor, '.menu-copy-reset');
		again.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settled(editor);
		expect(frame(editor, '[data-copy="signoff"]').textContent).toBe('At your pleasure, always');
		expect(firstBlock(editor)).toMatchObject({ copy: {} });
	});

	it('starts a new line in a design’s copy on Enter, unless another would break the design', async () => {
		const { editor } = await menuWith('letter');
		const signoff = frame(editor, '[data-copy="signoff"]');
		signoff.focus();
		const words = defined(signoff.firstChild, 'its words');
		globalThis.getSelection()?.collapse(words, 'At your pleasure,'.length);
		signoff.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
		);
		await settled(editor);
		expect(document.activeElement).toBe(signoff);
		expect(firstBlock(editor)).toMatchObject({
			copy: { letter: { signoff: 'At your pleasure,\n always' } }
		});

		// At the end, the new last line shows, to type on.
		globalThis.getSelection()?.selectAllChildren(signoff);
		globalThis.getSelection()?.collapseToEnd();
		signoff.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
		);
		await settled(editor);
		expect(signoff.lastChild?.nodeName).toBe('BR');

		const { editor: memo } = await menuWith('office');
		const stamp = frame(memo, '[data-copy="stamp"]');
		stamp.focus();
		stamp.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
		);
		await settled(memo);
		expect(document.activeElement).not.toBe(stamp);
		expect(firstBlock(memo)).toMatchObject({ copy: {} });
	});

	it('splits copy that is a form’s fields into labels and values as it is typed', async () => {
		const { editor } = await menuWith('clinic');
		const patient = frame(editor, '[data-copy="patient"]');
		const labels = () =>
			[...patient.querySelectorAll('.copy-label')].map((each) => each.textContent);
		expect(labels()).toEqual(['PATIENT:', 'DATE:']);

		// A colon typed mid-line makes what is before it the label, and the
		// caret stays after the colon.
		patient.focus();
		const value = defined(patient.querySelector('.copy-value')?.firstChild, 'the value');
		value.textContent = ' my good patient: Sam';
		globalThis.getSelection()?.collapse(value, ' my good patient:'.length);
		patient.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
		await settled(editor);
		expect(labels()).toEqual(['PATIENT:', 'DATE:']);
		expect(firstBlock(editor)).toMatchObject({
			copy: { clinic: { patient: 'PATIENT: my good patient: Sam\nDATE: tonight' } }
		});

		const label = defined(patient.querySelector('.copy-label')?.firstChild, 'the label');
		label.textContent = 'PATIENT';
		globalThis.getSelection()?.collapse(label, 'PATIENT'.length);
		patient.dispatchEvent(
			new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' })
		);
		await settled(editor);
		expect(labels()).toEqual(['PATIENT my good patient:', 'DATE:']);
		const caret = globalThis.getSelection();
		expect(caret?.anchorNode?.parentElement?.classList.contains('copy-label')).toBe(true);
		expect(caret?.anchorOffset).toBe('PATIENT'.length);
	});

	it('strings a beaded subtitle a word at a time as it is typed, spaces where they were put', async () => {
		const { editor } = await menuWith('decora');
		const subtitle = frame(editor, '.menu-subtitle');
		const strung = () =>
			[...subtitle.children].map((each) =>
				each.classList.contains('gap') ? '_' : each.textContent
			);
		expect(strung()).toEqual(['MORE', '_', 'IS', '_', 'MORE']);

		// A space typed into a word splits it in two at the caret, and the
		// caret stays after the space.
		subtitle.focus();
		const is = defined(subtitle.querySelectorAll('.bead-word .bead')[4]?.firstChild, 'the I');
		is.textContent = 'I ';
		globalThis.getSelection()?.collapse(is, 2);
		subtitle.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
		await settled(editor);
		expect(strung()).toEqual(['MORE', '_', 'I', '_', 'S', '_', 'MORE']);
		const caret = globalThis.getSelection();
		expect(caret?.anchorNode?.parentElement).toBe(subtitle.querySelectorAll(':scope > .gap')[1]);
		expect(firstBlock(editor)).toMatchObject({ subtitle: 'MORE I S MORE' });
	});

	it('draws a lettered title a letter at a time, as the design’s and as it is typed', async () => {
		const { editor } = await menuWith('decora');
		const title = frame(editor, '.menu-title');
		const letters = () =>
			[...title.querySelectorAll('.title-letter')].map((each) => each.textContent);
		expect(letters()).toEqual([...'Pile It On!']);

		title.focus();
		const last = defined(title.querySelector('.title-letter:last-child')?.firstChild, 'the !');
		last.textContent = '!!';
		globalThis.getSelection()?.collapse(last, 2);
		title.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
		await settled(editor);
		expect(letters()).toEqual([...'Pile It On!!']);
		expect(firstBlock(editor)).toMatchObject({ title: 'Pile It On!!' });

		// Another design's title is plain words.
		const { editor: memo } = await menuWith('office');
		expect(frame(memo, '.menu-title').children).toHaveLength(0);
	});

	it('starts a new line in copy that is fields on Enter, a label until it has a colon', async () => {
		const { editor } = await menuWith('clinic');
		const patient = frame(editor, '[data-copy="patient"]');
		patient.focus();
		const date = defined(patient.querySelectorAll('.copy-value')[1]?.firstChild, 'the date');
		globalThis.getSelection()?.collapse(date, date.textContent?.length ?? 0);
		patient.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
		);
		await settled(editor);
		expect(document.activeElement).toBe(patient);
		expect(patient.querySelectorAll('.copy-line')).toHaveLength(3);

		const caret = globalThis.getSelection();
		const line = defined(patient.querySelectorAll('.copy-line')[2], 'the new line');
		expect(line.contains(caret?.anchorNode ?? null)).toBe(true);
		line.textContent = 'NOTES';
		patient.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
		await settled(editor);
		expect([...patient.querySelectorAll('.copy-label')].map((each) => each.textContent)).toEqual([
			'PATIENT:',
			'DATE:',
			'NOTES'
		]);
		expect(firstBlock(editor)).toMatchObject({
			copy: { clinic: { patient: 'PATIENT: my good patient\nDATE: tonight\nNOTES' } }
		});
	});

	it('names a rating in the menu’s key, written on the menu', async () => {
		const { editor, menuKey } = await menuWith('office');
		setMenuExtras(editor, menuKey, { scale: 'Heat' });
		await settled(editor);
		retype(frame(editor, '.menu-key-scale .menu-key-label'), 'Spice');
		await settled(editor);
		expect(firstBlock(editor)).toMatchObject({ scale: 'Spice' });
		// Emptied, it stays while it is typed in, and is still on.
		retype(frame(editor, '.menu-key-scale .menu-key-label'), '');
		await settled(editor);
		expect(firstBlock(editor)).toMatchObject({ scale: '' });
		expect(frame(editor, '.menu-key-scale').hidden).toBe(false);
	});

	it('takes the page’s selection into the menu when its words are tapped into', async () => {
		const { editor } = await menuWith('office');
		editor.update(() => getRoot().append(lineOf('After')).selectEnd(), { discrete: true });
		await settled(editor);
		expect(blockAtCaret(editor)).toBeNull();
		frame(editor, '[data-copy="memo"]').focus();
		await settled(editor);
		expect(blockAtCaret(editor)?.kind).toBe('menu');
	});
});

describe('a course’s picture', () => {
	it('is the next toy in turn, and changes to the one picked, on that design only', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const menuKey = editor.getEditorState().read(() => getRoot().getFirstChild()?.getKey() ?? '');
		setDesign(editor, menuKey, 'toys');
		await settled(editor);
		const pictures = () =>
			[...(editor.getRootElement()?.querySelectorAll<HTMLElement>('.menu-course-art') ?? [])].map(
				(picture) => picture.dataset.art
			);
		expect(pictures()).toEqual(['mask', 'cuffs', 'wand', 'candle']);

		const asked: MenuArtRequest[] = [];
		editor.getRootElement()?.addEventListener(MENU_ART_EVENT, (event) => {
			asked.push((event as CustomEvent<MenuArtRequest>).detail);
		});
		editor.getRootElement()?.querySelectorAll<HTMLElement>('.menu-course-art')[1]?.click();
		expect(asked).toMatchObject([{ design: 'toys', current: 'cuffs', label: 'Toy' }]);
		expect(asked[0]?.choices).toHaveLength(8);

		setCourseArt(editor, defined(asked[0], 'a request').key, 'toys', 'rope');
		await settled(editor);
		expect(pictures()).toEqual(['mask', 'rope', 'wand', 'candle']);
		const [menu] = stored(editor).root.children;
		const courses = menu?.type === 'scene-menu' ? menu.children : [];
		expect(courses[1]).toMatchObject({ art: { toys: 'rope' } });

		setDesign(editor, menuKey, 'fine');
		await settled(editor);
		expect(pictures()).toEqual([]);
		setDesign(editor, menuKey, 'toys');
		await settled(editor);
		expect(pictures()).toEqual(['mask', 'rope', 'wand', 'candle']);
	});
});

describe('a menu’s mascot', () => {
	it('is the design’s first, and changes to the one picked, with its title', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const menuKey = editor.getEditorState().read(() => getRoot().getFirstChild()?.getKey() ?? '');
		setDesign(editor, menuKey, 'pet');
		await settled(editor);
		const menu = () => menuElement(editor);
		const mascot = () =>
			defined(menu().querySelector<HTMLElement>('button.menu-mascot'), 'the mascot');
		expect(mascot().dataset.art).toBe('pup');
		expect(menu().dataset.mascot).toBe('pup');
		expect(menu().querySelector('.menu-title')?.textContent).toBe('Good Pup');

		const asked: MenuArtRequest[] = [];
		editor.getRootElement()?.addEventListener(MENU_ART_EVENT, (event) => {
			asked.push((event as CustomEvent<MenuArtRequest>).detail);
		});
		mascot().click();
		expect(asked).toMatchObject([{ kind: 'mascot', key: menuKey, design: 'pet', current: 'pup' }]);

		setMenuMascot(editor, menuKey, 'pet', 'kitty');
		await settled(editor);
		expect(mascot().dataset.art).toBe('kitty');
		expect(menu().dataset.mascot).toBe('kitty');
		expect(menu().querySelector('.menu-title')?.textContent).toBe('Good Kitty');
		expect(firstBlock(editor)).toMatchObject({ mascot: { pet: 'kitty' } });

		// A title of its own still wins.
		setMenuHeading(editor, menuKey, { title: 'Good Girl' });
		await settled(editor);
		expect(menu().querySelector('.menu-title')?.textContent).toBe('Good Girl');
	});
});

describe('a seed packet’s flower', () => {
	it('brings its Latin name and its plate’s colour with it', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const menuKey = editor.getEditorState().read(() => getRoot().getFirstChild()?.getKey() ?? '');
		setDesign(editor, menuKey, 'seeds');
		await settled(editor);
		const courses = () => [
			...(editor.getRootElement()?.querySelectorAll<HTMLElement>('.scene-menu-course') ?? [])
		];
		const first = () => defined(courses()[0], 'the first packet');
		expect(first().querySelector<HTMLElement>('.menu-course-art')?.dataset.art).toBe('daisy');
		expect(first().style.getPropertyValue('--course-caption')).toBe('"Bellis tactilis"');

		const key = editor.getEditorState().read(() => {
			const menu = getRoot().getFirstChild();
			return isMenuNode(menu) ? (menu.getFirstChild()?.getKey() ?? '') : '';
		});
		setCourseArt(editor, key, 'seeds', 'peony');
		await settled(editor);
		expect(first().querySelector<HTMLElement>('.menu-course-art')?.dataset.art).toBe('peony');
		expect(first().style.getPropertyValue('--course-caption')).toBe('"Paeonia rubens"');
		expect(first().style.getPropertyValue('--course-tint')).toBe('#f8e4ea');
	});
});

describe('a design’s row of pictures', () => {
	it('changes one place at a time, on that design only', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const menuKey = editor.getEditorState().read(() => getRoot().getFirstChild()?.getKey() ?? '');
		setDesign(editor, menuKey, 'sampler');
		await settled(editor);
		const shown = () =>
			[...menuElement(editor).querySelectorAll<HTMLElement>('button.menu-picture')].map(
				(picture) => picture.dataset.art
			);
		expect(shown()).toEqual(['bunny', 'flower', 'fox']);

		const asked: MenuArtRequest[] = [];
		editor.getRootElement()?.addEventListener(MENU_ART_EVENT, (event) => {
			asked.push((event as CustomEvent<MenuArtRequest>).detail);
		});
		menuElement(editor).querySelectorAll<HTMLElement>('button.menu-picture')[2]?.click();
		expect(asked).toMatchObject([
			{ kind: 'picture', place: 2, current: 'fox', label: 'Stitching' }
		]);

		setMenuPicture(editor, menuKey, 'sampler', 2, 'cat');
		await settled(editor);
		expect(shown()).toEqual(['bunny', 'flower', 'cat']);
		expect(firstBlock(editor)).toMatchObject({ pictures: { sampler: { '2': 'cat' } } });

		setDesign(editor, menuKey, 'fine');
		await settled(editor);
		expect(shown()).toEqual([]);
	});
});

describe('a menu’s delete button', () => {
	it('deletes the whole menu, words and all, leaving a line to write on', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const remove = defined(
			menuElement(editor).querySelector<HTMLElement>('.menu-delete'),
			'the delete button'
		);
		remove.click();
		await settled(editor);
		expect(stored(editor).root.children.map((block) => block.type)).toEqual(['paragraph']);
	});

	it('puts the caret in what follows the menu', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		editor.update(() => getRoot().append(lineOf('After')), { discrete: true });
		await settled(editor);
		menuElement(editor).querySelector<HTMLElement>('.menu-delete')?.click();
		await settled(editor);
		expect(visibleText(editor, 'anyone').trim()).toBe('After');
		expect(stored(editor).root.children).toHaveLength(1);
	});
});

/** A writer's editor, bound to a document of its own, as a scene's page binds one. */
function collaborator(userId: string) {
	const root = document.createElement('div');
	root.contentEditable = 'true';
	document.body.append(root);
	const cursorsContainer = document.createElement('div');
	document.body.append(cursorsContainer);
	const { editor, destroy } = createRichTextEditor({
		features: SCENE_FEATURES,
		namespace: `scene-${userId}`,
		history: false
	});
	editor.setRootElement(root);
	setSceneViewer(editor, userId);
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
	cleanups.push(() => {
		collaboration.destroy();
		bound.destroy();
		awareness.destroy();
		editor.setRootElement(null);
		destroy();
		root.remove();
		cursorsContainer.remove();
	});
	return { editor, doc };
}

describe('a menu’s id', () => {
	/** Each of the page's menus' ids, in order. */
	function ids(editor: LexicalEditor): (string | null)[] {
		return stored(editor).root.children.flatMap((block) =>
			block.type === 'scene-menu' ? [block.id] : []
		);
	}

	/** Two menus, as a page from before links has them, or as a paste of one makes them. */
	function twoMenus(editor: LexicalEditor, first: string | null, second: string | null) {
		build(editor, () =>
			[first, second].map((id) =>
				createMenuNode()
					.setMenuId(id)
					.append(
						createMenuCourseNode().append(
							createMenuLineNode('item').append(createTextNode(id ?? 'none'))
						)
					)
			)
		);
	}

	it('is made with the menu, kept when stored, and drawn on it', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const [id] = ids(editor);
		expect(id).toMatch(/^[0-9a-f-]{36}$/);
		expect(menuElement(editor).dataset.menuId).toBe(id);
	});

	it('is given to a menu from before links where it can be edited, and nowhere else', async () => {
		const editor = sceneEditor();
		editor.setEditable(false);
		twoMenus(editor, null, null);
		await settled(editor);
		expect(ids(editor)).toEqual([null, null]);

		editor.setEditable(true);
		await settled(editor);
		await settled(editor);
		const given = ids(editor);
		expect(given.every((id) => typeof id === 'string')).toBe(true);
		expect(new Set(given).size).toBe(2);
	});

	it('is new for the second of two menus with one id, the first keeping it', async () => {
		const editor = sceneEditor();
		twoMenus(editor, 'same', 'same');
		await settled(editor);
		await settled(editor);
		const [first, second] = ids(editor);
		expect(first).toBe('same');
		expect(second).not.toBe('same');
		expect(second).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('given by one writer to a menu from another, reaches them both', async () => {
		// A reader's editor cannot give one, so the menu reaches the writer
		// without, as a scene from before links does.
		const reader = collaborator('ada');
		const writer = collaborator('bo');
		const first = await firstEdit();
		for (const each of [reader, writer]) {
			applyUpdate(each.doc, first, REMOTE_ORIGIN);
			await settled(each.editor);
		}
		reader.editor.setEditable(false);
		twoMenus(reader.editor, null, 'kept');
		await settled(reader.editor);
		applyUpdate(writer.doc, encodeStateAsUpdate(reader.doc), REMOTE_ORIGIN);
		await settled(writer.editor);
		await settled(writer.editor);
		const [given] = ids(writer.editor);
		expect(given).toMatch(/^[0-9a-f-]{36}$/);

		applyUpdate(reader.doc, encodeStateAsUpdate(writer.doc), REMOTE_ORIGIN);
		await settled(reader.editor);
		expect(ids(reader.editor)).toEqual([given, 'kept']);
	});
});

describe('a menu’s link button', () => {
	function linkRequests(editor: LexicalEditor): MenuLinkRequest[] {
		const heard: MenuLinkRequest[] = [];
		const root = defined(editor.getRootElement(), 'the root');
		const listen = (event: Event) => heard.push((event as CustomEvent<MenuLinkRequest>).detail);
		root.addEventListener(MENU_LINK_EVENT, listen);
		cleanups.push(() => root.removeEventListener(MENU_LINK_EVENT, listen));
		return heard;
	}

	it('asks the page for the menu’s link, pointing at itself, for a reader too', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const heard = linkRequests(editor);
		const button = defined(
			menuElement(editor).querySelector<HTMLElement>('.menu-link'),
			'the link button'
		);
		button.click();
		editor.setEditable(false);
		button.click();
		expect(heard).toEqual([
			{ menuId: menuElement(editor).dataset.menuId, anchor: button },
			{ menuId: menuElement(editor).dataset.menuId, anchor: button }
		]);
	});

	it('sits beside the delete button, in the menu’s corner', async () => {
		const editor = sceneEditor();
		insertMenu(editor);
		await settled(editor);
		const corner = defined(menuElement(editor).querySelector('.menu-tools'), 'the corner');
		expect([...corner.children].map((button) => button.className)).toEqual([
			'menu-link',
			'menu-delete'
		]);
	});
});

describe('a menu’s own page', () => {
	/** A scene of a line, a menu of one course, and a line. */
	function scene(editor: LexicalEditor, id = 'the-menu') {
		build(editor, () => [
			lineOf('Before'),
			createMenuNode()
				.setMenuId(id)
				.append(
					createMenuCourseNode().append(
						createMenuLineNode('heading').append(createTextNode('Mains')),
						createMenuLineNode('item').append(createTextNode('Rope'))
					)
				),
			lineOf('After')
		]);
	}

	function onlyMenu(editor: LexicalEditor, id: string) {
		const found: boolean[] = [];
		cleanups.push(registerOnlyMenu(editor, id, (each) => found.push(each)));
		return found;
	}

	function caretText(editor: LexicalEditor): string | null {
		return editor.getEditorState().read(() => {
			const selection = getSelection();
			return isRangeSelection(selection) ? selection.anchor.getNode().getTextContent() : null;
		});
	}

	it('shows the menu alone, and says it is there', async () => {
		const editor = sceneEditor();
		const found = onlyMenu(editor, 'the-menu');
		scene(editor);
		await settled(editor);
		const root = defined(editor.getRootElement(), 'the root');
		expect(root.classList.contains('menu-page')).toBe(true);
		expect([...root.children].map((child) => child.classList.contains('only-menu'))).toEqual([
			false,
			true,
			false
		]);
		expect(found).toEqual([true]);
	});

	it('is being written in all the while it can be, and never while it cannot', async () => {
		const editor = sceneEditor();
		onlyMenu(editor, 'the-menu');
		scene(editor);
		await settled(editor);
		const menu = () =>
			defined(editor.getRootElement()?.querySelector('.only-menu'), 'the menu shown');
		expect(menu().classList.contains('caret-in')).toBe(true);

		editor.setEditable(false);
		await settled(editor);
		expect(menu().classList.contains('caret-in')).toBe(false);
		// A reader's click puts the selection in it, which marks nothing.
		editor.update(
			() => {
				const text = getRoot()
					.getAllTextNodes()
					.find((node) => node.getTextContent() === 'Rope');
				defined(text, 'Rope').select(0, 0);
			},
			{ discrete: true }
		);
		await settled(editor);
		expect(menu().classList.contains('caret-in')).toBe(false);

		editor.setEditable(true);
		await settled(editor);
		expect(menu().classList.contains('caret-in')).toBe(true);
	});

	it('says nothing until the scene is there, then that the menu is not', async () => {
		const editor = sceneEditor();
		const found = onlyMenu(editor, 'another');
		expect(found).toEqual([]);
		scene(editor);
		await settled(editor);
		expect(found).toEqual([false]);

		scene(editor, 'another');
		await settled(editor);
		expect(found).toEqual([false, true]);
	});

	it('brings a caret that leaves the menu back into it', async () => {
		const editor = sceneEditor();
		onlyMenu(editor, 'the-menu');
		scene(editor);
		await settled(editor);
		editor.update(() => getRoot().selectEnd(), { discrete: true });
		await settled(editor);
		await settled(editor);
		expect(caretText(editor)).toBe('Rope');

		editor.update(() => getRoot().selectStart(), { discrete: true });
		await settled(editor);
		await settled(editor);
		expect(caretText(editor)).toBe('Mains');
	});

	it('cuts a selection of everything down to the menu', async () => {
		const editor = sceneEditor();
		onlyMenu(editor, 'the-menu');
		scene(editor);
		await settled(editor);
		editor.update(() => getRoot().select(0, getRoot().getChildrenSize()), { discrete: true });
		await settled(editor);
		await settled(editor);
		const selected = editor.getEditorState().read(() => getSelection()?.getTextContent() ?? '');
		expect(selected).not.toContain('Before');
		expect(selected).not.toContain('After');
		expect(selected).toContain('Rope');
	});

	it('leaves nothing out of the menu, nor brings anything in, at its edges', async () => {
		const editor = sceneEditor();
		onlyMenu(editor, 'the-menu');
		scene(editor);
		await settled(editor);
		const before = stored(editor);

		editor.update(
			() => {
				const text = getRoot()
					.getAllTextNodes()
					.find((node) => node.getTextContent() === 'Mains');
				defined(text, 'Mains').select(0, 0);
			},
			{ discrete: true }
		);
		expect(editor.dispatchCommand(KEY_BACKSPACE_COMMAND, new KeyboardEvent('keydown'))).toBe(true);
		await settled(editor);
		expect(stored(editor)).toEqual(before);

		// An empty last line, where Enter would otherwise leave the menu.
		addMenuItem(editor, '');
		await settled(editor);
		const withEmpty = stored(editor);
		editor.update(
			() => {
				const menu = getRoot().getChildAtIndex(1);
				const line = isElementNode(menu) ? menu.getLastDescendant() : null;
				defined(line, 'the last line').selectEnd();
			},
			{ discrete: true }
		);
		editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
		await settled(editor);
		expect(stored(editor).root.children.map((block) => block.type)).toEqual(
			withEmpty.root.children.map((block) => block.type)
		);
	});
});

describe('sections', () => {
	it('gathers prompts of a kind into one section', async () => {
		const editor = sceneEditor();
		addToSection(editor, 'signals', 'To stop: red');
		await settled(editor);
		addToSection(editor, 'signals', 'Checking in: a squeeze');
		await settled(editor);
		const sections = stored(editor).root.children.filter((block) => block.type === 'scene-section');
		expect(sections).toHaveLength(1);
		expect(documentToPlainText(stored(editor))).toBe('To stop: red\nChecking in: a squeeze');
	});

	it('is left by Enter on an empty last line, and by Backspace at its very start', async () => {
		const editor = sceneEditor();
		addToSection(editor, 'limits', 'No marks');
		await settled(editor);
		editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
		await settled(editor);
		editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
		await settled(editor);
		expect(stored(editor).root.children.map((block) => block.type)).toEqual([
			'scene-section',
			'paragraph'
		]);

		editor.update(
			() => {
				const section = getRoot().getFirstChild();
				if (isElementNode(section)) {
					section.getFirstChild()?.selectStart();
				}
			},
			{ discrete: true }
		);
		editor.dispatchCommand(KEY_BACKSPACE_COMMAND, new KeyboardEvent('keydown'));
		await settled(editor);
		const [first] = stored(editor).root.children;
		expect(first).toMatchObject({ type: 'paragraph' });
		expect(stored(editor).root.children.some((block) => block.type === 'scene-section')).toBe(
			false
		);
	});
});

describe('a story', () => {
	it('toggles a chip in and out of its line, leaving what was typed', async () => {
		const editor = sceneEditor();
		setStoryLine(editor, 'where', 'a hotel room');
		await settled(editor);
		setStoryLine(editor, 'where', 'the shower');
		await settled(editor);
		expect(storyValues(editor).where).toBe('a hotel room, the shower');
		setStoryLine(editor, 'where', 'a hotel room');
		await settled(editor);
		expect(storyValues(editor).where).toBe('the shower');
		expect(
			stored(editor).root.children.filter((block) => block.type === 'scene-section')
		).toHaveLength(1);
	});

	it('lays a starter out in the story’s own order', async () => {
		const editor = sceneEditor();
		setStoryLine(editor, 'tone', 'strict');
		await settled(editor);
		addStoryStarter(editor, {
			premise: 'A strict lesson',
			parts: 'teacher and student',
			tone: 'strict'
		});
		await settled(editor);
		expect(documentToPlainText(stored(editor))).toBe(
			'What’s going on: A strict lesson\nWho you each are: teacher and student\nThe feel: strict'
		);
	});
});

describe('a surprise', () => {
	function withSurprise(viewerId: string) {
		const editor = sceneEditor(viewerId);
		build(editor, () => [
			createSceneSectionNode('story', 'bo').append(lineOf('A secret twist')),
			lineOf('After it')
		]);
		return editor;
	}

	it('is drawn as a surprise for the partner it is hidden from, and not for its writer', () => {
		const forBo = withSurprise('bo');
		expect(forBo.getRootElement()?.querySelector('.surprise')).not.toBeNull();
		const forAda = withSurprise('ada');
		expect(forAda.getRootElement()?.querySelector('.surprise')).toBeNull();
		expect(forAda.getRootElement()?.querySelector('.only-me')).not.toBeNull();
	});

	it('cannot be deleted by the partner it is hidden from', async () => {
		const editor = withSurprise('bo');
		editor.update(
			() => {
				getRoot().getLastChild()?.selectStart();
			},
			{ discrete: true }
		);
		expect(editor.dispatchCommand(KEY_BACKSPACE_COMMAND, new KeyboardEvent('keydown'))).toBe(true);
		editor.update(
			() => {
				getRoot().select(0, getRoot().getChildrenSize());
			},
			{ discrete: true }
		);
		expect(editor.dispatchCommand(KEY_BACKSPACE_COMMAND, new KeyboardEvent('keydown'))).toBe(true);
		await settled(editor);
		expect(documentToPlainText(stored(editor))).toContain('A secret twist');
	});

	it('is left out of what the partner’s page is read for, and out of the shared excerpt', () => {
		const forBo = withSurprise('bo');
		expect(visibleText(forBo, 'bo')).toBe('After it');
		expect(visibleText(forBo, 'anyone')).toBe('After it');
		const forAda = withSurprise('ada');
		expect(visibleText(forAda, 'ada')).toContain('A secret twist');
	});

	it('can be shown again only by the one who hid it', async () => {
		const forBo = withSurprise('bo');
		const key = forBo.getEditorState().read(() => getRoot().getFirstChild()?.getKey() ?? '');
		setHidden(forBo, key, null);
		await settled(forBo);
		const [stillHidden] = stored(forBo).root.children;
		expect(stillHidden).toMatchObject({ hiddenFrom: 'bo' });

		const forAda = withSurprise('ada');
		const adaKey = forAda.getEditorState().read(() => getRoot().getFirstChild()?.getKey() ?? '');
		setHidden(forAda, adaKey, null);
		await settled(forAda);
		const [shown] = stored(forAda).root.children;
		expect(shown).toMatchObject({ hiddenFrom: null });
	});
});

describe('two writers in one menu', () => {
	const side = collaborator;

	it('keeps both people’s items and both people’s details', async () => {
		const ada = side('ada');
		const bo = side('bo');
		const first = await firstEdit();
		for (const each of [ada, bo]) {
			applyUpdate(each.doc, first, REMOTE_ORIGIN);
			await settled(each.editor);
		}
		ada.editor.update(
			() => {
				getRoot()
					.clear()
					.append(
						createMenuNode().append(
							createMenuCourseNode().append(
								createMenuLineNode('heading').append(createTextNode('Mains')),
								createMenuLineNode('item').append(createTextNode('Rope'))
							)
						)
					);
			},
			{ discrete: true }
		);
		await settled(ada.editor);
		applyUpdate(bo.doc, encodeStateAsUpdate(ada.doc), REMOTE_ORIGIN);
		await settled(bo.editor);

		// At once, before either hears of the other: Ada adds an item, Bo sets
		// the existing one's rating.
		const rope = (editor: LexicalEditor) =>
			editor.getEditorState().read(() => {
				const menu = getRoot().getFirstChild();
				const course = isElementNode(menu) ? menu.getLastChild() : null;
				const line = isElementNode(course) ? course.getLastChild() : null;
				return isMenuLineNode(line) ? line.getKey() : '';
			});
		addMenuItem(ada.editor, 'Wax');
		setItemProps(bo.editor, rope(bo.editor), { rating: 4 });
		await settled(ada.editor);
		await settled(bo.editor);
		applyUpdate(bo.doc, encodeStateAsUpdate(ada.doc), REMOTE_ORIGIN);
		applyUpdate(ada.doc, encodeStateAsUpdate(bo.doc), REMOTE_ORIGIN);
		await settled(ada.editor);
		await settled(bo.editor);

		expect(stored(ada.editor)).toEqual(stored(bo.editor));
		const [menu] = stored(ada.editor).root.children;
		const items = allLines(menu);
		expect(documentToPlainText(stored(ada.editor))).toContain('Wax');
		expect(items.find((line) => line.rating === 4)).toBeDefined();
	});
});
