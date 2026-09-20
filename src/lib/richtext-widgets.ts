import {
	$createNodeSelection,
	$getEditor,
	$getNearestNodeFromDOMNode,
	$getRoot,
	$getSelection,
	$isElementNode,
	$isLineBreakNode,
	$isNodeSelection,
	$isRangeSelection,
	$isTextNode,
	$setSelection,
	COMMAND_PRIORITY_LOW,
	DecoratorNode,
	KEY_ARROW_DOWN_COMMAND,
	KEY_ARROW_LEFT_COMMAND,
	KEY_ARROW_RIGHT_COMMAND,
	KEY_ARROW_UP_COMMAND,
	SELECTION_CHANGE_COMMAND,
	type LexicalEditor,
	type LexicalNode,
	type PointType
} from 'lexical';
import { mergeRegister } from '@lexical/utils';

/**
 * Widgets: the things in a document that are objects rather than characters.
 *
 * A widget is a `DecoratorNode` that is **inline in the model and a block on
 * screen** — it lives inside a paragraph, among the text, but takes a row to
 * itself when it is drawn. The URL embed is the first one; a poll, an image, a
 * quoted message would all be the same shape.
 *
 * That shape is forced rather than chosen. A paragraph's line breaks are
 * `LineBreakNode`s, not paragraph boundaries — in the composer Enter sends, so
 * a whole message is usually one paragraph full of them — and something that
 * belongs to *a line* has to live inside the paragraph that holds the line.
 * Lexical's own machinery for decorators is written for the other kind, the
 * block-level node that is a sibling of paragraphs: `registerRichText` selects
 * those on a click, steps on and off them with the arrow keys, and gives them
 * a block cursor either side. Every one of those paths tests `!isInline()`
 * first, so none of it reaches a widget, and `$needsBlockCursorBeside` never
 * fires for one either.
 *
 * Which leaves the caret. A widget's row holds no text position at all, and
 * the model points immediately either side of it are drawn by nothing — there
 * is no line box beside a block to put a caret in. Left alone, Lexical parks
 * the caret on those points and browsers draw it somewhere else entirely, or
 * not at all: reported as the caret warping to the end of the message, as the
 * way back taking one press more than the way out, and as up from the line
 * under an embed jumping to the line over it.
 *
 * So this module is what `registerRichText` would do for a widget if it knew
 * about one: the arrow keys in all four directions, a press to select, and the
 * marking that says a widget is selected when there is no caret to say it. It
 * knows nothing about embeds, and a new widget type gets the lot by extending
 * `WidgetNode` — see `docs/rich-text.md`.
 */

/** On every widget's element, and what the editor's styles hang off. */
const WIDGET_CLASS = 'richtext-widget';

/** On the widget that is selected, if one is. */
const WIDGET_SELECTED_CLASS = 'is-selected';

/**
 * On the editor's root element while a widget is *the* selection.
 *
 * There is no caret then — the node is the selection — but Lexical clears the
 * DOM selection for a node selection and the browser answers by parking one at
 * the very start of the field, which reads as the caret having jumped to the
 * top. The editor hides its caret while this is set.
 */
const WIDGET_SELECTION_CLASS = 'widget-selected';

/**
 * A press over one of these is left alone: it belongs to what is inside it.
 *
 * Tested by geometry rather than by the event's target, because a widget's
 * content is `pointer-events: none` all through — a click in the editor
 * belongs to the editor, not to a video — so every press inside it lands on
 * the widget element and the target says nothing about where.
 */
const PASS_THROUGH = 'iframe';

/** A press on one of these *inside a widget* is that element's business. */
const INTERACTIVE = 'button, a, input, textarea, select, [contenteditable="true"]';

/**
 * The base every widget extends.
 *
 * It exists to say "inline in the model, block on screen" once, and to be the
 * thing `$isWidgetNode` recognises: everything in this module keys off that,
 * not off any particular widget. Subclasses supply what they are called and
 * what they draw.
 */
export abstract class WidgetNode<T> extends DecoratorNode<T> {
	/** A class of the widget's own, for its own styling and for tests to find. */
	abstract getWidgetClass(): string;

	/** What this widget is, for anyone who cannot see it. */
	abstract getWidgetLabel(): string;

	isInline(): true {
		return true;
	}

	/**
	 * An empty element for the host framework to mount the real thing into.
	 *
	 * A `div` inside the paragraph's `<p>`, which is invalid markup a parser
	 * would unnest — but nothing ever parses it. Lexical builds it here and
	 * inserts it programmatically, and the editor's surface is server-rendered
	 * empty. The read-only renderer, whose markup *is* parsed, uses a `span`
	 * for exactly this reason.
	 */
	createDOM(): HTMLElement {
		const wrapper = document.createElement('div');
		wrapper.className = `${WIDGET_CLASS} ${this.getWidgetClass()}`;
		wrapper.setAttribute('contenteditable', 'false');
		wrapper.setAttribute('aria-label', this.getWidgetLabel());
		return wrapper;
	}
}

export function $isWidgetNode(node: LexicalNode | null | undefined): node is WidgetNode<unknown> {
	return node instanceof WidgetNode;
}

/**
 * Wire an editor's widgets up to the keyboard, the pointer and the eye.
 *
 * One registration per editor, alongside `registerRichText` and friends in
 * `createRichTextEditor`. An editor with no widgets in it pays four command
 * handlers that answer "not mine" and nothing else.
 */
export function registerWidgetSelection(editor: LexicalEditor): () => void {
	/**
	 * Marks the selected widgets, and takes the caret off screen while a widget
	 * *is* the selection.
	 *
	 * Classes on the elements rather than props on the mounted components: a
	 * widget's component is its own root, mounted by the host framework, and
	 * passing reactive state into each one to say "you are selected" is a lot of
	 * machinery for one boolean the DOM can carry.
	 *
	 * `marked` is what was marked last time, because the document is not asked
	 * which widgets it holds — only which are selected — and the class has to
	 * come off the ones that no longer are.
	 */
	let marked: string[] = [];

	const sync = () => {
		const { keys, caretless } = editor.getEditorState().read($selectedWidgets);
		for (const key of marked) {
			if (!keys.has(key)) editor.getElementByKey(key)?.classList.remove(WIDGET_SELECTED_CLASS);
		}
		for (const key of keys) editor.getElementByKey(key)?.classList.add(WIDGET_SELECTED_CLASS);
		marked = [...keys];
		editor.getRootElement()?.classList.toggle(WIDGET_SELECTION_CLASS, caretless);
	};

	/**
	 * A press on a widget selects it, the way an arrow key onto it does.
	 *
	 * Clicking a thing is how a pointer says which one it means; without this a
	 * press did nothing at all, because the widget's content swallows pointer
	 * events, and the caret stayed wherever it had been.
	 *
	 * `pointerdown` rather than `click`, because the press is what moves the
	 * caret and it has to be stopped before it does — which also means focus
	 * never moves, so the editor is focused by hand.
	 */
	const onPointerDown = (event: PointerEvent) => {
		if (!editor.isEditable()) return;
		const target = event.target;
		if (!(target instanceof Element)) return;
		const element = target.closest(`.${WIDGET_CLASS}`);
		if (!element) return;
		// Inside the widget, because the editor's own surface is an ancestor of
		// every press and is itself `contenteditable`.
		const interactive = target.closest(INTERACTIVE);
		if (interactive !== null && element.contains(interactive)) return;
		if (overPassThrough(element, event)) return;

		event.preventDefault();
		editor.getRootElement()?.focus({ preventScroll: true });
		editor.update(() => {
			const node = $getNearestNodeFromDOMNode(element);
			if ($isWidgetNode(node)) $selectWidget(node);
		});
	};

	const plainArrow = (event: KeyboardEvent | null) =>
		!event || !(event.shiftKey || event.metaKey || event.altKey || event.ctrlKey);

	/**
	 * One arrow key: off the widget when one is selected, onto the widget when
	 * one is next, and out of the way otherwise.
	 *
	 * **Off** matters because Lexical's own answer is the point beside the
	 * widget, which no browser draws a caret for — so the press looks like it
	 * did nothing, and whatever the press after it does looks like a jump. The
	 * key is swallowed even when there was nowhere to go: a widget at the very
	 * top of the document has nothing to its left, and standing still is what
	 * the left arrow does at the start of a document. Letting it through instead
	 * is what put the caret on that undrawable point and, from there, at the end
	 * of the text.
	 *
	 * **Onto** is left to Lexical where it gets it right, which is the left
	 * arrow: `RangeSelection.modify` lands on a decorator and converts to a node
	 * selection by itself. The other three directions need `onto` here.
	 *
	 * Registered above `registerRichText`, whose own handlers would otherwise
	 * get there first.
	 */
	const arrow =
		(isBackward: boolean, onto: (() => boolean) | null) => (event: KeyboardEvent | null) => {
			if (!plainArrow(event)) return false;
			const widget = $selectedWidget();
			if (widget) {
				if (isBackward) $selectBeforeWidget(widget);
				else $selectAfterWidget(widget);
			} else if (onto === null || !onto()) {
				return false;
			}
			event?.preventDefault();
			return true;
		};

	return mergeRegister(
		editor.registerUpdateListener(sync),
		// A selection change does not always arrive as an update — clicking away
		// from the editor is the common one — so the command is watched too.
		editor.registerCommand(
			SELECTION_CHANGE_COMMAND,
			() => {
				sync();
				return false;
			},
			COMMAND_PRIORITY_LOW
		),
		editor.registerRootListener((rootElement, previousRootElement) => {
			previousRootElement?.removeEventListener('pointerdown', onPointerDown);
			rootElement?.addEventListener('pointerdown', onPointerDown);
		}),
		editor.registerCommand(KEY_ARROW_LEFT_COMMAND, arrow(true, null), COMMAND_PRIORITY_LOW),
		editor.registerCommand(
			KEY_ARROW_RIGHT_COMMAND,
			arrow(false, $selectWidgetAheadOfCaret),
			COMMAND_PRIORITY_LOW
		),
		editor.registerCommand(
			KEY_ARROW_UP_COMMAND,
			arrow(true, () => $selectWidgetOnAdjacentLine(true)),
			COMMAND_PRIORITY_LOW
		),
		editor.registerCommand(
			KEY_ARROW_DOWN_COMMAND,
			arrow(false, () => $selectWidgetOnAdjacentLine(false)),
			COMMAND_PRIORITY_LOW
		)
	);
}

/**
 * Which widgets are selected, and whether that leaves a caret anywhere.
 *
 * Two ways in. Arrowing onto a widget makes a `NodeSelection`: Lexical takes
 * the caret out of the text entirely and makes the node itself the selection,
 * which is why the next Backspace deletes the whole thing — there is no caret
 * then, hence `caretless`. Dragging across one makes an ordinary range that
 * happens to contain it, and a widget inside a selection is as selected as the
 * words either side of it; the caret still belongs to the range.
 *
 * A collapsed caret marks nothing, whatever it is next to. The caret stop
 * beside a widget is an ordinary text position, and marking that too made the
 * widget look selected across two presses of the arrow key, only one of which
 * meant it.
 *
 * Must be called inside a `read` or an `update`.
 */
function $selectedWidgets(): { keys: Set<string>; caretless: boolean } {
	const selection = $getSelection();
	if (selection === null) return { keys: new Set(), caretless: false };
	if ($isRangeSelection(selection) && selection.isCollapsed()) {
		return { keys: new Set(), caretless: false };
	}
	const keys = new Set(
		selection
			.getNodes()
			.filter($isWidgetNode)
			.map((node) => node.getKey())
	);
	return { keys, caretless: $isNodeSelection(selection) && keys.size > 0 };
}

/** The widget that is *the* selection, if one is. Inside a `read` or `update`. */
function $selectedWidget(): WidgetNode<unknown> | null {
	const selection = $getSelection();
	if (!$isNodeSelection(selection)) return null;
	return selection.getNodes().find($isWidgetNode) ?? null;
}

/**
 * Make the widget itself the selection.
 *
 * The one thing every gesture that lands on a widget ends with: the arrow keys
 * on either side, a line move from above or below, and a press. What it means
 * is that there is no caret — the widget is what is selected, and the next
 * Backspace deletes it.
 *
 * Must run inside an `editor.update()`.
 */
function $selectWidget(widget: LexicalNode): void {
	const selection = $createNodeSelection();
	selection.add(widget.getKey());
	$setSelection(selection);
}

/**
 * Move the caret off a selected widget to the left, somewhere it can be seen.
 *
 * The point immediately in front of a widget is drawn by nothing. Measured in
 * Chromium: a collapsed selection there produces no caret at all, because the
 * widget is a block and there is no line box in front of it to put one in. It
 * is a perfectly good model position, and Lexical picks it — so the press looks
 * like it did nothing, and whatever the next press does looks like a jump.
 * Reported twice, the second time as the caret warping to the end of the
 * message from an embed at the very top.
 *
 * So this skips it, for the nearest position that is actually drawn:
 *
 * - under a line break, the end of the line above;
 * - under an empty line, that line, whose own break gives it a line box;
 * - under another widget — two URLs on one line stack their previews — that
 *   widget, selected in turn;
 * - at the head of a block, the end of the block before it.
 *
 * When there is none of those the widget opens the document, nothing is to its
 * left, and the selection is left alone: the caller swallows the key, which is
 * what the left arrow does at the start of a document anyway.
 *
 * Must run inside an `editor.update()`.
 */
function $selectBeforeWidget(widget: LexicalNode): void {
	const previous = widget.getPreviousSibling();

	if ($isWidgetNode(previous)) {
		$selectWidget(previous);
		return;
	}

	if ($isLineBreakNode(previous)) {
		const before = previous.getPreviousSibling();
		if ($selectEndOf(before)) return;
		// Nothing on the line the break ends, so the break *is* that line and the
		// point in front of it is drawn. Anything else here would skip an empty
		// line the writer put in on purpose.
		const block = widget.getParent();
		const index = previous.getIndexWithinParent();
		if ($isElementNode(block)) block.select(index, index);
		return;
	}

	if ($selectEndOf(previous)) return;
	$selectEndOf(widget.getParent()?.getPreviousSibling() ?? null);
}

/**
 * And to the right, which is the same list in reverse: a widget stacked
 * underneath, the start of the line below, the empty line below, or the start
 * of the block after this one.
 *
 * Must run inside an `editor.update()`.
 */
function $selectAfterWidget(widget: LexicalNode): void {
	const next = widget.getNextSibling();

	if ($isWidgetNode(next)) {
		$selectWidget(next);
		return;
	}

	if ($isLineBreakNode(next)) {
		const after = next.getNextSibling();
		if ($isWidgetNode(after)) {
			$selectWidget(after);
			return;
		}
		if ($selectStartOf(after)) return;
		// Nothing on the line the break opens, so the point just past the break
		// is the empty line itself — which has a line box, and a caret.
		const block = widget.getParent();
		const index = next.getIndexWithinParent() + 1;
		if ($isElementNode(block)) block.select(index, index);
		return;
	}

	if ($selectStartOf(next)) return;
	$selectStartOf(widget.getParent()?.getNextSibling() ?? null);
}

/**
 * Going the other way: select the widget the caret is about to step in front of.
 *
 * The mirror of `$selectBeforeWidget`, and the same rule — the point directly
 * in front of a widget is not a place the caret may rest. Left alone it is one
 * in some browsers and not in others, which is how it was reported: arrow left
 * off a selected embed and back right again, and the caret stops beside it
 * before reaching it, so the way back takes one more press than the way out.
 *
 * Selecting the widget instead makes the two directions inverses of each other,
 * and it is what the writer meant: there is nothing on that row but the widget.
 *
 * What counts as "about to" has to allow for the positions in between that
 * nothing draws separately: the break ending the line the caret is on, and a
 * paragraph boundary. Those are crossed here, one apiece, so a second empty
 * line above the widget still stops the way it should.
 *
 * Returns false when the caret is not about to do any such thing, and the
 * caller then leaves the key alone. Must run inside an `editor.update()`.
 */
export function $selectWidgetAheadOfCaret(): boolean {
	const selection = $getSelection();
	if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

	const anchor = selection.anchor;
	const node = anchor.getNode();
	let next: LexicalNode | null;
	if (anchor.type === 'element') {
		next = $isElementNode(node) ? (node.getChildren()[anchor.offset] ?? null) : null;
		if (next === null) next = node.getNextSibling();
	} else {
		// Only from the very end of the text — anywhere else there are characters
		// to cross first.
		if (anchor.offset !== node.getTextContentSize()) return false;
		next = node.getNextSibling() ?? node.getParent()?.getNextSibling() ?? null;
		// The break that ends the line the caret is already on. The position
		// after it is drawn at the end of that same line, so hopping it skips
		// nothing anyone can see — and not hopping it is what made the way back
		// take a press more than the way out when an empty line sat above the
		// widget. A *second* empty line still stops, because only one break is
		// crossed here.
		if ($isLineBreakNode(next)) next = next.getNextSibling();
	}
	// A block boundary, when the paragraph the caret is in has run out: what
	// matters is whether the next one opens with a widget.
	if ($isElementNode(next) && next.getParent() === $getRoot()) next = next.getFirstChild();
	// And the break that leads onto the widget's own row.
	if ($isLineBreakNode(next)) next = next.getNextSibling();
	if (!$isWidgetNode(next)) return false;

	$selectWidget(next);
	return true;
}

/**
 * The up and down arrows, for the row a widget has to itself.
 *
 * A widget is a block on a row of its own, and that row holds no text position
 * — so a line move over it lands on the row beyond, and the widget is the one
 * thing in the document the arrow keys cannot reach. Reported as pressing up
 * from the line below an embed jumping to the line above it.
 *
 * So the move is intercepted when the next row along is a widget's, and the
 * widget becomes the selection instead. That is where the caret was heading
 * anyway; it just had nowhere to be drawn when it got there.
 *
 * **Wrapping is why this asks the browser rather than only reading the model.**
 * A long URL takes two rows on screen and is still one line to Lexical, so
 * "the line above" in the model is not the row above on screen, and hijacking
 * the press from the second row would jump the caret clean out of the line it
 * is in. `Selection.modify` is the only thing that knows where the rows are:
 * it is asked where a line move would land, the answer is put back, and the
 * press is taken over only if it was going to leave this line anyway. Lexical
 * probes the same way for its own block decorators.
 *
 * Returns false when the adjacent row is not a widget's, and the caller then
 * leaves the key alone. Must run inside an `editor.update()`.
 */
function $selectWidgetOnAdjacentLine(isBackward: boolean): boolean {
	const selection = $getSelection();
	if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

	const widget = $widgetOnAdjacentLine(selection.anchor, isBackward);
	if (widget === null) return false;
	if (!lineMoveLeavesThisLine($getEditor(), widget, isBackward)) return false;

	$selectWidget(widget);
	return true;
}

/** The widget that has the row above (or below) the caret to itself, if one has. */
function $widgetOnAdjacentLine(anchor: PointType, isBackward: boolean): LexicalNode | null {
	const node = anchor.getNode();
	let block: LexicalNode | null;
	let from: LexicalNode | null;
	if (anchor.type === 'element') {
		if (!$isElementNode(node)) return null;
		block = node;
		// The children either side of the caret: scanning starts outside it.
		from = node.getChildren()[isBackward ? anchor.offset - 1 : anchor.offset] ?? null;
	} else {
		// Up from the text itself to whatever sits on the line — a link wraps the
		// text of a URL, and it is the link that has line breaks for siblings.
		const item = $lineItem(node);
		if (item === null) return null;
		block = item.getParent();
		from = isBackward ? item.getPreviousSibling() : item.getNextSibling();
	}

	// What bounds the caret's row on that side. A widget is a block, so it takes
	// a row of its own wherever it sits — which is why a widget *on this line*
	// counts: in an embed's case the link that produced it is its line-mate in
	// the model and its downstairs neighbour on screen. Failing that, the break
	// that ends the line, and then whatever had the last row of the line beyond.
	const step = (item: LexicalNode) =>
		isBackward ? item.getPreviousSibling() : item.getNextSibling();
	let edge = from;
	while (edge !== null && !$isLineBreakNode(edge) && !$isWidgetNode(edge)) {
		edge = step(edge);
	}

	if ($isWidgetNode(edge)) return edge;
	if (edge !== null) {
		const beyond = step(edge);
		return $isWidgetNode(beyond) ? beyond : null;
	}

	// No break that way, so the caret is on the first or last line of its block
	// and the row beyond it belongs to the block next door.
	const beside = isBackward ? block?.getPreviousSibling() : block?.getNextSibling();
	const end = $isElementNode(beside)
		? isBackward
			? beside.getLastChild()
			: beside.getFirstChild()
		: (beside ?? null);
	return $isWidgetNode(end) ? end : null;
}

/** The node on the line — the child of the block that `node` sits inside. */
function $lineItem(node: LexicalNode): LexicalNode | null {
	let current: LexicalNode | null = node;
	while (current !== null) {
		const parent: LexicalNode | null = current.getParent();
		if (parent === null) return null;
		if (parent.getParent() === $getRoot()) return current;
		current = parent;
	}
	return null;
}

/**
 * Asks the browser where a line move from here would actually land.
 *
 * Landing past the widget means the model's "next line" really is the next row
 * on screen. Landing short of it means this line wraps and the move belongs to
 * the row above or below within it — see the note on
 * `$selectWidgetOnAdjacentLine`.
 *
 * The probe moves the real selection and puts it straight back, which is what
 * Lexical does for the same question; nothing is repainted in between because
 * this all happens inside one update.
 *
 * With no `modify` to ask — jsdom, or a selection that is not in the document —
 * the model's answer stands.
 */
function lineMoveLeavesThisLine(
	editor: LexicalEditor,
	widget: LexicalNode,
	isBackward: boolean
): boolean {
	const root = editor.getRootElement();
	const domSelection = root?.ownerDocument.defaultView?.getSelection() ?? null;
	if (!domSelection || domSelection.rangeCount === 0 || typeof domSelection.modify !== 'function') {
		return true;
	}

	const { anchorNode, anchorOffset, focusNode, focusOffset } = domSelection;
	domSelection.modify('move', isBackward ? 'backward' : 'forward', 'line');
	const landed = domSelection.anchorNode;
	// An element landing point says which child it is beside, and that child may
	// be the widget's own element — the point in front of it is where a line move
	// over a widget tends to stop.
	const target =
		landed !== null && landed.nodeType === 1
			? (landed.childNodes[domSelection.anchorOffset] ?? landed)
			: landed;
	const moved = target === null ? null : $getNearestNodeFromDOMNode(target);
	if (anchorNode !== null) {
		domSelection.setBaseAndExtent(anchorNode, anchorOffset, focusNode ?? anchorNode, focusOffset);
	}

	if (moved === null) return false;
	return isBackward ? !widget.isBefore(moved) : !moved.isBefore(widget);
}

/** Whether the press landed over something the widget hands its presses to. */
function overPassThrough(element: Element, event: PointerEvent): boolean {
	for (const frame of element.querySelectorAll(PASS_THROUGH)) {
		const rect = frame.getBoundingClientRect();
		// A box with no size has not been laid out — jsdom, or content still
		// loading — and cannot have been pressed.
		if (rect.width === 0 || rect.height === 0) continue;
		if (
			event.clientX >= rect.left &&
			event.clientX <= rect.right &&
			event.clientY >= rect.top &&
			event.clientY <= rect.bottom
		) {
			return true;
		}
	}
	return false;
}

/** Puts the caret at the start of `node`, if it is something that has a start. */
function $selectStartOf(node: LexicalNode | null): boolean {
	if ($isTextNode(node)) {
		node.select(0, 0);
		return true;
	}
	if ($isElementNode(node)) {
		node.selectStart();
		return true;
	}
	return false;
}

/** Puts the caret at the end of `node`, if it is something that has an end. */
function $selectEndOf(node: LexicalNode | null): boolean {
	if ($isTextNode(node)) {
		node.select(node.getTextContentSize(), node.getTextContentSize());
		return true;
	}
	if ($isElementNode(node)) {
		node.selectEnd();
		return true;
	}
	return false;
}
