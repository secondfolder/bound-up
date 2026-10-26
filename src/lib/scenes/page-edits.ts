/**
 * Putting what the prompt column offers onto a scene's page, as an ordinary
 * edit: it reaches the partner live, and Ctrl+Z takes it back.
 *
 * BROWSER ONLY: it drives a Lexical editor.
 */

import {
	$createParagraphNode as createParagraphNode,
	$createTextNode as createTextNode,
	$getRoot as getRoot,
	$getSelection as getSelection,
	$isParagraphNode as isParagraphNode,
	$isRangeSelection as isRangeSelection,
	type LexicalEditor
} from 'lexical';

/**
 * Adds `text` as a line of its own, under the line the caret is on, or at
 * the end when the caret is not in the page, and leaves the caret at its
 * end, so someone who added "Afterwards: " can carry straight on typing. An
 * empty line where the caret sits is filled rather than left above.
 */
export function addLine(editor: LexicalEditor, text: string): void {
	editor.update(() => {
		const selection = getSelection();
		const here = isRangeSelection(selection)
			? selection.anchor.getNode().getTopLevelElement()
			: getRoot().getLastChild();
		if (isParagraphNode(here) && here.getTextContentSize() === 0) {
			here.append(createTextNode(text));
			here.selectEnd();
			return;
		}
		const line = createParagraphNode().append(createTextNode(text));
		if (here) {
			here.insertAfter(line);
		} else {
			getRoot().append(line);
		}
		line.selectEnd();
	});
	editor.focus();
}

/** The page's text, for working out what it mentions. */
export function pageText(editor: LexicalEditor): string {
	return editor.getEditorState().read(() => getRoot().getTextContent());
}
