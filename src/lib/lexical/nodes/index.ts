import type {
	Klass,
	LexicalEditor,
	LexicalNode,
	LexicalNodeConfig,
	LexicalNodeReplacement,
	SerializedEditorState,
	SerializedLexicalNode
} from 'lexical';
import { editorAutoLinkNode } from './autolink';
import { editorLinkNode } from './link';

/**
 * Editor-only nodes: subclasses of stored node types that change how the
 * editor draws or behaves, and never reach a stored document.
 *
 * Each lives in its own file and describes itself with one of these. Adding
 * one means a new file here and a line in `EDITOR_NODE_DEFINITIONS`; the
 * editor's node config and the export mapping both follow from that list.
 *
 * Why they need `type` and `storedType`: Lexical keys registered nodes by type
 * name and refuses a second class under a name that is taken, so a subclass
 * has to serialise under a name of its own. `exportEditorDocument` maps it
 * back to `storedType`, so nothing about the stored format changes.
 */
export type EditorNodeDefinition = {
	klass: Klass<LexicalNode>;
	/** The subclass's own type name, as it appears in the editor's JSON. */
	type: string;
	/** The stored type it stands in for, and is exported as. */
	storedType: string;
	/** Swaps the stored class for this one wherever Lexical creates a node. */
	replacement: LexicalNodeReplacement;
};

const EDITOR_NODE_DEFINITIONS: readonly EditorNodeDefinition[] = [
	editorLinkNode,
	editorAutoLinkNode
];

/**
 * What `createRichTextEditor` registers on top of the stored node set: each
 * class, plus the replacement that makes Lexical create it in place of the
 * stored one.
 */
export const EDITOR_NODE_REPLACEMENTS: readonly LexicalNodeConfig[] =
	EDITOR_NODE_DEFINITIONS.flatMap((definition) => [definition.klass, definition.replacement]);

const STORED_TYPE_FOR = new Map(
	EDITOR_NODE_DEFINITIONS.map((definition) => [definition.type, definition.storedType])
);

/**
 * The editor's document in its stored form: `editorState.toJSON()` with every
 * editor-only type renamed to the stored type it stands in for. Anything that
 * reads an editor's JSON goes through this, never `toJSON()` directly — the
 * schema rejects the editor-only names.
 */
export function exportEditorDocument(editor: LexicalEditor): SerializedEditorState {
	const rename = (node: SerializedLexicalNode): SerializedLexicalNode => {
		const { children } = node as { children?: SerializedLexicalNode[] };
		const type = STORED_TYPE_FOR.get(node.type) ?? node.type;
		if (!children && type === node.type) {
			return node;
		}
		return { ...node, type, ...(children ? { children: children.map(rename) } : {}) };
	};
	const state = editor.getEditorState().toJSON();
	return { ...state, root: rename(state.root) as SerializedEditorState['root'] };
}
