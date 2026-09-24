import { registerRichText } from '@lexical/rich-text';
import {
	createEditor,
	$createLineBreakNode as createLineBreakNode,
	$createNodeSelection as createNodeSelection,
	$createParagraphNode as createParagraphNode,
	$createTextNode as createTextNode,
	type ElementFormatType,
	$getRoot as getRoot,
	$getSelection as getSelection,
	$isElementNode as isElementNode,
	$isNodeSelection as isNodeSelection,
	$isRangeSelection as isRangeSelection,
	$isTextNode as isTextNode,
	KEY_ARROW_DOWN_COMMAND,
	KEY_ARROW_LEFT_COMMAND,
	KEY_ARROW_RIGHT_COMMAND,
	KEY_ARROW_UP_COMMAND,
	type LexicalEditor,
	type LexicalNode,
	type NodeKey,
	type Spread,
	$setSelection as setSelection
} from 'lexical';
import { afterEach, describe, expect, it } from 'vitest';
import {
	DecoratorBlockNode,
	$isDecoratorBlockNode as isDecoratorBlockNode,
	type SerializedDecoratorBlockNode
} from '$lib/lexical/nodes/decorator-block';
import { registerDecoratorBlockSelection } from '$lib/lexical/plugins/decorator-block-selection';
import {
	$markBlockContinuation as markBlockContinuation,
	registerMendSplitBlocks
} from '$lib/lexical/transformers/mend-split-blocks';

/**
 * What a decorator block does in this editor, driven by a block that is not the
 * URL embed.
 *
 * That is the point of the file. The embed is the only block the app has
 * today, and rules written against the only instance of a thing have a way of
 * quietly depending on it. `TestBlockNode` has no URL, no preview and no
 * component; if a case here passes, the behaviour belongs to blocks rather
 * than to embeds.
 *
 * The composer's own tests cover the same behaviour arriving through the real
 * editor and a real embed, and the Playwright suite covers what only a browser
 * knows: where a caret is actually drawn, and where a line move really lands.
 *
 * Named `.svelte.test.ts` despite holding no component: that suffix is what
 * puts a file in the browser project, and an editor with no DOM under it is not
 * an editor — see AGENTS.md.
 */

type SerializedTestBlock = Spread<{ label: string }, SerializedDecoratorBlockNode>;

class TestBlockNode extends DecoratorBlockNode<string> {
	__label: string;

	static getType(): string {
		return 'test-block';
	}

	static clone(node: TestBlockNode): TestBlockNode {
		return new TestBlockNode(node.__label, node.__format, node.__key);
	}

	static importJSON(serialised: SerializedTestBlock): TestBlockNode {
		return new TestBlockNode(serialised.label).updateFromJSON(serialised);
	}

	constructor(label: string, format?: ElementFormatType, key?: NodeKey) {
		super(format, key);
		this.__label = label;
	}

	override getBlockClass(): string {
		return 'test-block';
	}

	getBlockLabel(): string {
		return this.__label;
	}

	override updateDOM(): boolean {
		return false;
	}

	decorate(): string {
		return this.__label;
	}

	override exportJSON(): SerializedTestBlock {
		return { ...super.exportJSON(), label: this.__label };
	}
}

/* ── a document, built rather than parsed ──────────────────────────────── */

type Build = () => LexicalNode;

const text =
	(value: string): Build =>
	() =>
		createTextNode(value);
const br: Build = () => createLineBreakNode();
const block =
	(label = 'a block'): Build =>
	() =>
		new TestBlockNode(label);
const paragraph =
	(...children: Build[]): Build =>
	() => {
		const node = createParagraphNode();
		for (const child of children) {
			node.append(child());
		}
		return node;
	};

const mounted: (() => void)[] = [];

afterEach(() => {
	for (const teardown of mounted.splice(0)) {
		teardown();
	}
});

/**
 * A real editor over a real element, holding `blocks`.
 *
 * `registerRichText` is here too, because half of what is being checked is
 * that these handlers get in front of it — and the other half is that they
 * hand the key back to it when the press is not theirs.
 */
function withDocument(...contents: Build[]): { editor: LexicalEditor; element: HTMLElement } {
	const element = document.createElement('div');
	// A surface that is not editable in the DOM is not the ancestor every press
	// inside the editor really has.
	element.setAttribute('contenteditable', 'true');
	document.body.append(element);

	const editor = createEditor({
		namespace: 'block-test',
		nodes: [TestBlockNode],
		onError: (error) => {
			throw error;
		}
	});
	const teardown = [
		registerRichText(editor),
		registerDecoratorBlockSelection(editor),
		registerMendSplitBlocks(editor)
	];
	editor.setRootElement(element);
	editor.update(
		() => {
			const root = getRoot();
			root.clear();
			for (const build of contents) {
				root.append(build());
			}
		},
		{ discrete: true }
	);

	mounted.push(() => {
		for (const off of teardown) {
			off();
		}
		editor.setRootElement(null);
		element.remove();
	});
	return { editor, element };
}

/** Every block in the document, in order. Inside a `read` or an `update`. */
function blocks(): LexicalNode[] {
	// Root children: a block is a block in the editor, and one found inside a
	// paragraph would be the bug this whole arrangement exists to avoid.
	return getRoot().getChildren().filter(isDecoratorBlockNode);
}

/**
 * Commits whatever is pending.
 *
 * A dispatched command runs its handlers there and then but commits on a
 * microtask, so the editor state a test reads straight afterwards is the one
 * from before the press. An empty discrete update flushes the queue.
 */
function settle(editor: LexicalEditor): void {
	editor.update(
		() => {
			// Nothing to change: committing is the point.
		},
		{ discrete: true }
	);
}

/** Where the selection is, in one line, for comparing whole cases at a time. */
function _describeSelection(editor: LexicalEditor): string {
	settle(editor);
	return editor.getEditorState().read(() => {
		const selection = getSelection();
		if (isNodeSelection(selection)) {
			const [node] = selection.getNodes();
			return `node(${node?.getType()}#${node?.getIndexWithinParent()})`;
		}
		if (!isRangeSelection(selection)) {
			return 'none';
		}
		const { anchor } = selection;
		return anchor.type === 'element'
			? `element@${anchor.offset}`
			: `text(${anchor.getNode().getTextContent()})@${anchor.offset}`;
	});
}

/** The label of the block that is the selection, if one is. */
function selectedBlockLabel(editor: LexicalEditor): string | null {
	settle(editor);
	return editor.getEditorState().read(() => {
		const selection = getSelection();
		if (!isNodeSelection(selection)) {
			return null;
		}
		const selected = selection.getNodes().find(isDecoratorBlockNode);
		return selected?.getBlockLabel() ?? null;
	});
}

const arrow = (editor: LexicalEditor, key: 'Left' | 'Right' | 'Up' | 'Down') => {
	const command = {
		Left: KEY_ARROW_LEFT_COMMAND,
		Right: KEY_ARROW_RIGHT_COMMAND,
		Up: KEY_ARROW_UP_COMMAND,
		Down: KEY_ARROW_DOWN_COMMAND
	}[key];
	editor.dispatchCommand(command, new KeyboardEvent('keydown', { key: `Arrow${key}` }));
};

const _selectFirstBlock = (editor: LexicalEditor) =>
	editor.update(
		() => {
			const [found] = blocks();
			if (found) {
				const selection = createNodeSelection();
				selection.add(found.getKey());
				setSelection(selection);
			}
		},
		{ discrete: true }
	);

/** Selects the first block outright, as arrowing onto one does. */
const selectFirstBlock = (editor: LexicalEditor) =>
	editor.update(
		() => {
			const [found] = blocks();
			if (found) {
				const selection = createNodeSelection();
				selection.add(found.getKey());
				setSelection(selection);
			}
		},
		{ discrete: true }
	);

/** A paragraph marked as the tail of a block a block was cut out of. */
const continuation =
	(...children: Build[]): Build =>
	() => {
		const node = createParagraphNode();
		for (const child of children) {
			node.append(child());
		}
		markBlockContinuation(node);
		return node;
	};

/**
 * The text of the block the caret is in.
 *
 * Which block, rather than which point: Lexical normalises the point it leaves
 * after stepping off a decorator — sometimes the element, sometimes the text
 * inside it — and the two are the same place on screen.
 */
function caretBlock(editor: LexicalEditor): string {
	settle(editor);
	return editor.getEditorState().read(() => {
		const selection = getSelection();
		if (!isRangeSelection(selection)) {
			return 'not a caret';
		}
		const node = selection.anchor.getNode();
		const line = isElementNode(node) ? node : node.getParent();
		return line?.getTextContent() ?? 'nowhere';
	});
}

/** The root's children, as one line, with line breaks shown. */
function blockShape(editor: LexicalEditor): string {
	settle(editor);
	return editor.getEditorState().read(() =>
		getRoot()
			.getChildren()
			.map((child) => {
				if (!isElementNode(child)) {
					return child.getType();
				}
				const inner = child
					.getChildren()
					.map((node) => (isTextNode(node) ? node.getTextContent() : '⏎'))
					.join('');
				return `${child.getType()}(${inner})`;
			})
			.join(' / ')
	);
}

/* ── the rules ─────────────────────────────────────────────────────────── */

describe('blocks in the document', () => {
	/**
	 * The arrow keys are Lexical's, and this is the case that says so.
	 *
	 * A block is a block decorator at the root, which is the shape every one of
	 * Lexical's decorator paths is written for: `RangeSelection.modify` lands on
	 * it and converts to a node selection, and stepping off goes to the block
	 * next door. None of that reaches a decorator that is inline, or one that
	 * sits inside a paragraph, which is why this editor keeps blocks at the
	 * root — see `$mendSplitBlocks`.
	 */
	it('hands the arrow keys to Lexical', () => {
		const { editor } = withDocument(paragraph(text('above')), block(), paragraph(text('below')));

		editor.update(
			() => {
				const first = getRoot().getFirstChild();
				if (!isElementNode(first)) {
					throw new Error('expected a paragraph');
				}
				first.selectEnd();
			},
			{ discrete: true }
		);

		// Down onto it, down off it, and back up — the same number of presses
		// each way, with the block selected in between.
		arrow(editor, 'Down');
		expect(selectedBlockLabel(editor)).toBe('a block');
		arrow(editor, 'Down');
		expect(caretBlock(editor)).toBe('below');
		arrow(editor, 'Up');
		expect(selectedBlockLabel(editor)).toBe('a block');

		// And sideways, which is the direction the caret used to warp in.
		arrow(editor, 'Right');
		expect(caretBlock(editor)).toBe('below');
		arrow(editor, 'Left');
		expect(selectedBlockLabel(editor)).toBe('a block');
		arrow(editor, 'Left');
		expect(caretBlock(editor)).toBe('above');
	});

	/**
	 * A block that opens the document has nothing above it, so up and left do
	 * nothing at all rather than offering a row that is not there.
	 *
	 * Lexical would put a block cursor above it — right in the middle of a
	 * document, where it is the place you type to add a line beside a block, and
	 * wrong at the top of a message, where it reads as a line the writer cannot
	 * see and did not make.
	 */
	it('stays put when there is nothing above the block', () => {
		const { editor } = withDocument(block(), paragraph(text('below')));
		selectFirstBlock(editor);

		arrow(editor, 'Up');
		expect(selectedBlockLabel(editor)).toBe('a block');
		arrow(editor, 'Left');
		expect(selectedBlockLabel(editor)).toBe('a block');

		// And with something above it, the press is Lexical's again.
		const second = withDocument(paragraph(text('above')), block(), paragraph(text('below')));
		selectFirstBlock(second.editor);
		arrow(second.editor, 'Up');
		expect(caretBlock(second.editor)).toBe('above');
	});

	/**
	 * Putting a block in the middle of a paragraph cuts the paragraph in two,
	 * and taking the block away has to put it back together.
	 *
	 * Otherwise removing an embed silently turns one paragraph into two: the
	 * writer's line break becomes a paragraph break, the spacing changes, and
	 * nothing they did says so. The cut half is marked when it is made, and this
	 * is what reads the mark.
	 */
	it('mends the block a block was cut out of when the block goes', () => {
		// The head carries no trailing line break: the cut takes it out, because
		// the paragraph boundary separates the lines while the block is there.
		// Joining is what puts it back.
		const { editor } = withDocument(paragraph(text('hello')), block(), continuation(text('world')));

		editor.update(
			() => {
				const [found] = blocks();
				found?.remove();
			},
			{ discrete: true }
		);

		expect(blockShape(editor)).toBe('paragraph(hello⏎world)');
	});

	/**
	 * The same, when the writer empties the far half rather than the block. The
	 * line the block had to itself becomes an empty line, which is what the
	 * writer's own break left behind.
	 */
	it('mends it when the block is the last thing left', () => {
		const { editor } = withDocument(paragraph(text('hello')), block(), continuation());

		editor.update(
			() => {
				const [found] = blocks();
				found?.remove();
			},
			{ discrete: true }
		);

		expect(blockShape(editor)).toBe('paragraph(hello⏎)');
	});

	/**
	 * A boundary the writer made is not ours to undo. Descriptions are the same
	 * editor with Enter making paragraphs, so a block sitting between two real
	 * paragraphs must leave them as two when it goes.
	 */
	it('leaves a boundary the writer made alone', () => {
		const { editor } = withDocument(paragraph(text('first')), block(), paragraph(text('second')));

		editor.update(
			() => {
				const [found] = blocks();
				found?.remove();
			},
			{ discrete: true }
		);

		expect(blockShape(editor)).toBe('paragraph(first) / paragraph(second)');
	});

	/**
	 * A press on a block selects it, the way an arrow key onto it does.
	 *
	 * Clicking a thing is how a pointer says which one it means. Without this a
	 * press did nothing at all — a block's content takes no pointer events, so
	 * the caret simply stayed where it was and the block read as wallpaper.
	 */
	it('selects the block a press lands on', () => {
		const { editor, element } = withDocument(paragraph(text('look'), br, block(), text('after')));
		const target = element.querySelector('.decorator-block');
		if (!target) {
			throw new Error('expected a block element');
		}

		const press = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
		target.dispatchEvent(press);

		expect(selectedBlockLabel(editor)).toBe('a block');
		expect(target.classList.contains('is-selected')).toBe(true);
		// The caret is hidden through the root element, because a node selection
		// leaves the browser parking one at the top of the field.
		expect(element.classList.contains('block-selected')).toBe(true);
		// And the press is taken, so it never reaches the contenteditable and
		// drops the caret on the undrawable point beside the block.
		expect(press.defaultPrevented).toBe(true);
	});

	/**
	 * Except over something that has presses of its own. A button inside a
	 * block — the embed's remove button is one — has to keep them, and a frame
	 * is a document of its own that the editor has no business selecting over.
	 */
	it('leaves a press alone over a button or a frame', () => {
		const { editor, element } = withDocument(paragraph(text('look'), br, block(), text('after')));
		const target = element.querySelector('.decorator-block');
		if (!target) {
			throw new Error('expected a block element');
		}

		const button = document.createElement('button');
		const frame = document.createElement('iframe');
		// Given a known box, so the presses below land inside or outside it for
		// certain rather than by the browser's default iframe size.
		frame.getBoundingClientRect = () =>
			({ left: 10, top: 10, right: 60, bottom: 50, width: 50, height: 40 }) as DOMRect;
		target.append(button, frame);

		button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
		expect(selectedBlockLabel(editor)).toBe(null);

		target.dispatchEvent(
			new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 30, clientY: 30 })
		);
		expect(selectedBlockLabel(editor)).toBe(null);

		// The same press outside the frame's box does select it.
		target.dispatchEvent(
			new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 4, clientY: 4 })
		);
		expect(selectedBlockLabel(editor)).toBe('a block');
	});
});
