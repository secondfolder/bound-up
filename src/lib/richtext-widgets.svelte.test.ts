import { afterEach, describe, expect, it } from 'vitest';
import {
	$createLineBreakNode as createLineBreakNode,
	$createNodeSelection as createNodeSelection,
	$createParagraphNode as createParagraphNode,
	$createTextNode as createTextNode,
	$getRoot as getRoot,
	$getSelection as getSelection,
	$isElementNode as isElementNode,
	$isNodeSelection as isNodeSelection,
	$isRangeSelection as isRangeSelection,
	$isTextNode as isTextNode,
	$setSelection as setSelection,
	KEY_ARROW_DOWN_COMMAND,
	KEY_ARROW_LEFT_COMMAND,
	KEY_ARROW_RIGHT_COMMAND,
	KEY_ARROW_UP_COMMAND,
	createEditor,
	type LexicalEditor,
	type LexicalNode,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread
} from 'lexical';
import { registerRichText } from '@lexical/rich-text';
import {
	$isWidgetNode as isWidgetNode,
	$selectWidgetAheadOfCaret as selectWidgetAheadOfCaret,
	WidgetNode,
	registerWidgetSelection
} from '$lib/richtext-widgets';

/**
 * The caret rules for a widget — a decorator that is inline in the model and a
 * block on screen — driven by a widget that is not the URL embed.
 *
 * That is the point of the file. The embed is the only widget the app has
 * today, and rules written against the only instance of a thing have a way of
 * quietly depending on it. `TestWidgetNode` has no URL, no preview and no
 * component; if a case here passes, the behaviour belongs to widgets rather
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

type SerializedTestWidget = Spread<{ label: string }, SerializedLexicalNode>;

class TestWidgetNode extends WidgetNode<string> {
	__label: string;

	static getType(): string {
		return 'test-widget';
	}

	static clone(node: TestWidgetNode): TestWidgetNode {
		return new TestWidgetNode(node.__label, node.__key);
	}

	static importJSON(serialised: SerializedTestWidget): TestWidgetNode {
		return new TestWidgetNode(serialised.label).updateFromJSON(serialised);
	}

	constructor(label: string, key?: NodeKey) {
		super(key);
		this.__label = label;
	}

	getWidgetClass(): string {
		return 'test-widget';
	}

	getWidgetLabel(): string {
		return this.__label;
	}

	updateDOM(): boolean {
		return false;
	}

	decorate(): string {
		return this.__label;
	}

	exportJSON(): SerializedTestWidget {
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
const widget =
	(label = 'a widget'): Build =>
	() =>
		new TestWidgetNode(label);
const paragraph =
	(...children: Build[]): Build =>
	() => {
		const node = createParagraphNode();
		for (const child of children) node.append(child());
		return node;
	};

const mounted: (() => void)[] = [];

afterEach(() => {
	for (const teardown of mounted.splice(0)) teardown();
});

/**
 * A real editor over a real element, holding `blocks`.
 *
 * `registerRichText` is here too, because half of what is being checked is
 * that these handlers get in front of it — and the other half is that they
 * hand the key back to it when the press is not theirs.
 */
function withDocument(...blocks: Build[]): { editor: LexicalEditor; element: HTMLElement } {
	const element = document.createElement('div');
	// A surface that is not editable in the DOM is not the ancestor every press
	// inside the editor really has.
	element.setAttribute('contenteditable', 'true');
	document.body.append(element);

	const editor = createEditor({
		namespace: 'widget-test',
		nodes: [TestWidgetNode],
		onError: (error) => {
			throw error;
		}
	});
	const teardown = [registerRichText(editor), registerWidgetSelection(editor)];
	editor.setRootElement(element);
	editor.update(
		() => {
			const root = getRoot();
			root.clear();
			for (const block of blocks) root.append(block());
		},
		{ discrete: true }
	);

	mounted.push(() => {
		for (const off of teardown) off();
		editor.setRootElement(null);
		element.remove();
	});
	return { editor, element };
}

/** Every widget in the document, in order. Inside a `read` or an `update`. */
function widgets(): LexicalNode[] {
	return getRoot()
		.getChildren()
		.flatMap((block) => (isElementNode(block) ? block.getChildren() : []))
		.filter(isWidgetNode);
}

/**
 * Commits whatever is pending.
 *
 * A dispatched command runs its handlers there and then but commits on a
 * microtask, so the editor state a test reads straight afterwards is the one
 * from before the press. An empty discrete update flushes the queue.
 */
function settle(editor: LexicalEditor): void {
	editor.update(() => {}, { discrete: true });
}

/** Where the selection is, in one line, for comparing whole cases at a time. */
function describeSelection(editor: LexicalEditor): string {
	settle(editor);
	return editor.getEditorState().read(() => {
		const selection = getSelection();
		if (isNodeSelection(selection)) {
			const node = selection.getNodes()[0];
			return `node(${node?.getType()}#${node?.getIndexWithinParent()})`;
		}
		if (!isRangeSelection(selection)) return 'none';
		const { anchor } = selection;
		return anchor.type === 'element'
			? `element@${anchor.offset}`
			: `text(${anchor.getNode().getTextContent()})@${anchor.offset}`;
	});
}

/** The label of the widget that is the selection, if one is. */
function selectedWidgetLabel(editor: LexicalEditor): string | null {
	settle(editor);
	return editor.getEditorState().read(() => {
		const selection = getSelection();
		if (!isNodeSelection(selection)) return null;
		const widget = selection.getNodes().find(isWidgetNode);
		return widget?.getWidgetLabel() ?? null;
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

/** Selects the `index`th widget outright, as arrowing onto one does. */
const selectWidget = (editor: LexicalEditor, index: number) =>
	editor.update(
		() => {
			const found = widgets()[index];
			if (!found) throw new Error(`no widget ${index}`);
			const selection = createNodeSelection();
			selection.add(found.getKey());
			setSelection(selection);
		},
		{ discrete: true }
	);

/* ── the rules ─────────────────────────────────────────────────────────── */

describe('widget selection', () => {
	/**
	 * Where the left arrow puts the caret when it steps off a selected widget.
	 *
	 * Never the point directly in front of it, which is a perfectly good model
	 * position that nothing draws a caret for — the widget is a block, so there
	 * is no line box in front of it to put one in. Landing there made the press
	 * look like it did nothing and the press after it look like a jump, which
	 * is what "the caret warps to the end of the message" turned out to be.
	 * Each case below is the nearest position that is actually drawn.
	 */
	it('steps left off a selected widget to somewhere a caret can be drawn', () => {
		const cases = [
			{
				what: 'the end of the line above',
				doc: [paragraph(text('look'), br, widget(), text('after'))],
				expected: 'text(look)@4'
			},
			{
				what: 'an empty line above, which has a line box of its own',
				doc: [paragraph(text('tree'), br, br, widget(), text('after'))],
				expected: 'element@2'
			},
			{
				what: 'the widget stacked in front of it',
				doc: [paragraph(widget('first'), widget('second'), text('after'))],
				expected: 'node(test-widget#0)'
			},
			{
				// The paragraph shape of an empty line, which is what Enter makes
				// outside the message composer and what a pasted blank line gives.
				what: 'the empty paragraph above',
				doc: [paragraph(text('hi')), paragraph(), paragraph(widget(), text('after'))],
				expected: 'element@0'
			},
			{
				// Nothing is to the left of a widget that opens the document, so the
				// press does nothing at all and the widget stays selected. Letting
				// the key through instead is what sent the caret to the end.
				what: 'nowhere, because it opens the document',
				doc: [paragraph(widget(), text('after'))],
				expected: 'node(test-widget#0)'
			}
		];

		for (const { what, doc, expected } of cases) {
			const { editor } = withDocument(...doc);
			selectWidget(
				editor,
				editor.getEditorState().read(() => widgets().length - 1)
			);
			arrow(editor, 'Left');
			expect(`${what}: ${describeSelection(editor)}`).toBe(`${what}: ${expected}`);
		}
	});

	/**
	 * And the same positions to the right, which is where the down arrow goes
	 * too: a widget stacked below, or the start of the row under it.
	 */
	it('steps right and down off a selected widget onto the row below', () => {
		const cases = [
			{
				what: 'the start of the line below',
				doc: [paragraph(text('look'), br, widget(), text('after'))],
				expected: 'text(after)@0'
			},
			{
				what: 'the empty line below',
				doc: [paragraph(widget(), br, br, text('after'))],
				expected: 'element@2'
			},
			{
				// Two widgets on one line stack, and the row below the first is the
				// second — not the point between them, which is the same undrawable
				// spot in new clothes.
				what: 'the widget stacked below it',
				doc: [paragraph(widget('first'), widget('second'), text('after'))],
				expected: 'node(test-widget#1)'
			},
			{
				what: 'the paragraph below',
				doc: [paragraph(widget()), paragraph(text('below'))],
				expected: 'text(below)@0'
			}
		];

		for (const key of ['Right', 'Down'] as const) {
			for (const { what, doc, expected } of cases) {
				const { editor } = withDocument(...doc);
				selectWidget(editor, 0);
				arrow(editor, key);
				expect(`${key} to ${what}: ${describeSelection(editor)}`).toBe(
					`${key} to ${what}: ${expected}`
				);
			}
		}
	});

	/**
	 * The point in front of a widget, approached from the other side.
	 *
	 * Stepping right onto the widget's row selects the widget instead of
	 * stopping in front of it, so the way back takes the same number of presses
	 * as the way out. Browsers disagree about whether that spot is a caret stop
	 * at all, which is how it was reported: left off the embed and straight
	 * back right again landed beside it rather than on it.
	 */
	it('steps right onto the widget rather than stopping in front of it', () => {
		/** Puts the caret at the end of the first block's first text child. */
		const endOfFirstLine = () => {
			const block = getRoot().getFirstChild();
			const first = isElementNode(block) ? block.getFirstChild() : null;
			if (!isTextNode(first)) throw new Error('expected the block to open with text');
			first.select(first.getTextContentSize(), first.getTextContentSize());
		};
		const pointInFirstBlock = (offset: number) => () => {
			const block = getRoot().getFirstChild();
			if (!isElementNode(block)) throw new Error('expected a paragraph');
			block.select(offset, offset);
		};
		const endOfBlock = (index: number) => () => {
			const block = getRoot().getChildren()[index];
			if (!isElementNode(block)) throw new Error(`no block ${index}`);
			block.selectEnd();
		};

		// hi / (blank) / [widget] / after, all in one paragraph.
		const blankLine = [paragraph(text('hi'), br, br, widget(), text('after'))];
		// The same thing written as paragraphs, which is what Enter makes outside
		// the message composer and what a pasted blank line produces.
		const blankParagraph = [paragraph(text('hi')), paragraph(), paragraph(widget(), text('after'))];

		const cases = [
			// Where the left arrow leaves the caret when it steps off the widget —
			// so this is the press that has to bring it back.
			{
				what: 'from the end of the line above',
				doc: [paragraph(text('look'), br, widget(), text('after'))],
				place: endOfFirstLine
			},
			{
				what: 'from the end of the line above an empty one',
				doc: blankLine,
				place: endOfFirstLine
			},
			// The same neighbourhood as an element point, which is the other shape
			// the selection takes there depending on what last touched it.
			{ what: 'from the empty line above', doc: blankLine, place: pointInFirstBlock(2) },
			// And from the spot itself, reachable with the mouse if not the keyboard.
			{ what: 'from directly in front of it', doc: blankLine, place: pointInFirstBlock(3) },
			// Across a paragraph boundary, including an empty paragraph of its own.
			{ what: 'from the empty paragraph above', doc: blankParagraph, place: endOfBlock(1) }
		];

		for (const { what, doc, place } of cases) {
			const { editor } = withDocument(...doc);
			editor.update(place, { discrete: true });
			arrow(editor, 'Right');
			expect(`${what}: ${selectedWidgetLabel(editor)}`).toBe(`${what}: a widget`);
		}

		/**
		 * And it keeps out of the way of everything that is not that step. The
		 * second empty line matters: only one break is crossed, so a caret two
		 * lines above the widget still has a line of its own to visit first.
		 */
		const negatives = [
			{ what: 'with text ahead of it', doc: blankLine, place: pointInFirstBlock(0) },
			{
				what: 'two empty lines above the widget',
				doc: [paragraph(text('hi'), br, br, br, widget(), text('after'))],
				place: endOfFirstLine
			},
			{ what: 'a paragraph above an ordinary one', doc: blankParagraph, place: endOfBlock(0) }
		];

		for (const { what, doc, place } of negatives) {
			const { editor } = withDocument(...doc);
			let handled: boolean | null = null;
			editor.update(
				() => {
					place();
					handled = selectWidgetAheadOfCaret();
				},
				{ discrete: true }
			);
			expect(`${what}: ${handled}`).toBe(`${what}: false`);
		}
	});

	/**
	 * Up and down, across the row a widget keeps to itself.
	 *
	 * The widget is a block, so it takes a row of its own on screen — but in
	 * the model it is a line-mate of whatever follows it, and its row holds no
	 * text position at all. A line move over it therefore lands on the row
	 * beyond, which is how it was reported: up from the line under an embed
	 * jumped to the line over it.
	 *
	 * The browser probe that keeps this away from a wrapped line runs here too,
	 * through the real `Selection.modify` — but nothing on these one-line
	 * surfaces wraps, so it agrees with the model. The wrapping half is a
	 * Playwright matter; what is checked here is which widget the model picks,
	 * and when it picks none.
	 */
	it('selects the widget on the row a line move steps onto', () => {
		const afterTheWidget = (offset: number) => () => {
			const block = getRoot().getChildren().at(-1);
			const after = isElementNode(block) ? block.getChildren().at(-1) : null;
			if (!isTextNode(after)) throw new Error('expected text after the widget');
			after.select(offset, offset);
		};
		const pointInFirstBlock = (offset: number) => () => {
			const block = getRoot().getFirstChild();
			if (!isElementNode(block)) throw new Error('expected a paragraph');
			block.select(offset, offset);
		};
		const endOfBlock = (index: number) => () => {
			const block = getRoot().getChildren()[index];
			if (!isElementNode(block)) throw new Error(`no block ${index}`);
			block.selectEnd();
		};

		const blankLine = [paragraph(text('hi'), br, br, widget(), text('after'))];
		const blankParagraph = [paragraph(text('hi')), paragraph(), paragraph(widget(), text('after'))];

		const cases = [
			// Up, from the row directly under the widget — the reported case. The
			// caret's line *is* the widget's in the model: they are siblings.
			{ what: 'up from the start of the row under it', doc: blankLine, place: afterTheWidget(0) },
			{ what: 'up from further along that row', doc: blankLine, place: afterTheWidget(3) },
			{ what: 'up across a paragraph boundary', doc: blankParagraph, place: afterTheWidget(0) },
			// Down, which has to be the same move backwards or the widget is
			// reachable from one side only.
			{ what: 'down from the empty line above', doc: blankLine, place: pointInFirstBlock(2) },
			{ what: 'down from the empty paragraph above', doc: blankParagraph, place: endOfBlock(1) }
		];

		for (const { what, doc, place } of cases) {
			const { editor } = withDocument(...doc);
			editor.update(place, { discrete: true });
			arrow(editor, what.startsWith('up') ? 'Up' : 'Down');
			expect(`${what}: ${selectedWidgetLabel(editor)}`).toBe(`${what}: a widget`);
		}

		// And the moves that are not that one: the row either way is an ordinary
		// line, so the press belongs to the browser.
		const negatives = [
			{
				what: 'down onto the empty line',
				doc: blankLine,
				place: pointInFirstBlock(0),
				key: 'Down'
			},
			{
				what: 'down onto an ordinary paragraph',
				doc: blankParagraph,
				place: endOfBlock(0),
				key: 'Down'
			},
			{ what: 'up from the line above it', doc: blankLine, place: pointInFirstBlock(2), key: 'Up' }
		] as const;

		for (const { what, doc, place, key } of negatives) {
			const { editor, element } = withDocument(...doc);
			editor.update(place, { discrete: true });
			arrow(editor, key);
			settle(editor);
			const marked = element.querySelector('.richtext-widget.is-selected');
			expect(`${what}: ${marked !== null}`).toBe(`${what}: false`);
		}
	});

	/**
	 * A press on a widget selects it, the way an arrow key onto it does.
	 *
	 * Clicking a thing is how a pointer says which one it means. Without this a
	 * press did nothing at all — a widget's content takes no pointer events, so
	 * the caret simply stayed where it was and the widget read as wallpaper.
	 */
	it('selects the widget a press lands on', () => {
		const { editor, element } = withDocument(paragraph(text('look'), br, widget(), text('after')));
		const target = element.querySelector('.richtext-widget');
		if (!target) throw new Error('expected a widget element');

		const press = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
		target.dispatchEvent(press);

		expect(selectedWidgetLabel(editor)).toBe('a widget');
		expect(target.classList.contains('is-selected')).toBe(true);
		// The caret is hidden through the root element, because a node selection
		// leaves the browser parking one at the top of the field.
		expect(element.classList.contains('widget-selected')).toBe(true);
		// And the press is taken, so it never reaches the contenteditable and
		// drops the caret on the undrawable point beside the widget.
		expect(press.defaultPrevented).toBe(true);
	});

	/**
	 * Except over something that has presses of its own. A button inside a
	 * widget — the embed's remove button is one — has to keep them, and a frame
	 * is a document of its own that the editor has no business selecting over.
	 */
	it('leaves a press alone over a button or a frame', () => {
		const { editor, element } = withDocument(paragraph(text('look'), br, widget(), text('after')));
		const target = element.querySelector('.richtext-widget');
		if (!target) throw new Error('expected a widget element');

		const button = document.createElement('button');
		const frame = document.createElement('iframe');
		// Given a known box, so the presses below land inside or outside it for
		// certain rather than by the browser's default iframe size.
		frame.getBoundingClientRect = () =>
			({ left: 10, top: 10, right: 60, bottom: 50, width: 50, height: 40 }) as DOMRect;
		target.append(button, frame);

		button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
		expect(selectedWidgetLabel(editor)).toBe(null);

		target.dispatchEvent(
			new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 30, clientY: 30 })
		);
		expect(selectedWidgetLabel(editor)).toBe(null);

		// The same press outside the frame's box does select it.
		target.dispatchEvent(
			new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 4, clientY: 4 })
		);
		expect(selectedWidgetLabel(editor)).toBe('a widget');
	});
});
