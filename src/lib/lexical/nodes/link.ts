import type { EditorConfig, LexicalEditor } from 'lexical';
import { LinkNode } from '@lexical/link';
import { innerLink, withEmbedOffer } from './shared/embed-offer';
import type { EditorNodeDefinition } from './index';

/**
 * Lexical's `LinkNode`, extended with an "Add embed" button.
 *
 * Nothing else changes: this subclass only wraps the link's `<a>` together
 * with the button (see `shared/embed-offer.ts`). The editor uses it wherever
 * a `LinkNode` would be created, through node replacement.
 */
export class EditorLinkNode extends LinkNode {
	$config() {
		return this.config('editor-link', { extends: LinkNode });
	}

	createDOM(config: EditorConfig, editor?: LexicalEditor): HTMLElement {
		const anchor = super.createDOM(config);
		return editor ? withEmbedOffer(anchor, this.getKey(), editor) : anchor;
	}

	updateDOM(prevNode: this, dom: HTMLAnchorElement | HTMLSpanElement, config: EditorConfig) {
		return super.updateDOM(prevNode, innerLink(dom), config);
	}

	getDOMSlot(element: HTMLElement) {
		return super.getDOMSlot(element).withElement(innerLink(element));
	}
}

export const editorLinkNode: EditorNodeDefinition = {
	klass: EditorLinkNode,
	type: 'editor-link',
	storedType: 'link',
	replacement: {
		replace: LinkNode,
		with: (node: LinkNode) =>
			new EditorLinkNode(node.getURL(), {
				rel: node.getRel(),
				target: node.getTarget(),
				title: node.getTitle()
			}),
		withKlass: EditorLinkNode
	}
};
