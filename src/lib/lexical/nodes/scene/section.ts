import {
	$applyNodeReplacement,
	type EditorConfig,
	ElementNode,
	type LexicalEditor,
	type LexicalNode,
	type LexicalUpdateJSON,
	type NodeKey,
	type SerializedElementNode,
	type Spread
} from 'lexical';
import {
	isSceneSection,
	isSurpriseFor,
	type SceneSection,
	SECTION_LABELS
} from '$lib/scenes/blocks';
import { drawSurprise, sceneViewerOf } from './viewer';

/**
 * A scene's section (signals, limits, aftercare…): ordinary paragraphs and
 * lists inside a labelled block. See `./viewer` for how the scene nodes are
 * built, and docs/scenes.md, "Blocks".
 */

export type SerializedSceneSectionNode = Spread<
	{ section: SceneSection; hiddenFrom: string | null },
	SerializedElementNode
>;

export class SceneSectionNode extends ElementNode {
	__section: SceneSection;
	__hiddenFrom: string | null;

	static getType(): string {
		return 'scene-section';
	}

	static clone(node: SceneSectionNode): SceneSectionNode {
		return new SceneSectionNode(node.__section, node.__hiddenFrom, node.__key);
	}

	static importJSON(serialised: SerializedSceneSectionNode): SceneSectionNode {
		return $createSceneSectionNode(
			isSceneSection(serialised.section) ? serialised.section : 'notes'
		).updateFromJSON(serialised);
	}

	constructor(section: SceneSection = 'notes', hiddenFrom: string | null = null, key?: NodeKey) {
		super(key);
		this.__section = section;
		this.__hiddenFrom = hiddenFrom;
	}

	override updateFromJSON(serialised: LexicalUpdateJSON<SerializedSceneSectionNode>): this {
		return super
			.updateFromJSON(serialised)
			.setHiddenFrom(typeof serialised.hiddenFrom === 'string' ? serialised.hiddenFrom : null);
	}

	createDOM(_config: EditorConfig, editor: LexicalEditor): HTMLElement {
		const element = document.createElement('section');
		element.className = 'scene-block scene-section';
		element.dataset.section = this.__section;
		element.dataset.label = SECTION_LABELS[this.__section];
		drawSurprise(element, isSurpriseFor(this.__hiddenFrom, sceneViewerOf(editor)));
		element.classList.toggle('only-me', this.__hiddenFrom !== null);
		return element;
	}

	updateDOM(previous: SceneSectionNode): boolean {
		return previous.__section !== this.__section || previous.__hiddenFrom !== this.__hiddenFrom;
	}

	getSection(): SceneSection {
		return this.getLatest().__section;
	}

	setSection(section: SceneSection): this {
		const self = this.getWritable();
		self.__section = section;
		return self;
	}

	getHiddenFrom(): string | null {
		return this.getLatest().__hiddenFrom;
	}

	setHiddenFrom(hiddenFrom: string | null): this {
		const self = this.getWritable();
		self.__hiddenFrom = hiddenFrom;
		return self;
	}

	override isShadowRoot(): boolean {
		return true;
	}

	override canBeEmpty(): false {
		return false;
	}

	override canIndent(): false {
		return false;
	}

	override exportJSON(): SerializedSceneSectionNode {
		return {
			...super.exportJSON(),
			section: this.__section,
			hiddenFrom: this.__hiddenFrom
		};
	}
}

export function $createSceneSectionNode(
	section: SceneSection,
	hiddenFrom: string | null = null
): SceneSectionNode {
	return $applyNodeReplacement(new SceneSectionNode(section, hiddenFrom));
}

export function $isSceneSectionNode(
	node: LexicalNode | null | undefined
): node is SceneSectionNode {
	return node instanceof SceneSectionNode;
}
