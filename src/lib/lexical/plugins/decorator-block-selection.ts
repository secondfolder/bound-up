import { mergeRegister } from '@lexical/utils';
import {
	$createNodeSelection,
	$getNearestNodeFromDOMNode,
	$getSelection,
	$isNodeSelection,
	$isRangeSelection,
	$setSelection,
	COMMAND_PRIORITY_LOW,
	KEY_ARROW_LEFT_COMMAND,
	KEY_ARROW_UP_COMMAND,
	type LexicalEditor,
	type LexicalNode,
	SELECTION_CHANGE_COMMAND
} from 'lexical';
import { $isDecoratorBlockNode, DECORATOR_BLOCK_CLASS } from '$lib/lexical/nodes/decorator-block';

/**
 * The two things Lexical leaves to whoever is drawing a decorator block: saying
 * on screen that one is selected, and selecting one when it is pressed.
 *
 * Everything else about a block — the arrow keys, the line moves, the block
 * cursor — is Lexical's own, and comes from the node being a `DecoratorBlockNode`
 * at the root. See the note there.
 *
 * Selecting on a press is nobody's job in Lexical at any level: the playground
 * does it inside each decorator's own React component, with
 * `useLexicalNodeSelection`. Here one listener does it for every block, which is
 * what keeps a new kind of block from having to think about it.
 */

/** On the block that is selected, if one is. */
const SELECTED_CLASS = 'is-selected';

/**
 * On the editor's root element while a block is *the* selection.
 *
 * There is no caret then — the node is the selection — but Lexical clears the
 * DOM selection for a node selection and the browser answers by parking one at
 * the very start of the field, which reads as the caret having jumped to the
 * top. The editor hides its caret while this is set.
 */
const CARETLESS_CLASS = 'block-selected';

/**
 * A press over one of these is left alone: it belongs to what is inside it.
 *
 * Tested by geometry rather than by the event's target, because a block's
 * content is `pointer-events: none` all through — a click in the editor belongs
 * to the editor, not to a video — so every press inside it lands on the block
 * element and the target says nothing about where.
 */
const PASS_THROUGH = 'iframe';

/** A press on one of these *inside a block* is that element's business. */
const INTERACTIVE = 'button, a, input, textarea, select, [contenteditable="true"]';

export function registerDecoratorBlockSelection(editor: LexicalEditor): () => void {
	/**
	 * Marks the selected blocks, and takes the caret off screen while a block
	 * *is* the selection.
	 *
	 * Classes on the elements rather than props on the mounted components: a
	 * block's component is its own root, mounted by the host framework, and
	 * passing reactive state into each one to say "you are selected" is a lot of
	 * machinery for one boolean the DOM can carry.
	 *
	 * `marked` is what was marked last time, because the document is not asked
	 * which blocks it holds — only which are selected — and the class has to
	 * come off the ones that no longer are.
	 */
	let marked: string[] = [];

	const sync = () => {
		const { keys, caretless } = editor.getEditorState().read($selectedBlocks);
		for (const key of marked) {
			if (!keys.has(key)) {
				editor.getElementByKey(key)?.classList.remove(SELECTED_CLASS);
			}
		}
		for (const key of keys) {
			editor.getElementByKey(key)?.classList.add(SELECTED_CLASS);
		}
		marked = [...keys];
		editor.getRootElement()?.classList.toggle(CARETLESS_CLASS, caretless);
	};

	/**
	 * A press on a block selects it, the way an arrow key onto it does.
	 *
	 * Clicking a thing is how a pointer says which one it means; without this a
	 * press did nothing at all, because the block's content swallows pointer
	 * events, and the caret stayed wherever it had been.
	 *
	 * `pointerdown` rather than `click`, because the press is what moves the
	 * caret and it has to be stopped before it does — which also means focus
	 * never moves, so the editor is focused by hand.
	 */
	const onPointerDown = (event: PointerEvent) => {
		if (!editor.isEditable()) {
			return;
		}
		const { target } = event;
		if (!(target instanceof Element)) {
			return;
		}
		const element = target.closest(`.${DECORATOR_BLOCK_CLASS}`);
		if (!element) {
			return;
		}
		// Inside the block, because the editor's own surface is an ancestor of
		// every press and is itself `contenteditable`.
		const interactive = target.closest(INTERACTIVE);
		if (interactive !== null && element.contains(interactive)) {
			return;
		}
		if (overPassThrough(element, event)) {
			return;
		}

		event.preventDefault();
		editor.getRootElement()?.focus({ preventScroll: true });
		editor.update(() => {
			const node = $getNearestNodeFromDOMNode(element);
			if ($isDecoratorBlockNode(node)) {
				$selectBlock(node);
			}
		});
	};

	/**
	 * Nothing above a block that opens the document, so the press does nothing.
	 *
	 * Lexical's answer is a block cursor: it parks a caret of its own above the
	 * block, because there is no line box there. That is the right answer in the
	 * middle of a document — it is where you type to put a line beside a block —
	 * but at the very top of a message it offers a row that is not there, and
	 * reported as exactly that: "I can move up again even though there shouldn't
	 * be a line". Standing still is what these keys do at the start of any
	 * document.
	 *
	 * Only that case: with anything above the block, the press is Lexical's and
	 * lands at the end of it.
	 */
	const stayAtTheTop = (event: KeyboardEvent | null) => {
		if (event && (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey)) {
			return false;
		}
		const selection = $getSelection();
		if (!$isNodeSelection(selection)) {
			return false;
		}
		const block = selection.getNodes().find($isDecoratorBlockNode);
		if (!block || block.getPreviousSibling() !== null) {
			return false;
		}
		event?.preventDefault();
		return true;
	};

	return mergeRegister(
		editor.registerUpdateListener(sync),
		editor.registerCommand(KEY_ARROW_UP_COMMAND, stayAtTheTop, COMMAND_PRIORITY_LOW),
		editor.registerCommand(KEY_ARROW_LEFT_COMMAND, stayAtTheTop, COMMAND_PRIORITY_LOW),
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
		})
	);
}

/**
 * Which blocks are selected, and whether that leaves a caret anywhere.
 *
 * Two ways in. Arrowing onto a block makes a `NodeSelection`: Lexical takes
 * the caret out of the text entirely and makes the node itself the selection,
 * which is why the next Backspace deletes the whole thing — there is no caret
 * then, hence `caretless`. Dragging across one makes an ordinary range that
 * happens to contain it, and a block inside a selection is as selected as the
 * words either side of it; the caret still belongs to the range.
 *
 * A collapsed caret marks nothing, whatever it is next to. The caret stop
 * beside a block is an ordinary text position, and marking that too made the
 * block look selected across two presses of the arrow key, only one of which
 * meant it.
 *
 * Must be called inside a `read` or an `update`.
 */
function $selectedBlocks(): { keys: Set<string>; caretless: boolean } {
	const selection = $getSelection();
	if (selection === null) {
		return { keys: new Set(), caretless: false };
	}
	if ($isRangeSelection(selection) && selection.isCollapsed()) {
		return { keys: new Set(), caretless: false };
	}
	const keys = new Set(
		selection
			.getNodes()
			.filter($isDecoratorBlockNode)
			.map((node) => node.getKey())
	);
	return { keys, caretless: $isNodeSelection(selection) && keys.size > 0 };
}

/**
 * Make the block itself the selection.
 *
 * The one thing every gesture that lands on a block ends with: the arrow keys
 * on either side, a line move from above or below, and a press. What it means
 * is that there is no caret — the block is what is selected, and the next
 * Backspace deletes it.
 *
 * Must run inside an `editor.update()`.
 */
function $selectBlock(block: LexicalNode): void {
	const selection = $createNodeSelection();
	selection.add(block.getKey());
	$setSelection(selection);
}

/** Whether the press landed over something the block hands its presses to. */
function overPassThrough(element: Element, event: PointerEvent): boolean {
	for (const frame of element.querySelectorAll(PASS_THROUGH)) {
		const rect = frame.getBoundingClientRect();
		// A box with no size has not been laid out — jsdom, or content still
		// loading — and cannot have been pressed.
		if (rect.width === 0 || rect.height === 0) {
			continue;
		}
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
