import {
	$getNodeByKey,
	createCommand,
	setDOMUnmanaged,
	type LexicalCommand,
	type LexicalEditor,
	type NodeKey
} from 'lexical';
import { $isLinkNode } from '@lexical/link';

/**
 * The DOM half of a link's "Add embed" button, shared by `EditorLinkNode` and
 * `EditorAutoLinkNode`. They cannot share it through a common base class,
 * because each has to extend its own `@lexical/link` class to keep that
 * class's behaviour.
 *
 * The button is the way back from a removed embed. Deletion is sticky on
 * purpose (see `trackEmbedDismissals`), so there has to be a gesture that
 * means "actually, do embed this one", and hovering the link is it. The button
 * is part of the link's own DOM, so the link, not a pointer handler, decides
 * whether it shows and where: CSS in `RichTextEditor.svelte` reveals it on
 * `:hover`, and only while `registerEmbedOffers` has marked the link with
 * `EMBED_OFFER_CLASS`. Being inside the link's wrapper also means the pointer
 * never stops hovering on its way from the link to the button.
 *
 * Pointer-only, and that is a real gap for keyboard users, but the caret
 * cannot be the trigger: moving it onto and off a link is exactly the gesture
 * that must *not* re-embed.
 */

/**
 * Dispatched with the link's URL when its button is pressed. The editor's host
 * answers it, because putting the embed back also lifts the dismissal, and the
 * dismissals live in the component.
 */
export const ADD_EMBED_COMMAND: LexicalCommand<string> = createCommand('ADD_EMBED_COMMAND');

/** On a link's wrapper while its button has an embed to offer. */
export const EMBED_OFFER_CLASS = 'embed-available';

const LINK_WRAPPER_CLASS = 'link-with-embed-offer';

/**
 * Wrap a freshly drawn `<a>` so it carries its own embed button.
 *
 * A wrapper rather than a button inside the anchor: interactive content inside
 * an `<a>` is invalid, and the anchor's children are Lexical's to reconcile.
 * The nodes' `getDOMSlot` points Lexical at the anchor (via `innerLink`), so
 * the button sits beside the children Lexical manages rather than among them.
 */
export function withEmbedOffer(
	anchor: HTMLElement,
	key: NodeKey,
	editor: LexicalEditor
): HTMLElement {
	const wrapper = document.createElement('span');
	wrapper.className = LINK_WRAPPER_CLASS;

	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'embed-again';
	button.contentEditable = 'false';
	button.setAttribute('aria-label', 'Add embed');
	button.title = 'Add embed';
	// A plus beside the embed icon: the icon alone says "embed", which reads as
	// a state ("this has one") rather than as the action the button performs.
	for (const name of ['plus', 'image']) {
		const icon = document.createElement('wa-icon');
		icon.setAttribute('name', name);
		icon.setAttribute('variant', 'solid');
		button.append(icon);
	}
	// Keeps the caret where it was: a press inside the editor moves it, and the
	// sweep treats "the caret is in this link" as "still typing".
	button.addEventListener('pointerdown', (event) => event.preventDefault());
	button.addEventListener('click', (event) => {
		event.preventDefault();
		// Read at click time, not captured: an auto-link retargets as its text
		// is edited, and `updateDOM` does not rebuild the button when it does.
		const url = editor.read(() => {
			const link = $getNodeByKey(key);
			return $isLinkNode(link) ? link.getURL() : null;
		});
		if (url) editor.dispatchCommand(ADD_EMBED_COMMAND, url);
	});
	// Tells Lexical this element is not document content, so its mutation
	// observer leaves it alone and a DOM point inside it maps to no node.
	setDOMUnmanaged(button);

	wrapper.append(anchor, button);
	return wrapper;
}

/** The anchor inside a wrapper, or the element itself when it was not wrapped. */
export function innerLink(dom: HTMLElement): HTMLAnchorElement | HTMLSpanElement {
	const inner = dom.classList.contains(LINK_WRAPPER_CLASS) ? dom.firstElementChild : dom;
	return inner as HTMLAnchorElement | HTMLSpanElement;
}
