import {
	$createListItemNode as createListItemNode,
	$createListNode as createListNode,
	$isListItemNode as isListItemNode,
	$isListNode as isListNode
} from '@lexical/list';
import {
	$createHeadingNode as createHeadingNode,
	$isHeadingNode as isHeadingNode
} from '@lexical/rich-text';
import {
	// biome-ignore lint/suspicious/noDeprecatedImports: only the overload that takes a type argument is deprecated, and this calls the plain one.
	$getNodeByKey,
	$addUpdateTag as addUpdateTag,
	COMMAND_PRIORITY_CRITICAL,
	COMMAND_PRIORITY_LOW,
	COMMAND_PRIORITY_NORMAL,
	CONTROLLED_TEXT_INSERTION_COMMAND,
	CUT_COMMAND,
	$createParagraphNode as createParagraphNode,
	$createTextNode as createTextNode,
	DELETE_CHARACTER_COMMAND,
	DELETE_LINE_COMMAND,
	DELETE_WORD_COMMAND,
	type ElementNode,
	$getNearestNodeFromDOMNode as getNearestNodeFromDOMNode,
	$getRoot as getRoot,
	$getSelection as getSelection,
	INSERT_PARAGRAPH_COMMAND,
	$isElementNode as isElementNode,
	$isParagraphNode as isParagraphNode,
	$isRangeSelection as isRangeSelection,
	$isRootNode as isRootNode,
	$isTextNode as isTextNode,
	KEY_BACKSPACE_COMMAND,
	KEY_DELETE_COMMAND,
	type LexicalEditor,
	type LexicalNode,
	mergeRegister,
	PASTE_COMMAND,
	REMOVE_TEXT_COMMAND,
	SKIP_DOM_SELECTION_TAG,
	TextNode
} from 'lexical';
import { hasChip, toggleChip } from '$lib/daydream/chips';
import { HEADING_TAGS } from '$lib/lexical/block-kind';
import {
	type HideableSceneNode,
	$isHideableSceneNode as isHideableSceneNode
} from '$lib/lexical/nodes/scene/hideable';
import {
	$createMenuNode as createMenuNode,
	DELETE_MENU_CLASS,
	$isMenuNode as isMenuNode,
	MENU_LINK_CLASS,
	MENU_LINK_EVENT,
	type MenuLinkRequest,
	MenuNode,
	RESET_COPY_CLASS
} from '$lib/lexical/nodes/scene/menu';
import {
	COURSE_ART_CLASS,
	$createMenuCourseNode as createMenuCourseNode,
	$isMenuCourseNode as isMenuCourseNode,
	MENU_ART_EVENT,
	type MenuArtRequest,
	MenuCourseNode
} from '$lib/lexical/nodes/scene/menu-course';
import {
	$createMenuLineNode as createMenuLineNode,
	$isMenuLineNode as isMenuLineNode,
	type MenuItemProps,
	MenuLineNode
} from '$lib/lexical/nodes/scene/menu-line';
import {
	$createSceneSectionNode as createSceneSectionNode,
	$isSceneSectionNode as isSceneSectionNode,
	SceneSectionNode
} from '$lib/lexical/nodes/scene/section';
import { sceneViewerOf } from '$lib/lexical/nodes/scene/viewer';
import {
	DEFAULT_COURSES,
	isSurpriseFor,
	itemExtrasText,
	MAX_EXTRA_LABEL,
	MAX_MENU_SUBTITLE,
	MAX_MENU_TITLE,
	type MenuExtras,
	type MenuHeading,
	type MenuLineRole,
	type SceneSection
} from '$lib/scenes/blocks';
import {
	designTitle,
	type MenuDesignId,
	type MenuPictureChoices,
	menuDesign,
	withMenuCopy
} from '$lib/scenes/menu-designs';
import {
	ADD_COURSE_CLASS,
	COPY_LINE_CLASS,
	COURSES_CLASS,
	copyTextOf,
	fillCopy,
	HOLD_OPEN,
	MASCOT_CLASS,
	PICTURE_CLASS
} from '$lib/scenes/menu-frame';
import { STORY_LINES, type StoryLine, storyLineText, storyLineValue } from '$lib/scenes/story';

/**
 * How the scene blocks behave in an editor, and every edit the scene's page
 * makes to them. Registered only on an editor with the `scene` feature (a
 * scene's page); the nodes themselves exist in every editor, so that any
 * editor can open a document that holds them. See docs/scenes.md, "Blocks".
 *
 * BROWSER ONLY: it drives a Lexical editor.
 */

/* ── finding things ──────────────────────────────────────────────────────── */

/** The child of the root that `node` is in, or is. */
function rootChildOf(node: LexicalNode): LexicalNode | null {
	let current: LexicalNode | null = node;
	while (current && !isRootNode(current.getParent())) {
		current = current.getParent();
	}
	return current;
}

/** Whether `node`, or anything it is inside, is hidden from `viewerId`. */
function isInSurprise(node: LexicalNode, viewerId: string | null): boolean {
	let current: LexicalNode | null = node;
	while (current) {
		if (isHideableSceneNode(current) && isSurpriseFor(current.getHiddenFrom(), viewerId)) {
			return true;
		}
		current = current.getParent();
	}
	return false;
}

/** The scene block the caret is in, and the menu line, if any. */
export type BlockAtCaret =
	| {
			kind: 'section';
			key: string;
			section: SceneSection;
			hiddenFrom: string | null;
	  }
	| {
			kind: 'menu';
			key: string;
			/** Its own title and subtitle, each empty when it has none. */
			heading: MenuHeading;
			design: MenuDesignId;
			/** The mascot chosen per design (`MenuDesign.mascot`). */
			mascot: Readonly<Record<string, string>>;
			/** The pictures chosen for a design's row (`MenuDesign.pictures`). */
			pictures: MenuPictureChoices;
			extras: MenuExtras;
			hiddenFrom: string | null;
			line: {
				key: string;
				role: MenuLineRole;
				props: MenuItemProps & { hiddenFrom: string | null };
			} | null;
	  };

export function blockAtCaret(editor: LexicalEditor): BlockAtCaret | null {
	return editor.getEditorState().read(() => {
		const selection = getSelection();
		if (!isRangeSelection(selection)) {
			return null;
		}
		const container = rootChildOf(selection.anchor.getNode());
		if (isSceneSectionNode(container)) {
			return {
				kind: 'section',
				key: container.getKey(),
				section: container.getSection(),
				hiddenFrom: container.getHiddenFrom()
			};
		}
		if (isMenuNode(container)) {
			const top = selection.anchor.getNode().getTopLevelElement();
			const line = isMenuLineNode(top)
				? { key: top.getKey(), role: top.getRole(), props: top.getItemProps() }
				: null;
			return $describeMenu(container, line);
		}
		return null;
	});
}

/**
 * The menu with `menuId` as `blockAtCaret` would describe it with the caret
 * in it, wherever the caret is: for a menu's own page, whose options are
 * for its one menu (`MenuOptionsDrawer`). Null when it is not in the scene.
 */
export function menuById(
	editor: LexicalEditor,
	menuId: string
): Extract<BlockAtCaret, { kind: 'menu' }> | null {
	return editor.getEditorState().read(() => {
		for (const child of getRoot().getChildren()) {
			if (isMenuNode(child) && child.getMenuId() === menuId) {
				return $describeMenu(child, null);
			}
		}
		return null;
	});
}

function $describeMenu(
	menu: MenuNode,
	line: Extract<BlockAtCaret, { kind: 'menu' }>['line']
): Extract<BlockAtCaret, { kind: 'menu' }> {
	return {
		kind: 'menu',
		key: menu.getKey(),
		heading: menu.getHeading(),
		design: menu.getDesign(),
		mascot: menu.getMascot(),
		pictures: menu.getPictures(),
		extras: menu.getExtras(),
		hiddenFrom: menu.getHiddenFrom(),
		line
	};
}

/**
 * Whether the selection can be made into a menu: none of it is in a menu
 * already, which "Make a menu" would leave as it is. Called inside a read of
 * the editor's state (the selection toolbar's).
 */
export function $canMakeMenu(): boolean {
	const selection = getSelection();
	if (!(isRangeSelection(selection) && !selection.isCollapsed())) {
		return false;
	}
	return !selection.getNodes().some((node) => isMenuNode(rootChildOf(node)));
}

/** Whether some text is selected, which can be made into a menu. */
export function hasSelectedText(editor: LexicalEditor): boolean {
	return editor.getEditorState().read(() => {
		const selection = getSelection();
		return isRangeSelection(selection) && !selection.isCollapsed();
	});
}

/**
 * The menu items the selection touches, each once, leaving out any hidden
 * from this viewer. Called inside a read or an update.
 */
export function $selectedMenuItems(viewerId: string | null): MenuLineNode[] {
	const selection = getSelection();
	if (!isRangeSelection(selection)) {
		return [];
	}
	const [start, end] = selection.isBackward()
		? [selection.focus, selection.anchor]
		: [selection.anchor, selection.focus];
	const items: MenuLineNode[] = [];
	// Only the words selected say which items are: the nodes in a selection
	// include the elements of lines it merely starts or ends in.
	const nodes = selection.isCollapsed()
		? [start.getNode()]
		: selection.getNodes().filter((node) => isTextNode(node));
	for (const node of nodes) {
		// A line the selection only touches, from the very end of its text or
		// to the very start, has none of its words selected.
		const touched =
			!selection.isCollapsed() &&
			((node.is(start.getNode()) && start.offset === node.getTextContentSize()) ||
				(node.is(end.getNode()) && end.offset === 0));
		if (touched) {
			continue;
		}
		const line = isMenuLineNode(node) ? node : node.getTopLevelElement();
		if (
			isMenuLineNode(line) &&
			line.getRole() === 'item' &&
			!isInSurprise(line, viewerId) &&
			!items.some((seen) => seen.is(line))
		) {
			items.push(line);
		}
	}
	return items;
}

/**
 * Makes the selected menu items a surprise for the partner, or not. The
 * selection toolbar offers it, since an item has no options of its own.
 */
export function setSelectedSurprise(editor: LexicalEditor, hiddenFrom: string | null): void {
	editor.update(() => {
		for (const item of $selectedMenuItems(sceneViewerOf(editor))) {
			item.setHiddenFrom(hiddenFrom);
		}
	});
}

/**
 * Whether every menu item the selection touches is a to-do, and whether it
 * touches any: what the toolbar's To-do list button shows and does in a
 * menu. Called inside a read.
 */
export function $selectedMenuChecklist(viewerId: string | null): {
	items: number;
	allTodo: boolean;
} {
	const items = $selectedMenuItems(viewerId);
	return { items: items.length, allTodo: items.every((item) => item.getChecked() !== null) };
}

/**
 * Makes the selected menu items to-dos, unticked, or plain items again:
 * the toolbar's To-do list button, in a menu, where Lexical's own list
 * command would wrap the menu's lines in a list. See docs/scenes.md,
 * "To-do items".
 */
export function setSelectedChecklist(editor: LexicalEditor, todo: boolean): void {
	editor.update(() => {
		for (const item of $selectedMenuItems(sceneViewerOf(editor))) {
			if ((item.getChecked() !== null) !== todo) {
				item.setChecked(todo ? false : null);
			}
		}
	});
}

/**
 * `[] `, `[ ] ` and `[x] ` typed at the start of a menu item, as in a
 * paragraph: Lexical's own shortcut makes a to-do list there, and one never
 * runs inside a menu's line.
 */
const CHECK_SHORTCUT = /^\[(?<tick>[ xX]?)\] /;

/* ── keeping blocks well formed ──────────────────────────────────────────── */

/** A line of text as a menu item, keeping its words, formatting and links. */
function asItem(node: LexicalNode): MenuLineNode {
	if (isMenuLineNode(node)) {
		return node;
	}
	const line = createMenuLineNode('item');
	if (isElementNode(node) && !node.isInline()) {
		line.append(...node.getChildren());
		node.replace(line);
	} else {
		node.replace(line);
		line.append(node);
	}
	return line;
}

/**
 * A menu holds courses; a course holds lines, its heading (if it has one)
 * first; a line lives only in a course; an empty block goes. These hold
 * whatever produced the shape: a paste, a partner's edit, an undo, a line
 * made a heading in the middle of a course (which starts a new course there).
 */
function registerTransforms(editor: LexicalEditor): () => void {
	return mergeRegister(
		editor.registerNodeTransform(MenuNode, (menu) => {
			if (menu.getChildrenSize() === 0) {
				menu.remove();
				return;
			}
			for (const child of menu.getChildren()) {
				if (isMenuCourseNode(child)) {
					continue;
				}
				// Anything else at a menu's top level joins the course before it,
				// or starts one: a heading always starts one.
				const line = asItem(child);
				const before = line.getPreviousSibling();
				if (isMenuCourseNode(before) && line.getRole() === 'item') {
					before.append(line);
				} else {
					const course = createMenuCourseNode();
					line.replace(course);
					course.append(line);
				}
			}
		}),
		editor.registerNodeTransform(MenuCourseNode, (course) => {
			if (!isMenuNode(course.getParent())) {
				for (const child of course.getChildren()) {
					course.insertBefore(child);
				}
				course.remove();
				return;
			}
			if (course.getChildrenSize() === 0) {
				course.remove();
				return;
			}
			const lines = course.getChildren().map(asItem);
			const split = lines.findIndex((line, index) => index > 0 && line.getRole() === 'heading');
			if (split > 0) {
				const next = createMenuCourseNode();
				course.insertAfter(next);
				next.append(...lines.slice(split));
			}
		}),
		editor.registerNodeTransform(MenuLineNode, (line) => {
			const parent = line.getParent();
			if (!(isMenuCourseNode(parent) || isMenuNode(parent))) {
				const paragraph = createParagraphNode();
				paragraph.append(...line.getChildren());
				line.replace(paragraph);
				return;
			}
			// Here as well as on the course: a line made a heading changes only
			// the line, and a transform runs on what changed.
			if (isMenuCourseNode(parent) && line.getRole() === 'heading' && line.getPreviousSibling()) {
				const next = createMenuCourseNode();
				parent.insertAfter(next);
				const rest = [line, ...line.getNextSiblings()];
				next.append(...rest);
			}
		}),
		// A line's own transform does not run for typing in it: Lexical runs an
		// element's only when the element itself changed.
		editor.registerNodeTransform(TextNode, (text) => {
			const line = text.getParent();
			if (isMenuLineNode(line) && text.is(line.getFirstChild())) {
				$checkShortcut(line);
			}
		}),
		editor.registerNodeTransform(SceneSectionNode, (section) => {
			if (section.getChildrenSize() === 0) {
				section.remove();
			}
		})
	);
}

/**
 * A menu's lines draw their rating and number from the menu (whether it has
 * them, and how its design writes a number), and its courses their pictures
 * from their places in it. So a menu that changes either
 * (here or on a partner's device) redraws its lines. Drawn straight into
 * their elements: nothing about the lines themselves has changed, so there
 * is nothing to sync.
 */
function registerDesignRedraw(editor: LexicalEditor): () => void {
	return editor.registerMutationListener(MenuNode, (mutations) => {
		editor.getEditorState().read(() => {
			for (const [key, mutation] of mutations) {
				const menu = mutation === 'destroyed' ? null : $getNodeByKey(key);
				if (!isMenuNode(menu)) {
					continue;
				}
				for (const course of menu.getChildren()) {
					// A course's picture, where it has none of its own, is by its
					// place, which a course added or taken away changes.
					const courseElement = editor.getElementByKey(course.getKey());
					if (isMenuCourseNode(course) && courseElement) {
						course.redrawArt(courseElement);
					}
					for (const line of isElementNode(course) ? course.getChildren() : []) {
						const element = editor.getElementByKey(line.getKey());
						if (isMenuLineNode(line) && element) {
							line.redraw(element);
						}
					}
				}
			}
		});
	});
}

/** The section or menu a line is in, at the root; null for a line that is in neither. */
function blockOf(line: LexicalNode): SceneSectionNode | MenuNode | null {
	const parent = line.getParent();
	if (isSceneSectionNode(parent) || isMenuNode(parent)) {
		return parent;
	}
	const grandparent = parent?.getParent();
	return isMenuCourseNode(parent) && isMenuNode(grandparent) ? grandparent : null;
}

/**
 * Enter on an empty last line leaves the block, as it leaves a list: from a
 * section's last line, or a menu's last course's last item.
 */
function registerEnter(editor: LexicalEditor): () => void {
	return editor.registerCommand(
		INSERT_PARAGRAPH_COMMAND,
		() => {
			const selection = getSelection();
			if (!(isRangeSelection(selection) && selection.isCollapsed())) {
				return false;
			}
			const line = selection.anchor.getNode().getTopLevelElement();
			const block = line ? blockOf(line) : null;
			if (!(line && block)) {
				return false;
			}
			if (line.getTextContentSize() !== 0 || line.getNextSibling() !== null) {
				return false;
			}
			const course = line.getParent();
			if (isMenuCourseNode(course) && course.getNextSibling() !== null) {
				return false;
			}
			const paragraph = createParagraphNode();
			block.insertAfter(paragraph);
			line.remove();
			paragraph.select();
			return true;
		},
		COMMAND_PRIORITY_LOW
	);
}

/**
 * Turns `[ ] ` just typed at the start of a menu item into a to-do: only
 * when the caret is right after it, so it is the typing that does it, as
 * with Lexical's own shortcuts, and not a pasted line that starts that way.
 */
function $checkShortcut(line: MenuLineNode): void {
	if (line.getRole() !== 'item' || line.getChecked() !== null) {
		return;
	}
	const first = line.getFirstChild();
	const selection = getSelection();
	if (!(isTextNode(first) && isRangeSelection(selection) && selection.isCollapsed())) {
		return;
	}
	const match: RegExpExecArray | null = CHECK_SHORTCUT.exec(first.getTextContent());
	if (
		!(match && selection.anchor.getNode().is(first) && selection.anchor.offset === match[0].length)
	) {
		return;
	}
	const rest = first.getTextContent().slice(match[0].length);
	line.setChecked(match.groups?.tick?.toLowerCase() === 'x');
	if (rest === '') {
		first.remove();
		line.selectStart();
	} else {
		first.setTextContent(rest);
		first.select(0, 0);
	}
}

/**
 * Backspace at the very start of a to-do item makes it a plain item, as
 * Backspace at the start of a to-do list's item makes it a paragraph. Above
 * the handler below, which would otherwise take the line out of the menu.
 */
function registerCheckBackspace(editor: LexicalEditor): () => void {
	return editor.registerCommand(
		KEY_BACKSPACE_COMMAND,
		(event) => {
			const selection = getSelection();
			if (!(isRangeSelection(selection) && selection.isCollapsed())) {
				return false;
			}
			const anchor = selection.anchor.getNode();
			const line = anchor.getTopLevelElement();
			if (!(isMenuLineNode(line) && line.getChecked() !== null)) {
				return false;
			}
			const atStart =
				selection.anchor.offset === 0 && (anchor.is(line) || anchor.is(line.getFirstDescendant()));
			if (!atStart) {
				return false;
			}
			event?.preventDefault();
			line.setChecked(null);
			return true;
		},
		COMMAND_PRIORITY_NORMAL
	);
}

/**
 * Backspace at the very start of a block's first line takes that line out
 * of the block, above it: the way out of a block from its top, and the way
 * to undo one line at a time. A block left empty goes. At the start of a
 * course after the first, it joins that course to the one before.
 */
function registerBackspace(editor: LexicalEditor): () => void {
	return editor.registerCommand(
		KEY_BACKSPACE_COMMAND,
		(event) => {
			const selection = getSelection();
			if (!(isRangeSelection(selection) && selection.isCollapsed())) {
				return false;
			}
			const anchor = selection.anchor.getNode();
			const line = anchor.getTopLevelElement();
			const block = line ? blockOf(line) : null;
			if (!(line && block)) {
				return false;
			}
			const atStart =
				selection.anchor.offset === 0 && (anchor.is(line) || anchor.is(line.getFirstDescendant()));
			if (!(atStart && line.getPreviousSibling() === null)) {
				return false;
			}
			if (!(isParagraphNode(line) || isMenuLineNode(line))) {
				return false;
			}
			const course = line.getParent();
			const previousCourse = isMenuCourseNode(course) ? course.getPreviousSibling() : null;
			event?.preventDefault();
			if (isMenuCourseNode(course) && isMenuCourseNode(previousCourse) && isMenuLineNode(line)) {
				line.setRole('item');
				previousCourse.append(...course.getChildren());
				course.remove();
				line.selectStart();
				return true;
			}
			const out = createParagraphNode();
			out.append(...line.getChildren());
			block.insertBefore(out);
			line.remove();
			if (isMenuCourseNode(course) && course.getChildrenSize() === 0) {
				course.remove();
			}
			if (block.getChildrenSize() === 0) {
				block.remove();
			}
			out.selectStart();
			return true;
		},
		COMMAND_PRIORITY_LOW
	);
}

/**
 * Nobody can delete what they cannot see. A surprise is not editable for its
 * viewer, so the caret never gets into one, but a selection can still reach
 * over one, and Backspace at the start of the line after one would merge into
 * it. Each of those is refused while the selection touches a surprise.
 */
function registerSurpriseGuard(editor: LexicalEditor): () => void {
	const touches = (direction: 'backward' | 'forward' | 'both') => {
		const viewer = sceneViewerOf(editor);
		if (!viewer) {
			return false;
		}
		const selection = getSelection();
		if (!selection) {
			return false;
		}
		if (selection.getNodes().some((node) => isInSurprise(node, viewer))) {
			return true;
		}
		if (!(isRangeSelection(selection) && selection.isCollapsed())) {
			return false;
		}
		// Collapsed at the edge of a line or block, next to a surprise.
		const anchor = selection.anchor.getNode();
		// The line, and each block it is in (a course, a menu), up to the root.
		const steps: LexicalNode[] = [];
		const line = anchor.getTopLevelElement();
		let step: LexicalNode | null = line;
		while (step && !isRootNode(step)) {
			steps.push(step);
			step = step.getParent();
		}
		const { offset } = selection.anchor;
		const atStart = offset === 0 && (!line || anchor.is(line.getFirstDescendant() ?? line));
		let anchorEnd = 0;
		if (isTextNode(anchor)) {
			anchorEnd = anchor.getTextContentSize();
		} else if (isElementNode(anchor)) {
			anchorEnd = anchor.getChildrenSize();
		}
		const atEnd =
			line !== null && offset === anchorEnd && anchor.is(line.getLastDescendant() ?? line);
		return steps.some((around) => {
			const before = direction !== 'forward' && atStart ? around.getPreviousSibling() : null;
			const after = direction !== 'backward' && atEnd ? around.getNextSibling() : null;
			return (
				(before !== null && isInSurprise(before, viewer)) ||
				(after !== null && isInSurprise(after, viewer))
			);
		});
	};
	const refuse = (direction: 'backward' | 'forward' | 'both') => (event?: Event | null) => {
		if (!touches(direction)) {
			return false;
		}
		event?.preventDefault();
		return true;
	};
	return mergeRegister(
		editor.registerCommand(KEY_BACKSPACE_COMMAND, refuse('backward'), COMMAND_PRIORITY_CRITICAL),
		editor.registerCommand(KEY_DELETE_COMMAND, refuse('forward'), COMMAND_PRIORITY_CRITICAL),
		editor.registerCommand(
			DELETE_CHARACTER_COMMAND,
			(backward) => touches(backward ? 'backward' : 'forward'),
			COMMAND_PRIORITY_CRITICAL
		),
		editor.registerCommand(
			DELETE_WORD_COMMAND,
			(backward) => touches(backward ? 'backward' : 'forward'),
			COMMAND_PRIORITY_CRITICAL
		),
		editor.registerCommand(
			DELETE_LINE_COMMAND,
			(backward) => touches(backward ? 'backward' : 'forward'),
			COMMAND_PRIORITY_CRITICAL
		),
		editor.registerCommand(REMOVE_TEXT_COMMAND, () => touches('both'), COMMAND_PRIORITY_CRITICAL),
		editor.registerCommand(CUT_COMMAND, refuse('both'), COMMAND_PRIORITY_CRITICAL),
		editor.registerCommand(PASTE_COMMAND, refuse('both'), COMMAND_PRIORITY_CRITICAL),
		editor.registerCommand(
			CONTROLLED_TEXT_INSERTION_COMMAND,
			() => {
				const selection = getSelection();
				return isRangeSelection(selection) && !selection.isCollapsed() && touches('both');
			},
			COMMAND_PRIORITY_CRITICAL
		)
	);
}

/** The menu's lines this viewer can see, in order. */
function visibleLines(menu: MenuNode, viewer: string | null): MenuLineNode[] {
	return menu
		.getChildren()
		.flatMap((course) => (isElementNode(course) ? course.getChildren() : []))
		.filter((line): line is MenuLineNode => isMenuLineNode(line) && !isInSurprise(line, viewer));
}

/** A new course at the end of a menu, its heading's words selected to be typed over. */
function $addCourse(menu: MenuNode): void {
	const words = createTextNode('New section');
	const course = createMenuCourseNode().append(createMenuLineNode('heading').append(words));
	menu.append(course);
	words.select(0, words.getTextContentSize());
}

/**
 * A menu knows when the caret is in it (`caret-in` on its element), which
 * shows its "Add a section" button. And a tap anywhere on a menu puts the
 * caret in it: its frame is drawn, not written, so a tap on its title or
 * key would otherwise land nowhere and leave the caret wherever it was. A
 * tap on a line's words is the browser's to place; a tap beside them ends
 * that line; on the menu's heading, the first line; anywhere else on it,
 * the last.
 */
function registerMenuCaret(editor: LexicalEditor): () => void {
	let marked: HTMLElement | null = null;
	const markCaret = () => {
		// A menu's own page marks its menu itself (`registerOnlyMenu`).
		if (editor.getRootElement()?.classList.contains(MENU_PAGE_CLASS)) {
			return;
		}
		// Only where the menu can be changed: what `caret-in` shows (adding a
		// section, the unset ratings and numbers, copy's placeholders) is for
		// writing, and a reader's click puts a selection in a menu too.
		const at = editor.isEditable() ? blockAtCaret(editor) : null;
		const element = at?.kind === 'menu' ? editor.getElementByKey(at.key) : null;
		if (element !== marked) {
			marked?.classList.remove('caret-in');
			element?.classList.add('caret-in');
			marked = element;
		}
	};

	/**
	 * Pressed on the page below everything on it, when the last thing on it
	 * is a menu or a section: a new line after it, to write on. The browser
	 * would put the caret in the block's last line, or nowhere, and the page
	 * could then never have anything after it.
	 */
	const pressBelowBlock = (event: MouseEvent): boolean => {
		// Not on a menu's own page, where nothing but the menu is shown: the
		// line would be added to the scene, out of sight.
		if (
			event.button !== 0 ||
			!editor.isEditable() ||
			editor.getRootElement()?.classList.contains(MENU_PAGE_CLASS)
		) {
			return false;
		}
		let added = false;
		editor.update(() => {
			const last = getRoot().getLastChild();
			const element = last ? editor.getElementByKey(last.getKey()) : null;
			if (
				(isMenuNode(last) || isSceneSectionNode(last)) &&
				element &&
				event.clientY > element.getBoundingClientRect().bottom
			) {
				const line = createParagraphNode();
				last.insertAfter(line);
				line.select();
				added = true;
			}
		});
		if (added) {
			event.preventDefault();
			editor.focus();
		}
		return added;
	};

	const press = (event: MouseEvent) => {
		const target = event.target instanceof Element ? event.target : null;
		// A course's picture and a menu's mascot ask for another on their
		// click (below), the menu's delete button deletes it on its, and its
		// link button offers its link; pressing any of them moves neither the
		// caret nor the focus.
		if (
			target?.closest(
				`.${COURSE_ART_CLASS}, .${DELETE_MENU_CLASS}, .${MENU_LINK_CLASS}, .${MASCOT_CLASS}, .${PICTURE_CLASS}`
			)
		) {
			event.preventDefault();
			return;
		}
		if (target && target === editor.getRootElement() && pressBelowBlock(event)) {
			return;
		}
		const menuElement = target?.closest<HTMLElement>('.scene-menu');
		if (!(target && menuElement && event.button === 0 && editor.isEditable())) {
			return;
		}
		if (
			menuElement.classList.contains('surprise') ||
			target.closest('.menu-line-words, .menu-line-extras button, .surprise')
		) {
			return;
		}
		const lineElement = target.closest<HTMLElement>('.scene-menu-line');
		// On a course itself, past its lines (the love letter's blank after a
		// title with nothing under it): a course with no items gets one.
		if (!lineElement && target.classList.contains('scene-menu-course')) {
			let added = false;
			editor.update(() => {
				const course = getNearestNodeFromDOMNode(target);
				const items = isMenuCourseNode(course)
					? course.getChildren().filter((line) => isMenuLineNode(line) && line.getRole() === 'item')
					: [];
				if (
					isMenuCourseNode(course) &&
					items.length === 0 &&
					!isInSurprise(course, sceneViewerOf(editor))
				) {
					const item = createMenuLineNode('item');
					course.append(item);
					item.selectStart();
					added = true;
				}
			});
			if (added) {
				event.preventDefault();
				editor.focus();
			}
			return;
		}
		// Between the lines, the browser finds the nearest one itself.
		if (!lineElement && target.closest(`.${COURSES_CLASS}`)) {
			return;
		}
		const adding = target.closest(`.${ADD_COURSE_CLASS} button`) !== null;
		const onHead = target.closest('.menu-head') !== null;
		event.preventDefault();
		const viewer = sceneViewerOf(editor);
		editor.update(() => {
			const menu = getNearestNodeFromDOMNode(menuElement);
			if (!isMenuNode(menu)) {
				return;
			}
			if (adding) {
				$addCourse(menu);
				return;
			}
			const line = lineElement ? getNearestNodeFromDOMNode(lineElement) : null;
			const lines = visibleLines(menu, viewer);
			if (isMenuLineNode(line)) {
				line.selectEnd();
			} else if (onHead) {
				lines[0]?.selectStart();
			} else {
				lines.at(-1)?.selectEnd();
			}
		});
		editor.focus();
	};

	/**
	 * The menu's delete button: the whole menu goes, words and all, and the
	 * caret to the line after it, or before it, or a new one if the page
	 * would otherwise be left with nothing. Not a menu that is someone
	 * else's surprise, which has no button (it cannot be seen to delete).
	 */
	const deleteMenu = (event: MouseEvent): boolean => {
		const button =
			event.target instanceof Element
				? event.target.closest<HTMLElement>(`.${DELETE_MENU_CLASS}`)
				: null;
		const menuElement = button?.closest<HTMLElement>('.scene-menu');
		if (!(button && menuElement && editor.isEditable())) {
			return false;
		}
		event.preventDefault();
		const viewer = sceneViewerOf(editor);
		editor.update(() => {
			const menu = getNearestNodeFromDOMNode(menuElement);
			if (!isMenuNode(menu) || isSurpriseFor(menu.getHiddenFrom(), viewer)) {
				return;
			}
			const next = menu.getNextSibling();
			const previous = menu.getPreviousSibling();
			menu.remove();
			if (next) {
				next.selectStart();
			} else if (previous) {
				previous.selectEnd();
			} else {
				const line = createParagraphNode();
				getRoot().append(line);
				line.select();
			}
		});
		editor.focus();
		return true;
	};

	/**
	 * The menu's link button: the page is asked to copy and show its link
	 * (`MenuLinkPopover.svelte`). Dispatched from the click itself, so the
	 * clipboard write that answers it still counts as the click's. For
	 * anyone who can see the menu, writer or not: a link changes nothing.
	 */
	const linkMenu = (event: MouseEvent): boolean => {
		const button =
			event.target instanceof Element
				? event.target.closest<HTMLElement>(`.${MENU_LINK_CLASS}`)
				: null;
		const menuId = button?.closest<HTMLElement>('.scene-menu')?.dataset.menuId;
		if (!(button && menuId)) {
			return false;
		}
		event.preventDefault();
		button.dispatchEvent(
			new CustomEvent<MenuLinkRequest>(MENU_LINK_EVENT, {
				bubbles: true,
				detail: { menuId, anchor: button }
			})
		);
		return true;
	};

	/** One of a menu's row of pictures tapped: the page is asked to offer the others. */
	const pickPicture = (event: MouseEvent): boolean => {
		const button =
			event.target instanceof Element
				? event.target.closest<HTMLElement>(`button.${PICTURE_CLASS}`)
				: null;
		const menuElement = button?.closest<HTMLElement>('.scene-menu');
		if (!(button && menuElement && editor.isEditable())) {
			return false;
		}
		event.preventDefault();
		const place = Number(button.dataset.place ?? 0);
		const request = editor.read(() => {
			const menu = getNearestNodeFromDOMNode(menuElement);
			if (!isMenuNode(menu)) {
				return null;
			}
			const design = menuDesign(menu.getDesign());
			return design.pictures
				? {
						kind: 'picture' as const,
						place,
						key: menu.getKey(),
						design: design.id,
						current: button.dataset.art ?? '',
						label: design.pictures.label,
						choices: design.pictures.choices
					}
				: null;
		});
		if (request) {
			button.dispatchEvent(
				new CustomEvent<MenuArtRequest>(MENU_ART_EVENT, {
					bubbles: true,
					detail: { ...request, anchor: button }
				})
			);
		}
		return true;
	};

	/** A menu's mascot tapped: the page is asked to offer the others. */
	const pickMascot = (event: MouseEvent): boolean => {
		const button =
			event.target instanceof Element
				? event.target.closest<HTMLElement>(`button.${MASCOT_CLASS}`)
				: null;
		const menuElement = button?.closest<HTMLElement>('.scene-menu');
		if (!(button && menuElement && editor.isEditable())) {
			return false;
		}
		event.preventDefault();
		const request = editor.read(() => {
			const menu = getNearestNodeFromDOMNode(menuElement);
			if (!isMenuNode(menu)) {
				return null;
			}
			const design = menuDesign(menu.getDesign());
			return design.mascot
				? {
						kind: 'mascot' as const,
						key: menu.getKey(),
						design: design.id,
						current: button.dataset.art ?? '',
						label: design.mascot.label,
						choices: design.mascot.choices
					}
				: null;
		});
		if (request) {
			button.dispatchEvent(
				new CustomEvent<MenuArtRequest>(MENU_ART_EVENT, {
					bubbles: true,
					detail: { ...request, anchor: button }
				})
			);
		}
		return true;
	};

	/** A course's picture tapped: the page is asked to offer the others. */
	const pick = (event: MouseEvent) => {
		if (linkMenu(event) || deleteMenu(event) || pickMascot(event) || pickPicture(event)) {
			return;
		}
		const button =
			event.target instanceof Element
				? event.target.closest<HTMLElement>(`.${COURSE_ART_CLASS}`)
				: null;
		const courseElement = button?.parentElement;
		if (!(button && courseElement && editor.isEditable())) {
			return;
		}
		event.preventDefault();
		const request = editor.read(() => {
			const course = getNearestNodeFromDOMNode(courseElement);
			const menu = course?.getParent();
			if (!(isMenuCourseNode(course) && isMenuNode(menu))) {
				return null;
			}
			const design = menuDesign(menu.getDesign());
			return design.courseArt
				? {
						kind: 'course' as const,
						key: course.getKey(),
						design: design.id,
						current: button.dataset.art ?? '',
						label: design.courseArt.label,
						choices: design.courseArt.choices
					}
				: null;
		});
		if (request) {
			button.dispatchEvent(
				new CustomEvent<MenuArtRequest>(MENU_ART_EVENT, {
					bubbles: true,
					detail: { ...request, anchor: button }
				})
			);
		}
	};

	return mergeRegister(
		editor.registerUpdateListener(markCaret),
		editor.registerEditableListener(markCaret),
		editor.registerRootListener((root, previous) => {
			previous?.removeEventListener('mousedown', press);
			previous?.removeEventListener('click', pick);
			root?.addEventListener('mousedown', press);
			root?.addEventListener('click', pick);
		}),
		() => marked?.classList.remove('caret-in')
	);
}

/**
 * A menu's words that can be rewritten on it: its title, its subtitle, what
 * its rating and number mean (in its key) and its design's copy.
 */
const FRAME_TEXT = '.menu-title, .menu-subtitle, .menu-key-label, .menu-copy';

/** What a frame text is: which of a menu's words it holds. */
type FrameText =
	| { kind: 'title'; element: HTMLElement }
	| { kind: 'subtitle'; element: HTMLElement }
	| { kind: 'scale'; element: HTMLElement }
	| { kind: 'value'; element: HTMLElement }
	| { kind: 'copy'; key: string; element: HTMLElement };

function frameTextOf(target: EventTarget | null): FrameText | null {
	const element = target instanceof Element ? target.closest<HTMLElement>(FRAME_TEXT) : null;
	if (!element?.isContentEditable) {
		return null;
	}
	if (element.classList.contains('menu-copy')) {
		return { kind: 'copy', key: element.dataset.copy ?? '', element };
	}
	if (element.classList.contains('menu-key-label')) {
		return element.closest('.menu-key-scale')
			? { kind: 'scale', element }
			: { kind: 'value', element };
	}
	return element.classList.contains('menu-title')
		? { kind: 'title', element }
		: { kind: 'subtitle', element };
}

/**
 * The events Lexical would otherwise take from a frame text: typing,
 * pasting, the pointer, focus. Each is stopped on its way down, at the root,
 * before Lexical's own listeners there see it; the text then edits itself
 * as any `contenteditable` does. Lexical already leaves the selection alone
 * while one has focus (`$isSelectionCapturedInDecoratorInput`).
 */
const FRAME_TEXT_EVENTS = [
	'keydown',
	'keyup',
	'keypress',
	'beforeinput',
	'input',
	'paste',
	'cut',
	'copy',
	'drop',
	'dragstart',
	'compositionstart',
	'compositionupdate',
	'compositionend',
	'pointerdown',
	'mousedown',
	'click',
	'focusin',
	'focusout'
] as const;

/**
 * A menu's title, its subtitle and its design's copy are written on the menu
 * itself: tapped and typed in, each a little `contenteditable` of its own
 * inside the frame, which Lexical does not draw or edit. What is typed is
 * the menu's at once, so the options' fields follow it and so does the
 * partner. An emptied title or subtitle is the design's again (an emptied
 * subtitle is gone, unless the design has one), shown as soon as it is
 * left; while it is being typed in, the design's shows as a placeholder.
 * Rewritten copy, and a title or subtitle of the menu's own where the design
 * has one, can be put back with the Reset floating beside it.
 */
function registerFrameText(editor: LexicalEditor): () => void {
	let editing: (FrameText & { menuKey: string }) | null = null;

	const markEditable = () => {
		const root = editor.getRootElement();
		const editable = editor.isEditable();
		for (const text of root?.querySelectorAll<HTMLElement>(
			`.scene-menu:not(.surprise) :is(${FRAME_TEXT})`
		) ?? []) {
			const wanted = editable ? 'true' : 'false';
			if (text.contentEditable !== wanted) {
				text.contentEditable = wanted;
				text.spellcheck = false;
			}
		}
	};

	const menuElementOf = (element: HTMLElement) => element.closest<HTMLElement>('.scene-menu');
	const resetOf = (element: HTMLElement) =>
		menuElementOf(element)?.querySelector<HTMLElement>(`:scope > .${RESET_COPY_CLASS}`) ?? null;

	/** The design's words for a frame text, and whether the menu has its own instead. */
	const original = (text: FrameText, menuKey: string) =>
		editor.read(() => {
			const menu = $getNodeByKey(menuKey);
			if (!isMenuNode(menu)) {
				return null;
			}
			const design = menuDesign(menu.getDesign());
			const heading = menu.getHeading();
			// A name in the key is the menu's own; the design has none to go back to.
			if (text.kind === 'scale' || text.kind === 'value') {
				return { text: text.kind === 'scale' ? 'Rating' : 'Number', own: false };
			}
			if (text.kind === 'title') {
				return { text: designTitle(design, menu.getMascot()), own: heading.title !== '' };
			}
			if (text.kind === 'subtitle') {
				return {
					text: design.subtitle ?? '',
					own: heading.subtitle !== '' && Boolean(design.subtitle)
				};
			}
			return {
				text: design.copy?.find((copy) => copy.key === text.key)?.text ?? '',
				own: menu.getCopy()[design.id]?.[text.key] !== undefined
			};
		});

	/** Shows the Reset beside the text being edited when it has words of its own, or hides it. */
	const placeReset = () => {
		const reset = editing ? resetOf(editing.element) : null;
		const now = editing && original(editing, editing.menuKey);
		if (!(reset && editing && now?.own)) {
			for (const shown of editor
				.getRootElement()
				?.querySelectorAll<HTMLElement>(`.${RESET_COPY_CLASS}:popover-open`) ?? []) {
				shown.hidePopover();
			}
			return;
		}
		const at = editing.element.getBoundingClientRect();
		// Unclamped: scrolled out of view, it goes with its words.
		reset.style.top = `${at.top - 30}px`;
		reset.style.left = `${Math.max(4, at.right - 56)}px`;
		if (!reset.matches(':popover-open')) {
			reset.showPopover();
		}
	};

	/** Writes what a frame text says to its menu. */
	const write = (text: FrameText, menuKey: string, words: string | null) => {
		editAside(editor, () => {
			const menu = $getNodeByKey(menuKey);
			if (!isMenuNode(menu)) {
				return;
			}
			if (text.kind === 'copy') {
				const design = menuDesign(menu.getDesign());
				menu.setCopy(withMenuCopy(menu.getCopy(), design, text.key, words));
				return;
			}
			// Emptied, still on: rated or numbered, unexplained, as the
			// options' field has it.
			if (text.kind === 'scale' || text.kind === 'value') {
				menu.setExtras({ [text.kind]: (words ?? '').trim().slice(0, MAX_EXTRA_LABEL) });
				return;
			}
			const limit = text.kind === 'title' ? MAX_MENU_TITLE : MAX_MENU_SUBTITLE;
			menu.setHeading({
				[text.kind]: (words ?? '').trim() === '' ? '' : (words ?? '').slice(0, limit)
			});
		});
	};

	/** Moves the page's selection into the menu, without moving the caret out of the text. */
	const selectMenu = (menuKey: string) => {
		const viewer = sceneViewerOf(editor);
		editAside(editor, () => {
			const menu = $getNodeByKey(menuKey);
			const selection = getSelection();
			const inMenu =
				isRangeSelection(selection) &&
				isMenuNode(menu) &&
				rootChildOf(selection.anchor.getNode())?.is(menu);
			if (isMenuNode(menu) && !inMenu) {
				visibleLines(menu, viewer)[0]?.selectStart();
			}
		});
	};

	const keyOfMenu = (element: HTMLElement): string | null => {
		const menuElement = menuElementOf(element);
		return menuElement
			? editor.read(() => {
					const node = getNearestNodeFromDOMNode(menuElement);
					return isMenuNode(node) ? node.getKey() : null;
				})
			: null;
	};

	const onEvent = (event: Event) => {
		const target = event.target instanceof HTMLElement ? event.target : null;
		if (target?.classList.contains(RESET_COPY_CLASS)) {
			event.stopPropagation();
			if (event.type === 'mousedown' || event.type === 'pointerdown') {
				// Keeps the focus in the text being edited.
				event.preventDefault();
			}
			if (event.type === 'click' && editing) {
				const back = original(editing, editing.menuKey);
				write(editing, editing.menuKey, null);
				fillCopy(editing.element, back?.text ?? '');
				globalThis.getSelection()?.selectAllChildren(editing.element);
				globalThis.getSelection()?.collapseToEnd();
				target.hidePopover();
			}
			return;
		}
		const text = frameTextOf(event.target);
		if (!text) {
			return;
		}
		event.stopPropagation();
		const menuKey = editing?.element === text.element ? editing.menuKey : keyOfMenu(text.element);
		if (!menuKey) {
			return;
		}
		switch (event.type) {
			case 'focusin': {
				editing = { ...text, menuKey };
				text.element.dataset.placeholder = original(text, menuKey)?.text ?? '';
				selectMenu(menuKey);
				placeReset();
				break;
			}
			case 'focusout': {
				editing = null;
				placeReset();
				// Drawn again now it is left: an emptied one as the design's.
				editAside(editor, () => {
					$getNodeByKey(menuKey)?.markDirty();
				});
				break;
			}
			case 'input': {
				// Emptied, a contenteditable can keep a <br> behind, which would
				// stop it matching `:empty` and showing its placeholder.
				if (text.element.textContent === '' && text.element.firstChild) {
					text.element.replaceChildren();
				}
				write(text, menuKey, copyTextOf(text.element));
				if (!(event as InputEvent).isComposing) {
					redrawCopy(text.element);
				}
				// After the write has landed, to know whether it is the design's.
				queueMicrotask(placeReset);
				break;
			}
			case 'keydown': {
				const { key, shiftKey, metaKey, ctrlKey } = event as KeyboardEvent;
				// A design's copy takes as many lines as someone types, unless
				// another would break the design (`MenuCopy.oneLine`).
				if (key === 'Enter' && text.kind === 'copy' && !('oneLine' in text.element.dataset)) {
					event.preventDefault();
					newCopyLine(text.element);
					write(text, menuKey, copyTextOf(text.element));
					queueMicrotask(placeReset);
					break;
				}
				// One line each: Enter and Escape are done with it.
				if (key === 'Escape' || (key === 'Enter' && !shiftKey)) {
					event.preventDefault();
					text.element.blur();
					editor.focus();
				}
				// Select all is this text's all, not the page's: the browser
				// selects the whole editor around it, and typing then replaced
				// the menu.
				if (key.toLowerCase() === 'a' && (metaKey || ctrlKey)) {
					event.preventDefault();
					globalThis.getSelection()?.selectAllChildren(text.element);
				}
				break;
			}
			case 'beforeinput': {
				const { inputType } = event as InputEvent;
				if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
					event.preventDefault();
				}
				break;
			}
			case 'paste': {
				// Plain words only, and on one line unless it is copy that
				// takes more (as Enter does, above).
				event.preventDefault();
				const pasted = (event as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
				const lines = text.kind === 'copy' && !('oneLine' in text.element.dataset);
				const range = globalThis.getSelection()?.getRangeAt(0);
				if (range && text.element.contains(range.startContainer)) {
					range.deleteContents();
					const words = document.createTextNode(
						lines ? pasted.replace(/\r\n?/g, '\n') : pasted.replace(/\s*\n\s*/g, ' ')
					);
					range.insertNode(words);
					range.setStartAfter(words);
					range.collapse(true);
					write(text, menuKey, copyTextOf(text.element));
					redrawCopy(text.element);
				}
				break;
			}
			default:
		}
	};

	// The Reset floats over the page (a popover), so it is moved with the
	// words it is for whenever they move: the page scrolled (anything that
	// scrolls, hence capture), the window resized, or the page's own width
	// changed under it, as when the panel beside it opens.
	const follow = () => {
		if (editing) {
			placeReset();
		}
	};
	const resized = new ResizeObserver(follow);
	document.addEventListener('scroll', follow, { capture: true, passive: true });
	globalThis.addEventListener('resize', follow);

	/**
	 * A press anywhere else in the editor leaves the words being written on
	 * the frame. The browser would move the focus itself, but a press on a
	 * menu's frame is taken by `registerMenuCaret`, which cancels it to put
	 * the caret where it wants it, and cancelling a press keeps the focus
	 * where it was: in the title, on a menu's own page, wherever was pressed.
	 * Not the Reset, which is pressed to act on those words.
	 */
	const leave = (event: MouseEvent) => {
		const target = event.target instanceof Node ? event.target : null;
		if (
			editing &&
			target &&
			!editing.element.contains(target) &&
			!(target instanceof Element && target.closest(`.${RESET_COPY_CLASS}`))
		) {
			editing.element.blur();
		}
	};

	return mergeRegister(
		editor.registerRootListener((root, previous) => {
			previous?.removeEventListener('mousedown', leave, true);
			root?.addEventListener('mousedown', leave, true);
			for (const type of FRAME_TEXT_EVENTS) {
				previous?.removeEventListener(type, onEvent, true);
				root?.addEventListener(type, onEvent, true);
			}
			if (previous) {
				resized.unobserve(previous);
			}
			if (root) {
				resized.observe(root);
			}
			markEditable();
		}),
		() => {
			resized.disconnect();
			document.removeEventListener('scroll', follow, { capture: true });
			globalThis.removeEventListener('resize', follow);
		},
		editor.registerEditableListener(markEditable),
		editor.registerMutationListener(MenuNode, markEditable, { skipInitialization: false }),
		() => {
			editing = null;
		}
	);
}

/**
 * A design's copy drawn again as it is typed, as `fillCopy` draws it: for
 * copy that is fields (`MenuCopy.fields`), split again, so a colon typed or
 * deleted moves the line's label with it, since the browser only ever types
 * into the span the caret is in; for any copy, with the line break that
 * shows a last line just started, and without it once that line has words.
 * Redrawn only when it differs, and the caret put back at the same place in
 * the words.
 */
function redrawCopy(words: HTMLElement): void {
	const text = copyTextOf(words);
	const redrawn = words.cloneNode() as HTMLElement;
	fillCopy(redrawn, text);
	if (redrawn.isEqualNode(words)) {
		return;
	}
	const at = caretOffset(words);
	words.replaceChildren(...redrawn.childNodes);
	if (at !== null) {
		placeCaret(words, at);
	}
}

/**
 * A new line in a design's copy, where the caret is, in place of anything
 * selected; the caret goes to its start.
 */
function newCopyLine(words: HTMLElement): void {
	const start = caretOffset(words, 'start');
	const end = caretOffset(words, 'end');
	if (start === null || end === null) {
		return;
	}
	const text = copyTextOf(words);
	fillCopy(words, `${text.slice(0, start)}\n${text.slice(end)}`);
	placeCaret(words, start + 1);
}

/** Where the caret (or a selection's `edge`) is in a copy's words, counted as `copyTextOf` counts them. */
function caretOffset(words: HTMLElement, edge: 'start' | 'end' = 'start'): number | null {
	const selection = globalThis.getSelection();
	const caret = selection?.rangeCount ? selection.getRangeAt(0) : null;
	if (!(caret && words.contains(caret.startContainer) && words.contains(caret.endContainer))) {
		return null;
	}
	const before = document.createRange();
	before.selectNodeContents(words);
	if (edge === 'start') {
		before.setEnd(caret.startContainer, caret.startOffset);
	} else {
		before.setEnd(caret.endContainer, caret.endOffset);
	}
	// A partly selected line clones as a line, so it counts as one.
	const held = document.createElement('span');
	held.append(before.cloneContents());
	return copyTextOf(held).length;
}

/** Puts the caret `at` characters into a copy's words, as `caretOffset` counts them. */
function placeCaret(words: HTMLElement, at: number): void {
	const lines = words.querySelectorAll(`:scope > .${COPY_LINE_CLASS}`);
	let left = at;
	// Plain copy is one run of text, its line breaks characters in it.
	for (const line of lines.length > 0 ? lines : [words]) {
		const size = (line.textContent ?? '').replaceAll(HOLD_OPEN, '').length;
		if (left <= size) {
			const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
			let last: Text | null = null;
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				last = node as Text;
				// Right after a label's colon the caret stays in the label:
				// anything typed there is moved into the value by the next split.
				if (left <= last.length) {
					globalThis.getSelection()?.collapse(last, left);
					return;
				}
				left -= last.length;
			}
			globalThis.getSelection()?.collapse(last ?? line, last ? last.length : 0);
			return;
		}
		left -= size + 1;
	}
}

/**
 * Every menu has an id of its own (`MenuNode.__menuId`), for its link: one
 * from before links gets one, and a copy of a menu (a paste, an undo of a
 * delete beside a copy) gets a new one, the first in the scene keeping its.
 *
 * In an update of its own after the one that showed the problem, not a
 * transform: `@lexical/yjs` sends nothing a transform changes during an
 * update that came from another writer, which is how a scene from before
 * links arrives, so a transform's id would stay on this device alone. Only
 * a writer gives ids; two writers giving one at once settle on one of them,
 * as Yjs settles any property both set.
 */
function registerMenuIds(editor: LexicalEditor): () => void {
	const check = () => {
		if (!editor.isEditable()) {
			return;
		}
		const lacking = editor.getEditorState().read(() => menusLackingIds().length > 0);
		if (lacking) {
			editor.update(() => {
				for (const menu of menusLackingIds()) {
					menu.setMenuId(crypto.randomUUID());
				}
			});
		}
	};
	return mergeRegister(
		editor.registerUpdateListener(check),
		editor.registerEditableListener(check)
	);
}

/** The scene's menus with no id, or with one an earlier menu already has. */
function menusLackingIds(): MenuNode[] {
	const seen = new Set<string>();
	const lacking: MenuNode[] = [];
	for (const child of getRoot().getChildren()) {
		if (!isMenuNode(child)) {
			continue;
		}
		const id = child.getMenuId();
		if (id === null || seen.has(id)) {
			lacking.push(child);
		} else {
			seen.add(id);
		}
	}
	return lacking;
}

export function registerSceneBlocks(editor: LexicalEditor): () => void {
	return mergeRegister(
		registerTransforms(editor),
		registerMenuIds(editor),
		registerDesignRedraw(editor),
		registerMenuCaret(editor),
		registerFrameText(editor),
		registerEnter(editor),
		registerBackspace(editor),
		registerCheckBackspace(editor),
		registerSurpriseGuard(editor)
	);
}

/** The class on the editor's root while it shows one menu alone (`registerOnlyMenu`). */
export const MENU_PAGE_CLASS = 'menu-page';

/** The class on the one menu a menu's page shows. */
export const ONLY_MENU_CLASS = 'only-menu';

/**
 * A menu's own page (docs/scenes.md, "A menu's own page"): the editor holds
 * the whole scene, which is what it is bound to, but shows only the menu
 * with `menuId`, and keeps every edit inside it. `onFound` hears whether the
 * menu is there, on every change to that: it can be deleted, or arrive late.
 *
 * Register it before the scene is applied (`NotebookSession.attach`): until
 * then the editor is empty and the menu is nowhere, which is not the same as
 * gone. So nothing is said until the first update after this one has been
 * made, which carries the scene with it when it is applied straight after.
 *
 * Kept inside it by refusing what would reach past its edges, rather than
 * by trusting that nothing can: the rest of the scene is out of sight, and
 * changing what nobody can see is how a page of one menu would lose a
 * scene's words. The caret is brought back if it leaves (an arrow key past
 * the last line), a selection past either end is cut to the menu (select
 * all), and Enter, Backspace and Delete at its edges, which would take a
 * line out of it or bring one in, do nothing.
 */
export function registerOnlyMenu(
	editor: LexicalEditor,
	menuId: string,
	onFound: (found: boolean) => void
): () => void {
	let shown: HTMLElement | null = null;
	let found: boolean | null = null;
	let settled = false;

	const $menu = (): MenuNode | null => {
		for (const child of getRoot().getChildren()) {
			if (isMenuNode(child) && child.getMenuId() === menuId) {
				return child;
			}
		}
		return null;
	};

	const mark = () => {
		const key = editor.getEditorState().read(() => $menu()?.getKey() ?? null);
		const element = key ? editor.getElementByKey(key) : null;
		if (element !== shown) {
			shown?.classList.remove(ONLY_MENU_CLASS, 'caret-in');
			element?.classList.add(ONLY_MENU_CLASS);
			shown = element;
		}
		// The menu is all there is to write in here, so while it can be
		// edited it is always the one being written in, wherever the caret
		// is, and never otherwise (`registerMenuCaret` leaves it alone).
		shown?.classList.toggle('caret-in', editor.isEditable());
		if (settled && found !== (key !== null)) {
			found = key !== null;
			onFound(found);
		}
	};

	/** Brings a selection that reaches out of the menu back inside it. */
	const keepInside = () => {
		if (!editor.isEditable()) {
			return;
		}
		const outside = editor.getEditorState().read(() => {
			const selection = getSelection();
			const menu = $menu();
			return (
				isRangeSelection(selection) &&
				menu !== null &&
				!(isInside(selection.anchor.getNode(), menu) && isInside(selection.focus.getNode(), menu))
			);
		});
		if (!outside) {
			return;
		}
		editor.update(() => {
			const selection = getSelection();
			const menu = $menu();
			if (!(isRangeSelection(selection) && menu)) {
				return;
			}
			for (const point of [selection.anchor, selection.focus]) {
				const node = point.getNode();
				if (!isInside(node, menu)) {
					// A point on the root itself (select all) is before the menu
					// when it is at or before the menu's place among the root's
					// children.
					const before = isRootNode(node)
						? point.offset <= menu.getIndexWithinParent()
						: (rootChildOf(node)?.isBefore(menu) ?? false);
					const edge = $menuEdge(menu, before ? 'start' : 'end');
					point.set(edge.key, edge.offset, edge.type);
				}
			}
		});
	};

	/** Whether the caret is on the menu's first or last line, at its very edge. */
	const atEdge = (edge: 'start' | 'end'): boolean => {
		const selection = getSelection();
		const menu = $menu();
		if (!(isRangeSelection(selection) && selection.isCollapsed() && menu)) {
			return false;
		}
		const point = $menuEdge(menu, edge);
		const line = selection.anchor.getNode().getTopLevelElement();
		const edgeLine = $getNodeByKey(point.key)?.getTopLevelElement();
		if (!(line && edgeLine && line.is(edgeLine))) {
			return false;
		}
		const words = line.getTextContent();
		return edge === 'start'
			? selection.anchor.offset === 0 &&
					(selection.anchor.getNode().is(line) ||
						selection.anchor.getNode().is(line.getFirstDescendant()))
			: words.length === 0 ||
					(selection.anchor.getNode().is(line.getLastDescendant()) &&
						selection.anchor.offset === selection.anchor.getNode().getTextContentSize());
	};

	const refuse = (when: () => boolean) => (event: KeyboardEvent | null) => {
		if (!when()) {
			return false;
		}
		event?.preventDefault();
		return true;
	};

	editor.update(() => undefined, {
		onUpdate: () => {
			settled = true;
			mark();
		}
	});

	return mergeRegister(
		() => {
			shown?.classList.remove(ONLY_MENU_CLASS, 'caret-in');
		},
		editor.registerEditableListener(mark),
		editor.registerRootListener((root, previous) => {
			previous?.classList.remove(MENU_PAGE_CLASS);
			root?.classList.add(MENU_PAGE_CLASS);
		}),
		editor.registerUpdateListener(() => {
			mark();
			keepInside();
		}),
		editor.registerCommand(
			INSERT_PARAGRAPH_COMMAND,
			() => {
				// Only the Enter that would leave the menu: an empty last line.
				const selection = getSelection();
				const menu = $menu();
				if (!(isRangeSelection(selection) && menu && selection.isCollapsed())) {
					return false;
				}
				const line = selection.anchor.getNode().getTopLevelElement();
				const last = $getNodeByKey($menuEdge(menu, 'end').key)?.getTopLevelElement();
				return Boolean(line && last && line.is(last) && line.getTextContentSize() === 0);
			},
			COMMAND_PRIORITY_NORMAL
		),
		editor.registerCommand(
			KEY_BACKSPACE_COMMAND,
			refuse(() => atEdge('start')),
			COMMAND_PRIORITY_NORMAL
		),
		editor.registerCommand(
			KEY_DELETE_COMMAND,
			refuse(() => atEdge('end')),
			COMMAND_PRIORITY_NORMAL
		)
	);
}

/** Whether `node` is `menu` or inside it. */
function isInside(node: LexicalNode, menu: MenuNode): boolean {
	return rootChildOf(node)?.is(menu) ?? false;
}

/** The point at a menu's very start or end, for a caret brought back into it. */
function $menuEdge(
	menu: MenuNode,
	edge: 'start' | 'end'
): { key: string; offset: number; type: 'text' | 'element' } {
	const node = edge === 'start' ? menu.getFirstDescendant() : menu.getLastDescendant();
	if (isTextNode(node)) {
		return {
			key: node.getKey(),
			offset: edge === 'start' ? 0 : node.getTextContentSize(),
			type: 'text'
		};
	}
	const element = isElementNode(node) ? node : (node?.getParent() ?? menu);
	return {
		key: element.getKey(),
		offset: edge === 'start' ? 0 : element.getChildrenSize(),
		type: 'element'
	};
}

/* ── edits ───────────────────────────────────────────────────────────────── */

/** Where a new block goes: after the root-level block the caret is in, or at the end. */
function placeAfterCaret(node: LexicalNode): void {
	const selection = getSelection();
	const here = isRangeSelection(selection) ? rootChildOf(selection.anchor.getNode()) : null;
	if (here) {
		// An empty line where the caret sits is replaced rather than left above.
		if (isParagraphNode(here) && here.getTextContentSize() === 0) {
			here.replace(node);
			return;
		}
		here.insertAfter(node);
		return;
	}
	getRoot().append(node);
}

function paragraphOf(text: string) {
	const paragraph = createParagraphNode();
	if (text) {
		paragraph.append(createTextNode(text));
	}
	return paragraph;
}

/** A new section after the caret, holding a line of `text`, with the caret at its end. */
export function insertSection(editor: LexicalEditor, section: SceneSection, text = ''): void {
	editor.update(() => {
		const line = paragraphOf(text);
		const block = createSceneSectionNode(section).append(line);
		placeAfterCaret(block);
		line.selectEnd();
	});
	editor.focus();
}

/**
 * Adds a line of `text` to the first section of its kind this viewer can see,
 * or starts one; the caret is left at its end, to carry on typing.
 */
export function addToSection(editor: LexicalEditor, section: SceneSection, text: string): void {
	const viewer = sceneViewerOf(editor);
	let added = false;
	editor.update(() => {
		const existing = getRoot()
			.getChildren()
			.find(
				(child): child is SceneSectionNode =>
					isSceneSectionNode(child) &&
					child.getSection() === section &&
					!isSurpriseFor(child.getHiddenFrom(), viewer)
			);
		if (!existing) {
			return;
		}
		const last = existing.getLastChild();
		const line = paragraphOf(text);
		if (isParagraphNode(last) && last.getTextContentSize() === 0) {
			last.replace(line);
		} else {
			existing.append(line);
		}
		line.selectEnd();
		added = true;
	});
	if (added) {
		editor.focus();
	} else {
		insertSection(editor, section, text);
	}
}

/** A course with a heading and items, for building menus. */
function courseOf(heading: string | null, items: readonly string[]) {
	const course = createMenuCourseNode();
	if (heading !== null) {
		course.append(createMenuLineNode('heading').append(createTextNode(heading)));
	}
	for (const item of items) {
		const line = createMenuLineNode('item');
		if (item) {
			line.append(createTextNode(item));
		}
		course.append(line);
	}
	return course;
}

/** A new menu after the caret: the default courses, each with an empty item, the caret in the first. */
export function insertMenu(editor: LexicalEditor): void {
	editor.update(() => {
		const menu = createMenuNode();
		for (const heading of DEFAULT_COURSES) {
			menu.append(courseOf(heading, ['']));
		}
		placeAfterCaret(menu);
		const first = menu.getFirstChild();
		const item = isElementNode(first) ? first.getLastChild() : null;
		item?.selectStart();
	});
	editor.focus();
}

/**
 * Adds an item to a menu: under the line the caret is on when it is in one,
 * otherwise at the end of the first course of the first menu this viewer can
 * see. Without a menu it is a line of its own, like any other note. An empty
 * item where it would go is filled rather than left.
 */
export function addMenuItem(
	editor: LexicalEditor,
	text: string,
	props: Partial<MenuItemProps> = {}
): void {
	const viewer = sceneViewerOf(editor);
	editor.update(() => {
		const item = createMenuLineNode('item').append(createTextNode(text));
		item.setItemProps(props);
		const selection = getSelection();
		const caretLine = isRangeSelection(selection)
			? selection.anchor.getNode().getTopLevelElement()
			: null;
		let after: MenuLineNode | null = null;
		if (isMenuLineNode(caretLine) && !isInSurprise(caretLine, viewer)) {
			after = caretLine;
		} else {
			const menu = getRoot()
				.getChildren()
				.find(
					(child): child is MenuNode =>
						isMenuNode(child) && !isSurpriseFor(child.getHiddenFrom(), viewer)
				);
			const firstCourse = menu?.getFirstChild();
			const last = isElementNode(firstCourse) ? firstCourse.getLastChild() : null;
			after = isMenuLineNode(last) ? last : null;
		}
		if (!after) {
			placeAfterCaret(paragraphOf(text));
			return;
		}
		if (after.getRole() === 'item' && after.getTextContentSize() === 0) {
			after.replace(item);
		} else {
			after.insertAfter(item);
		}
		item.selectEnd();
	});
	editor.focus();
}

/**
 * The lines a root-level block holds, each with the role it takes in a menu,
 * for turning it into one: a heading starts a course, a subheading stays
 * within one, and everything else is an item.
 */
function linesOf(
	block: LexicalNode
): { role: MenuLineRole; checked: boolean | null; children: LexicalNode[] }[] {
	if (isListNode(block)) {
		// A to-do list's items stay to-dos, ticked as they were.
		const todo = block.getListType() === 'check';
		return block
			.getChildren()
			.filter(isListItemNode)
			.map((item) => ({
				role: 'item',
				checked: todo ? item.getChecked() === true : null,
				children: item.getChildren().filter((child) => !isListNode(child))
			}));
	}
	if (isHeadingNode(block)) {
		return [
			{
				role: block.getTag() === 'h2' ? 'heading' : 'subheading',
				checked: null,
				children: block.getChildren()
			}
		];
	}
	if (isElementNode(block)) {
		return [{ role: 'item', checked: null, children: block.getChildren() }];
	}
	return [];
}

/**
 * Turns the selected lines (paragraphs, headings and list items at the top
 * level) into a menu, keeping every word, formatting and link in them. Its
 * courses are where the headings are: each heading starts one, with
 * everything after it up to the next. Lines before the first heading are a
 * course with no heading.
 */
export function selectionToMenu(editor: LexicalEditor): void {
	editor.update(() => {
		const selection = getSelection();
		if (!isRangeSelection(selection)) {
			return;
		}
		const blocks: LexicalNode[] = [];
		for (const node of selection.getNodes()) {
			const block = rootChildOf(node);
			if (
				block &&
				(isParagraphNode(block) || isHeadingNode(block) || isListNode(block)) &&
				!blocks.some((seen) => seen.is(block))
			) {
				blocks.push(block);
			}
		}
		if (blocks.length === 0) {
			return;
		}
		// One course to start with; the transforms divide it at its headings.
		const course = createMenuCourseNode();
		for (const block of blocks) {
			for (const { role, checked, children } of linesOf(block)) {
				course.append(
					createMenuLineNode(role)
						.setChecked(checked)
						.append(...children)
				);
			}
		}
		const menu = createMenuNode().append(course);
		blocks[0]?.insertBefore(menu);
		for (const block of blocks) {
			block.remove();
		}
		menu.selectEnd();
	});
}

/**
 * Turns a block back into ordinary text, where it was. A section's lines are
 * kept as they are; a menu's headings and subheadings become headings, and its items a
 * bulleted list under each (a to-do list for its to-dos, ticked as they
 * were), each with its details written out, so nothing
 * set on it is lost.
 */
export function blockToText(editor: LexicalEditor, key: string): void {
	editor.update(() => {
		const block = $getNodeByKey(key);
		if (isSceneSectionNode(block)) {
			const children = block.getChildren();
			for (const child of children) {
				block.insertBefore(child);
			}
			block.remove();
			return;
		}
		if (!isMenuNode(block)) {
			return;
		}
		const design = menuDesign(block.getDesign());
		const extras = block.getExtras();
		const out: ElementNode[] = [];
		for (const course of block.getChildren()) {
			let list: ReturnType<typeof createListNode> | null = null;
			for (const line of isElementNode(course) ? course.getChildren() : []) {
				if (!isMenuLineNode(line)) {
					continue;
				}
				const role = line.getRole();
				if (role !== 'item') {
					list = null;
					out.push(createHeadingNode(HEADING_TAGS[role]).append(...line.getChildren()));
					continue;
				}
				// A to-do item goes into a to-do list, ticked as it was, and the
				// items either side of a change of kind into lists of their own.
				const checked = line.getChecked();
				const kind = checked === null ? 'bullet' : 'check';
				if (list?.getListType() !== kind) {
					list = createListNode(kind);
					out.push(list);
				}
				const item = createListItemNode(checked ?? undefined).append(...line.getChildren());
				const written = itemExtrasText(line.getItemProps(), extras, design.value);
				if (written) {
					item.append(createTextNode(written));
				}
				list.append(item);
			}
		}
		for (const node of out) {
			block.insertBefore(node);
		}
		block.remove();
	});
}

/**
 * Hides a block or a menu item from the partner, or shows it again. Only the
 * viewer who hid something can show it: the partner's screen never offers it,
 * and this refuses to touch what is hidden from the viewer.
 */
export function setHidden(editor: LexicalEditor, key: string, hiddenFrom: string | null): void {
	const viewer = sceneViewerOf(editor);
	editor.update(() => {
		const node = $getNodeByKey(key);
		if (isHideableSceneNode(node) && !isInSurprise(node, viewer)) {
			(node as HideableSceneNode).setHiddenFrom(hiddenFrom);
		}
	});
}

/**
 * The edits made from outside the page's text, in the menu's options or a
 * question beside an item, are made without putting the page's selection
 * back on screen: doing that moves focus to the page, out of the field being
 * typed in, after every key. Each changes the menu or line in place, so the
 * selection on screen is still right.
 */
function editAside(editor: LexicalEditor, edit: () => void): void {
	editor.update(() => {
		addUpdateTag(SKIP_DOM_SELECTION_TAG);
		edit();
	});
}

/** Sets a menu's own title or subtitle; an empty title is the design's. */
export function setMenuHeading(
	editor: LexicalEditor,
	key: string,
	heading: Partial<MenuHeading>
): void {
	editAside(editor, () => {
		const node = $getNodeByKey(key);
		if (isMenuNode(node)) {
			node.setHeading(heading);
		}
	});
}

/** Turns a menu's rating or number on (with its name) or off (null). */
export function setMenuExtras(
	editor: LexicalEditor,
	key: string,
	extras: Partial<MenuExtras>
): void {
	editAside(editor, () => {
		const node = $getNodeByKey(key);
		if (isMenuNode(node)) {
			node.setExtras(extras);
		}
	});
}

/** Sets the picture a course shows on a design. */
export function setCourseArt(
	editor: LexicalEditor,
	key: string,
	design: MenuDesignId,
	choice: string
): void {
	editAside(editor, () => {
		const node = $getNodeByKey(key);
		if (isMenuCourseNode(node)) {
			node.setArt({ ...node.getArt(), [design]: choice });
		}
	});
}

/** A menu's mascot on `design`, one of the design's (`MenuDesign.mascot`). */
export function setMenuMascot(
	editor: LexicalEditor,
	key: string,
	design: MenuDesignId,
	choice: string
): void {
	editAside(editor, () => {
		const node = $getNodeByKey(key);
		if (isMenuNode(node)) {
			node.setMascot({ ...node.getMascot(), [design]: choice });
		}
	});
}

/** One of a menu's row of pictures on `design`, at `place`, one of the design's (`MenuDesign.pictures`). */
export function setMenuPicture(
	editor: LexicalEditor,
	key: string,
	design: MenuDesignId,
	place: number,
	choice: string
): void {
	editAside(editor, () => {
		const node = $getNodeByKey(key);
		if (isMenuNode(node)) {
			const pictures = node.getPictures();
			node.setPictures({ ...pictures, [design]: { ...pictures[design], [String(place)]: choice } });
		}
	});
}

export function setDesign(editor: LexicalEditor, key: string, design: MenuDesignId): void {
	editor.update(() => {
		const node = $getNodeByKey(key);
		if (isMenuNode(node)) {
			node.setDesign(design);
		}
	});
}

export function setLineRole(editor: LexicalEditor, key: string, role: MenuLineRole): void {
	editor.update(() => {
		const node = $getNodeByKey(key);
		if (isMenuLineNode(node)) {
			node.setRole(role);
		}
	});
}

export function setItemProps(
	editor: LexicalEditor,
	key: string,
	props: Partial<MenuItemProps>
): void {
	editAside(editor, () => {
		const node = $getNodeByKey(key);
		if (isMenuLineNode(node)) {
			node.setItemProps(props);
		}
	});
}

/* ── reading ─────────────────────────────────────────────────────────────── */

/**
 * The page's text without anything hidden: for this viewer, what they can
 * see (so the prompt column never notices a kink in a partner's surprise and
 * gives it away); with no viewer, without anything hidden from anyone (the
 * header's excerpt, which both partners' lists show).
 */
export function visibleText(editor: LexicalEditor, viewerId: string | null | 'anyone'): string {
	return editor.getEditorState().read(() => {
		const parts: string[] = [];
		const walk = (node: LexicalNode) => {
			if (isHideableSceneNode(node)) {
				const hidden = node.getHiddenFrom();
				if (viewerId === 'anyone' ? hidden !== null : isSurpriseFor(hidden, viewerId)) {
					return;
				}
			}
			if (isElementNode(node)) {
				for (const child of node.getChildren()) {
					walk(child);
				}
				if (!node.isInline()) {
					parts.push('\n');
				}
				return;
			}
			parts.push(node.getTextContent());
		};
		walk(getRoot());
		return parts.join('').replace(/\n+/g, '\n').trim();
	});
}

/* ── story ───────────────────────────────────────────────────────────────── */

/** The first Story section this viewer can see, made at the caret if there is none. */
function storySection(viewer: string | null): SceneSectionNode {
	const existing = getRoot()
		.getChildren()
		.find(
			(child): child is SceneSectionNode =>
				isSceneSectionNode(child) &&
				child.getSection() === 'story' &&
				!isSurpriseFor(child.getHiddenFrom(), viewer)
		);
	if (existing) {
		return existing;
	}
	const section = createSceneSectionNode('story');
	placeAfterCaret(section);
	return section;
}

/**
 * Sets a phrase on one of the Story section's labelled lines ("Where: …"):
 * `toggle` adds it, or takes it out if it is there, as a daydream's chips
 * do; `add` only adds. A line that is not there yet is added, so a chip
 * works however much of the story has been rewritten by hand.
 */
export function setStoryLine(
	editor: LexicalEditor,
	line: StoryLine,
	phrase: string,
	mode: 'toggle' | 'add' = 'toggle'
): void {
	const viewer = sceneViewerOf(editor);
	editor.update(() => {
		const section = storySection(viewer);
		const existing = section
			.getChildren()
			.find(
				(child) => isParagraphNode(child) && storyLineValue(line, child.getTextContent()) !== null
			);
		if (isParagraphNode(existing)) {
			const value = storyLineValue(line, existing.getTextContent()) ?? '';
			const next = mode === 'add' && hasChip(value, phrase) ? value : toggleChip(value, phrase);
			existing.clear().append(createTextNode(storyLineText(line, next)));
			existing.selectEnd();
			return;
		}
		const added = paragraphOf(storyLineText(line, phrase));
		// Kept in the catalogue's order, so a story reads the same way round
		// however its lines were added.
		const after = section
			.getChildren()
			.filter(
				(child) =>
					isParagraphNode(child) &&
					STORY_LINES.slice(0, STORY_LINES.indexOf(line)).some(
						(earlier) => storyLineValue(earlier, child.getTextContent()) !== null
					)
			)
			.at(-1);
		const empty = section
			.getChildren()
			.find((child) => isParagraphNode(child) && child.getTextContentSize() === 0);
		if (empty) {
			empty.replace(added);
		} else if (after) {
			after.insertAfter(added);
		} else {
			const first = section.getFirstChild();
			if (first) {
				first.insertBefore(added);
			} else {
				section.append(added);
			}
		}
		added.selectEnd();
	});
	editor.focus();
}

/** A ready-made story: each of its lines added to the Story section. */
export function addStoryStarter(
	editor: LexicalEditor,
	lines: Partial<Record<StoryLine, string>>
): void {
	for (const line of STORY_LINES) {
		const value = lines[line];
		if (value) {
			setStoryLine(editor, line, value, 'add');
		}
	}
}

/** What each of the Story section's lines says now, for the chips to show which are in. */
export function storyValues(editor: LexicalEditor): Partial<Record<StoryLine, string>> {
	const viewer = sceneViewerOf(editor);
	return editor.getEditorState().read(() => {
		const values: Partial<Record<StoryLine, string>> = {};
		const section = getRoot()
			.getChildren()
			.find(
				(child): child is SceneSectionNode =>
					isSceneSectionNode(child) &&
					child.getSection() === 'story' &&
					!isSurpriseFor(child.getHiddenFrom(), viewer)
			);
		for (const child of section?.getChildren() ?? []) {
			for (const line of STORY_LINES) {
				const value = storyLineValue(line, child.getTextContent());
				if (value !== null && values[line] === undefined) {
					values[line] = value;
				}
			}
		}
		return values;
	});
}

/** A new menu after the caret, from courses someone (or the model) suggested. */
export function insertMenuFrom(
	editor: LexicalEditor,
	courses: readonly { name: string; items: readonly string[] }[]
): void {
	editor.update(() => {
		const menu = createMenuNode();
		for (const course of courses) {
			menu.append(courseOf(course.name, course.items));
		}
		if (menu.getChildrenSize() === 0) {
			return;
		}
		placeAfterCaret(menu);
		menu.selectEnd();
	});
	editor.focus();
}
