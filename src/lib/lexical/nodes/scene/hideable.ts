import type { LexicalNode } from 'lexical';
import { $isMenuNode, type MenuNode } from './menu';
import { $isMenuLineNode, type MenuLineNode } from './menu-line';
import { $isSceneSectionNode, type SceneSectionNode } from './section';

/** Any scene block that can be hidden from the partner. */
export type HideableSceneNode = SceneSectionNode | MenuNode | MenuLineNode;

export function $isHideableSceneNode(
	node: LexicalNode | null | undefined
): node is HideableSceneNode {
	return $isSceneSectionNode(node) || $isMenuNode(node) || $isMenuLineNode(node);
}
