import type { LexicalEditor } from 'lexical';

/**
 * The scene designer's blocks, as editor nodes (`./section`, `./menu`,
 * `./menu-line`): a section (signals, limits,
 * aftercare…) holding ordinary paragraphs and lists, and a menu of lines,
 * each a course's heading or an item under it. See docs/scenes.md, "Blocks".
 *
 * **Element nodes, not decorator blocks.** Their text is ordinary Lexical
 * text, so `@lexical/yjs` merges two people typing in the same menu
 * character by character, where a decorator's data is one property that the
 * last writer replaces whole. It is also what makes "back to text" lossless:
 * a block is only a wrapper around lines someone wrote.
 *
 * Every property is set in the constructor with a default, because
 * `@lexical/yjs` builds a node with `new klass()` and learns which
 * properties to sync from the instance; and every setter replaces a value
 * rather than changing it in place, because it syncs by identity.
 *
 * Section and menu are shadow roots, as the playground's layout and
 * collapsible containers are: the caret, Enter and a paste treat them as a
 * small document of their own, so a line added inside one stays inside it.
 */

/**
 * Who is looking at each editor, so a block hidden from them is drawn as a
 * surprise. Set by the scene's page; an editor with no viewer (a version
 * preview being built headless) hides nothing.
 */
const viewers = new WeakMap<LexicalEditor, string>();

export function setSceneViewer(editor: LexicalEditor, viewerId: string | null): void {
	if (viewerId) {
		viewers.set(editor, viewerId);
	} else {
		viewers.delete(editor);
	}
}

export function sceneViewerOf(editor: LexicalEditor): string | null {
	return viewers.get(editor) ?? null;
}

/**
 * Editors whose menus' to-dos can be ticked while the editor is read-only:
 * a menu's own page, shown to someone who could edit it (docs/scenes.md,
 * "A menu's own page"). Ticking is a change like any other, made through
 * `editor.update`, which a read-only editor still sends to the scene.
 */
const tickable = new WeakSet<LexicalEditor>();

export function setTickable(editor: LexicalEditor, ticks: boolean): void {
	if (ticks) {
		tickable.add(editor);
	} else {
		tickable.delete(editor);
	}
	// For the stylesheet, which shows a hand over a box only where it ticks.
	editor.getRootElement()?.classList.toggle('tickable', ticks);
}

/** Whether a to-do in `editor` can be ticked: always where it can be edited. */
export function canTick(editor: LexicalEditor): boolean {
	return editor.isEditable() || tickable.has(editor);
}

/** Marks an element as a surprise for this viewer: nothing in it can be read, reached or typed into. */
export function drawSurprise(element: HTMLElement, surprise: boolean): void {
	element.classList.toggle('surprise', surprise);
	if (surprise) {
		element.setAttribute('contenteditable', 'false');
		element.setAttribute('aria-label', 'A surprise');
	} else {
		element.removeAttribute('contenteditable');
		element.removeAttribute('aria-label');
	}
}
