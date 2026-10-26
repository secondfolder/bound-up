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
import { Awareness } from 'y-protocols/awareness';
import { applyUpdate, Doc, encodeStateAsUpdate } from 'yjs';
import { toStoredDocument } from '$lib/lexical/document-shape';
import { exportEditorDocument } from '$lib/lexical/nodes';
import {
	$createMenuNode as createMenuNode,
	$isMenuNode as isMenuNode
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
import { setSceneViewer } from '$lib/lexical/nodes/scene/viewer';
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
		expect(item().querySelectorAll('button')).toHaveLength(0);

		setMenuExtras(editor, menuKey, { scale: 'Intensity', value: 'Price' });
		await settled(editor);
		expect(item().querySelectorAll('button.menu-rates > .menu-rate')).toHaveLength(5);
		expect(item().querySelector('button.menu-value')?.textContent).toBe('–');
		expect(editor.getRootElement()?.querySelector('.menu-key')?.textContent).toContain('Intensity');

		setMenuExtras(editor, menuKey, { scale: null, value: null });
		await settled(editor);
		expect(item().querySelectorAll('button')).toHaveLength(0);
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
	function side(userId: string) {
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
