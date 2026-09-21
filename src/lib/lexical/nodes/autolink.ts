import type { EditorConfig, LexicalEditor } from 'lexical';
import { AutoLinkNode } from '@lexical/link';
import { innerLink, withEmbedOffer } from './shared/embed-offer';
import type { EditorNodeDefinition } from './index';

/**
 * Lexical's `AutoLinkNode`, extended with an "Add embed" button.
 *
 * Nothing else changes: this subclass only wraps the link's `<a>` together
 * with the button (see `shared/embed-offer.ts`). The editor uses it wherever
 * an `AutoLinkNode` would be created, through node replacement.
 *
 * An unlinked auto-link is drawn as plain text, so it gets no button.
 */
export class EditorAutoLinkNode extends AutoLinkNode {
	$config() {
		return this.config('editor-autolink', { extends: AutoLinkNode });
	}

	createDOM(config: EditorConfig, editor?: LexicalEditor): HTMLElement {
		const anchor = super.createDOM(config);
		return editor && !this.getIsUnlinked() ? withEmbedOffer(anchor, this.getKey(), editor) : anchor;
	}

	updateDOM(prevNode: this, dom: HTMLAnchorElement | HTMLSpanElement, config: EditorConfig) {
		return super.updateDOM(prevNode, innerLink(dom), config);
	}

	getDOMSlot(element: HTMLElement) {
		return super.getDOMSlot(element).withElement(innerLink(element));
	}
}

export const editorAutoLinkNode: EditorNodeDefinition = {
	klass: EditorAutoLinkNode,
	type: 'editor-autolink',
	storedType: 'autolink',
	replacement: {
		replace: AutoLinkNode,
		with: (node: AutoLinkNode) =>
			new EditorAutoLinkNode(node.getURL(), {
				isUnlinked: node.getIsUnlinked(),
				rel: node.getRel(),
				target: node.getTarget(),
				title: node.getTitle()
			}),
		withKlass: EditorAutoLinkNode
	}
};
